"""Collect RSS metadata only. No offer list or financial rules are hardcoded."""
import datetime as dt
import email.utils
import html
import json
import re
import sys
import hashlib
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from pathlib import Path

SOURCE = 'https://www.doctorofcredit.com/category/bank-account-bonuses/feed/'
SOURCES = (
    {'id': 'doc', 'name': 'Doctor of Credit', 'urls': [SOURCE], 'hosts': ['www.doctorofcredit.com']},
    {'id': 'fm', 'name': 'Frequent Miler', 'urls': ['https://frequentmiler.com/tag/bank-account-bonuses/feed/', 'https://feeds.feedburner.com/FrequentMiler?format=xml'], 'hosts': ['frequentmiler.com']},
    {'id': 'hmb', 'name': 'Hustler Money Blog', 'urls': ['https://www.hustlermoneyblog.com/category/bank-promotions/feed/'], 'hosts': ['www.hustlermoneyblog.com']},
)
PUBLISHED = 'https://load66.github.io/bonus-tracker/data/bank-bonuses.json'
OUTPUT = Path(__file__).resolve().parents[1] / 'data/bank-bonuses.json'
VERIFICATION_URL = 'https://api-production-00f74.up.railway.app/public/bank-bonus-verification'

def attach_verification(payload, previous):
    last = previous.get('verification', {})
    snapshot = {'schemaVersion':1,'status':'unavailable','records':last.get('records',{}),'checkedAt':last.get('checkedAt'),'usage':last.get('usage',{}),'coverage':last.get('coverage',[])}
    try:
        # Fixed public endpoint; no journal credentials or account data are sent.
        for attempt in range(13):
            result=json.loads(download(VERIFICATION_URL))
            if result.get('schemaVersion')!=1 or not isinstance(result.get('records'),dict):
                raise ValueError('Invalid evidence service response')
            if result.get('status')!='pending' or attempt==12:break
            time.sleep(10)
        if result.get('status')=='complete':
            records={}
            for offer in payload['offers']:
                record=result['records'].get(offer['url'])
                expected=hashlib.sha256((offer['title']+'\n'+offer['url']).encode()).hexdigest()
                if isinstance(record,dict) and record.get('offerFingerprint')==expected:
                    records[offer['url']]={**record,'offerTitle':offer['title'],'offerUrl':offer['url']}
            snapshot={'schemaVersion':1,'status':'complete','records':records,'checkedAt':result.get('checkedAt'),'usage':result.get('usage',{}),'coverage':result.get('coverage',[])}
        else:
            snapshot['status']='pending' if result.get('status')=='pending' else 'unavailable'
    except Exception:
        pass
    payload['verification']=snapshot
    print('Official evidence service:', snapshot['status'], len(snapshot['records']), 'matching records')
    return payload

AVAILABILITY_URL = 'https://api-production-00f74.up.railway.app/public/bank-bonus-availability'

def attach_availability(payload, previous):
    # Preserve timestamps and exact identity; old scope cannot become freshly verified.
    last=previous.get('availability',{})
    last=last if isinstance(last,dict) else {}
    snapshot={'schemaVersion':1,'status':'unavailable','records':last.get('records',{}),'checkedAt':last.get('checkedAt')}
    try:
        result=json.loads(download(AVAILABILITY_URL))
        if result.get('schemaVersion')!=1 or result.get('status') not in ('complete','pending','unavailable') or not isinstance(result.get('records'),dict):raise ValueError('Invalid availability response')
        records={}
        for offer in payload['offers']:
            r=result['records'].get(offer['url'])
            expected=hashlib.sha256((offer['title']+'\n'+offer['url']).encode()).hexdigest()
            if isinstance(r,dict) and r.get('offerFingerprint')==expected and r.get('offerTitle')==offer['title'] and r.get('offerUrl')==offer['url']:records[offer['url']]=r
        snapshot={'schemaVersion':1,'status':result['status'],'checkedAt':result.get('checkedAt'),'records':records,'coverage':result.get('coverage',{})}
    except Exception:pass
    payload['availability']=snapshot
    return payload

# This list deliberately identifies only known aliases. Unknown institutions remain
# distinct unless their actual names normalize identically.
BANK_ALIASES = (
    ('JPMorgan Chase', ('jpmorgan chase', 'jp morgan chase', 'chase bank', 'chase')),
    ('U.S. Bank', ('u.s. bank', 'us bank', 'u s bank', 'usbank')),
    ('Wells Fargo', ('wells fargo',)),
    ('Bank of America', ('bank of america', 'bofa')),
    ('Citibank', ('citibank', 'citi bank', 'citi')),
    ('Capital One', ('capital one',)),
    ('Truist', ('truist',)),
    ('American Express', ('american express', 'amex')),
    ('PNC Bank', ('pnc bank', 'pnc')),
    ('Huntington Bank', ('huntington',)),
    ('Regions Bank', ('regions bank', 'regions')),
    ('KeyBank', ('keybank', 'key bank')),
    ('BMO', ('bmo bank', 'bmo')),
    ('Fifth Third', ('fifth third',)),
    ('SoFi', ('sofi',)),
)
STATE_CODES = set('AL AK AZ AR CA CO CT DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY DC'.split())
CATEGORIES = {'bank accounts', 'bank promotions', 'bank account bonuses', 'bank bonuses'}

def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', value or ''))).strip()

def ended_post(title):
    return bool(re.search(r'\b(?:expired|ended|offer (?:is )?(?:over|closed)|no longer available)\b', plain(title), re.I))

def bank_bonus(title, categories):
    text = plain(title).lower()
    if re.search(r'\b(credit card|brokerage|crypto|binance|bitcoin|tastytrade|robinhood|investment|ira|stock)\b', text):
        return False
    if re.search(r'\b(roundup|round-up|best bank|weekly|monthly|recap)\b', text) or ended_post(title):
        return False
    return bool(re.search(r'\b(checking|savings|bank|credit union|fcu|cu)\b', text)
                and re.search(r'\bbonus\b|\$\s*[\d,]+', text)
                and any(c.lower() in CATEGORIES for c in categories))

def safe_link(link, source):
    try:
        p = urlsplit(link)
        return (p.scheme == 'https' and p.hostname in source['hosts'] and
                not p.username and not p.password and p.port in (None, 443) and
                bool(p.path.strip('/')) and not p.query and not p.fragment)
    except ValueError:
        return False

def availability(title, categories, summary):
    # Geography comes from explicit source wording, never a bank's footprint.
    text = plain(summary)
    if re.search(r'\b(?:not|isn.t|no longer)\s+(?:available\s+)?nationwide\b|\b(?:nationwide|all 50 states)\s+(?:except|excluding)\b', title + ' ' + text, re.I):
        return 'unknown'
    national = bool(re.search(r'\bnationwide\b|\ball 50 states\b', title, re.I) or any(re.fullmatch(r'nationwide(?: bank bonuses)?', c, re.I) for c in categories) or re.search(r'\b(?:availability|available|eligible locations?)\s*:?\s*(?:nationwide|in all 50 states)\b', text, re.I))
    regional = bool(re.search(r'^\s*\[[^\]]*(?:\b[A-Z]{2}\b|only|counties)[^\]]*\]', title) or any(re.fullmatch(r'[a-z]{2} bank bonuses', c.lower()) for c in categories) or re.search(r'\b(?:select states|select counties|regional|state residents only)\b', title, re.I))
    return 'unknown' if national and regional else 'nationwide' if national else 'regional' if regional else 'unknown'

def title_key(title):
    text = plain(title).lower().replace('u.s.', 'us').replace('u.s', 'us')
    text = re.sub(r'\b(?:earn|get|new|bonus|offer|offers|with|a|an|the|up to)\b', ' ', text)
    return ' '.join(sorted(re.findall(r'[a-z0-9]+', text)))

def parse_expiry(title, summary=''):
    for value in (title, plain(summary)):
        m = re.search(r'\b(?:ends?|expires?|expiration(?: date)?|valid through)\s*(?:on|:)?\s*(\d{1,2})/(\d{1,2})/(\d{2,4})\b', value, re.I)
        if m:
            try:
                month, day, year = map(int, m.groups())
                return dt.date(year + 2000 if year < 100 else year, month, day).isoformat()
            except ValueError:
                continue
        m = re.search(r'\b(?:ends?|expires?|expiration(?: date)?|valid through)\s*(?:on|:)?\s*(\d{4})-(\d{2})-(\d{2})\b', value, re.I)
        if m:
            try:
                return dt.date(*map(int, m.groups())).isoformat()
            except ValueError:
                continue
        m = re.search(r'\b(?:ends?|expires?|expiration(?: date)?|valid through)\s*(?:on|:)?\s*([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b', value, re.I)
        if m:
            try:
                return dt.datetime.strptime(' '.join(m.groups()), '%B %d %Y').date().isoformat()
            except ValueError:
                try:
                    return dt.datetime.strptime(' '.join(m.groups()), '%b %d %Y').date().isoformat()
                except ValueError:
                    continue
    return None

def offer_identity(title, categories=(), summary=''):
    text = plain(title)
    # Determine region using explicit title restrictions. Unknown is NOT nationwide.
    regions = []
    for bracket in re.findall(r'\[([^\]]+)\]', text):
        if re.search(r'\b(?:only|in branch|branch|residents?)\b', bracket, re.I) or re.search(r'\b[A-Z]{2}\b', bracket):
            regions += [v for v in re.findall(r'\b[A-Z]{2}\b', bracket) if v in STATE_CODES]
    if not regions:
        for bracket in re.findall(r'\(([A-Z]{2}(?:\s*,\s*[A-Z]{2})*)\)', text):
            regions += [v for v in re.findall(r'\b[A-Z]{2}\b', bracket) if v in STATE_CODES]
    region = ','.join(sorted(set(regions))) if regions else ('US' if availability(text, categories, summary) == 'nationwide' else 'unknown')
    low = text.lower()
    if 'business' in low or re.search(r'\bcommercial\b', low):
        product = 'business'
    elif (re.search(r'\bchecking\b', low) and re.search(r'\bsavings?\b', low)) or re.search(r'\bcombo\b', low):
        product = 'combo'
    elif re.search(r'\bsavings?\b', low):
        product = 'savings'
    elif re.search(r'\bchecking\b', low):
        product = 'checking'
    else:
        return None
    nums = [int(n.replace(',', '')) for n in re.findall(r'\$\s*([\d,]+)(?![\d,])', text)]
    # Ambiguous tiered headlines must never merge with a single-amount offer.
    amount = nums[0] if len(nums) == 1 and 0 < nums[0] <= 100000 else None
    normalized = re.sub(r'[^a-z0-9 ]+', ' ', low)
    normalized = re.sub(r'\s+', ' ', normalized)
    bank = next((name for name, aliases in BANK_ALIASES if any(re.search(r'\b' + re.escape(alias).replace(r'\ ', r'\s+') + r'\b', low) for alias in aliases)), None)
    if not bank:
        without = re.sub(r'^(?:\s*(?:\(update\)|\[update\]|update[:\-]?|earn|get|new)\s*)+', '', text, flags=re.I)
        without = re.sub(r'^\s*\[[^\]]+\]\s*', '', without)
        before = re.split(r'\$\s*[\d,]+|\b(?:checking|savings?|business|promo(?:tion)?s?|offer|bonus|account)\b', without, 1, flags=re.I)[0]
        before = re.sub(r'\b(?:earn|up to|new|a|an|the)\b', ' ', before, flags=re.I)
        bank = re.sub(r'[^\w\s&.-]', ' ', before).strip(' :-,.')
        if len(bank) < 3 or len(bank) > 60:
            return None
        bank = re.sub(r'\s+', ' ', bank)
    return {'bank': bank, 'product': product, 'amount': amount, 'region': region}

def family_key(identity):
    return '|'.join((identity['bank'].casefold(), identity['product'], identity['region']))

def offer_id(identity, url=''):
    # Unknown/tiered amounts are isolated by URL to prevent accidental coalescing.
    key = family_key(identity) + '|' + (str(identity['amount']) if identity['amount'] is not None else 'unknown:' + url)
    return hashlib.sha256(key.encode()).hexdigest()[:24]

def parse_feed(raw, now, source=None):
    source = source or SOURCES[0]
    root = ET.fromstring(raw)
    if root.tag != 'rss' or root.find('channel') is None:
        raise ValueError('Expected an RSS channel')
    items = root.findall('./channel/item')
    if not items:
        raise ValueError('Source returned no RSS items')
    posts = {}
    for item in items:
        title = plain(item.findtext('title'))[:300]
        link = (item.findtext('link') or '').strip()
        cats = [c.text or '' for c in item.findall('category')]
        ended = ended_post(title)
        if not safe_link(link, source) or not (bank_bonus(title, cats) or ended and any(c.lower() in CATEGORIES for c in cats)):
            continue
        identity = offer_identity(title, cats, item.findtext('description'))
        if not identity:
            continue
        try:
            published = email.utils.parsedate_to_datetime(item.findtext('pubDate')).astimezone(dt.timezone.utc)
        except (TypeError, ValueError, AttributeError):
            continue
        if published > now or now - published > dt.timedelta(days=90):
            continue
        row = {'title': title, 'url': link, 'publishedAt': published.isoformat(), 'source': source['name'],
               'sourceId': source['id'], 'availability': availability(title, cats, item.findtext('description')),
               'groupKey': title_key(title), **identity,
               'expiresAt': parse_expiry(title, item.findtext('description')),
               'ended': ended, 'updated': bool(re.search(r'^\s*(?:\(update\)|\[update\]|update[:\-])', title, re.I))}
        old = posts.get(link)
        if not old or old['publishedAt'] < row['publishedAt']:
            posts[link] = row
    return sorted(posts.values(), key=lambda x: (x['publishedAt'], x['url']), reverse=True)

def download(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'BonusTracker/1.0 (RSS metadata reader)'})
    with urllib.request.urlopen(req, timeout=20) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('Feed exceeds size limit')
    return raw

def collect_source(source, now, previous):
    for url in source['urls']:
        try:
            rows = parse_feed(download(url), now, source)
            return rows, {'id': source['id'], 'name': source['name'],
                          'checkedAt': now.isoformat(), 'status': 'ok'}
        except Exception as exc:
            print(source['name'], 'feed unavailable:', type(exc).__name__, file=sys.stderr)
    old = next((v for v in previous.get('sources', []) if v.get('id') == source['id']), {})
    return [], {'id': source['id'], 'name': source['name'],
                'checkedAt': old.get('checkedAt') or previous.get('checkedAt'),
                'status': 'unavailable'}

def prior_posts(previous, now):
    rows = []
    for offer in previous.get('offers', []):
        links = offer.get('links') if isinstance(offer.get('links'), list) else [offer]
        for link in links:
            sid = link.get('sourceId') or offer.get('sourceId')
            source = next((v for v in SOURCES if v['id'] == sid), None)
            title = link.get('title') or offer.get('title') or offer.get('headline') or ''
            url = link.get('url') or offer.get('url') or ''
            if not source or not safe_link(url, source):
                continue
            identity = offer_identity(title)
            if not identity:
                continue
            try:
                published = dt.datetime.fromisoformat(link.get('publishedAt') or offer['publishedAt'])
                if not published.tzinfo or not dt.timedelta(0) <= now - published <= dt.timedelta(days=90):
                    continue
            except (TypeError, KeyError, ValueError):
                continue
            rows.append({'title': title[:300], 'url': url, 'source': source['name'],
                         'sourceId': sid, 'publishedAt': published.isoformat(),
                         'availability': link.get('availability') or offer.get('availability', 'unknown'),
                         'groupKey': title_key(title), **identity,
                         'expiresAt': link.get('expiresAt') or offer.get('expiresAt'),
                         'ended': False, 'updated': bool(re.match(r'^\s*(?:\(update\)|\[update\]|update[:\-])', title, re.I))})
    return rows

def build_payload(now, previous=None):
    previous = previous or {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda source: collect_source(source, now, previous), SOURCES))
    fresh = [row for posts, _ in results for row in posts]
    states = [state for _, state in results]
    checks = [v.get('checkedAt') for v in states if v.get('checkedAt')]
    if not checks:
        raise ValueError('No source is available and no last-good snapshot exists')
    tombstones = {}
    for row in previous.get('endedOffers', []):
        if isinstance(row, dict) and isinstance(row.get('family'), str):
            try:
                when = dt.datetime.fromisoformat(row['at'])
                if dt.timedelta(0) <= now - when <= dt.timedelta(days=90):
                    tombstones[(row['family'], row.get('amount'))] = row['at']
            except (KeyError, TypeError, ValueError):
                pass
    for post in fresh:
        if post['ended']:
            key = (family_key(post), post['amount'])
            tombstones[key] = max(tombstones.get(key, ''), post['publishedAt'])
    posts_by_url = {}
    for post in prior_posts(previous, now) + [x for x in fresh if not x['ended']]:
        key = (post['url'], family_key(post), post['amount'])
        old = posts_by_url.get(key)
        if old is None or (post['publishedAt'], post['title']) >= (old['publishedAt'], old['title']):
            posts_by_url[key] = post
    families = {}
    for post in posts_by_url.values():
        family = family_key(post)
        marker = max(tombstones.get((family, post['amount']), ''), tombstones.get((family, None), ''))
        if marker and post['publishedAt'] <= marker:
            continue
        families.setdefault(family, []).append(post)
    previous_by_id = {o.get('id'): o for o in previous.get('offers', []) if o.get('id')}
    previous_by_family = {}
    for o in previous.get('offers', []):
        identity = offer_identity(o.get('title') or o.get('headline') or '')
        if identity:
            family = family_key(identity)
            if family not in previous_by_family or o.get('publishedAt', '') > previous_by_family[family].get('publishedAt', ''):
                previous_by_family[family] = o
    merged = []
    for family, posts in families.items():
        posts.sort(key=lambda x: (x['publishedAt'], x['url']), reverse=True)
        primary = posts[0]
        # Newest amount is authoritative for one bank/product/region family.
        matching = [p for p in posts if p['amount'] == primary['amount']]
        identity = {k: primary[k] for k in ('bank', 'product', 'amount', 'region')}
        canonical_id = offer_id(identity, primary['url'])
        prior = previous_by_id.get(canonical_id)
        family_before = previous_by_family.get(family)
        first = (prior or {}).get('firstSeenAt') or (previous.get('checkedAt') if previous.get('schemaVersion') in (1, 2) and family_before else now.isoformat())
        expiry = next((p['expiresAt'] for p in matching if p.get('expiresAt')), None)
        if expiry:
            try:
                if dt.date.fromisoformat(expiry) < now.date():
                    continue
            except ValueError:
                expiry = None
        links = [{'title': p['title'], 'url': p['url'], 'sourceId': p['sourceId'],
                  'source': p['source'], 'publishedAt': p['publishedAt'],
                  'availability': p['availability']} for p in matching]
        change = (prior or {}).get('change')
        if (family_before and family_before.get('amount') is not None and
                primary['amount'] is not None and family_before.get('amount') != primary['amount'] and
                primary['publishedAt'] > family_before.get('publishedAt', '')):
            change = {'type': 'Increased' if primary['amount'] > family_before['amount'] else 'Decreased',
                      'from': family_before['amount'], 'to': primary['amount'], 'at': now.isoformat()}
        elif change:
            try:
                if now - dt.datetime.fromisoformat(change['at']) > dt.timedelta(days=7):
                    change = None
            except (KeyError, TypeError, ValueError):
                change = None
        try:
            new = now - dt.datetime.fromisoformat(first) <= dt.timedelta(days=7)
        except (ValueError, TypeError):
            new = False
        badges = []
        if change:
            badges.append(change['type'])
        if new and not change:
            badges.append('New')
        if primary['updated'] and now - dt.datetime.fromisoformat(primary['publishedAt']) <= dt.timedelta(days=7):
            badges.append('Updated')
        if expiry and 0 <= (dt.date.fromisoformat(expiry) - now.date()).days <= 14:
            badges.append('Ending soon')
        display_amount = '$' + '{:,.0f}'.format(primary['amount']) if primary['amount'] is not None else 'Amount needs review'
        merged.append({'id': canonical_id, **identity,
                       'displayTitle': primary['bank'] + ' · ' + primary['product'].capitalize() + ' · ' + display_amount,
                       'title': primary['title'], 'headline': primary['title'],
                       'url': primary['url'], 'sourceId': primary['sourceId'], 'source': primary['source'],
                       'publishedAt': primary['publishedAt'], 'firstSeenAt': first,
                       'expiresAt': expiry, 'availability': primary['availability'],
                       'groupKey': canonical_id, 'links': links, 'badges': badges,
                       'change': change})
    merged.sort(key=lambda o: (0 if 'Increased' in o['badges'] else 1 if 'New' in o['badges'] else 2,
                               -dt.datetime.fromisoformat(o['publishedAt']).timestamp(), o['id']))
    return {'schemaVersion': 3, 'checkedAt': max(checks), 'sources': states,
            'endedOffers': [{'family': f, 'amount': a, 'at': when}
                           for (f, a), when in sorted(tombstones.items(), key=lambda p: (p[0][0], str(p[0][1])))],
            'offers': merged[:200]}

def main():
    now = dt.datetime.now(dt.timezone.utc)
    previous = {}
    # Scheduled writers use the committed file, not a potentially older Pages copy.
    try:
        previous = json.loads(OUTPUT.read_text(encoding='utf-8'))
        if previous.get('schemaVersion') not in (1, 2, 3) or not isinstance(previous.get('offers'), list):
            previous = {}
    except (OSError, ValueError):
        try:
            previous = json.loads(download(PUBLISHED))
            if previous.get('schemaVersion') not in (1, 2, 3) or not isinstance(previous.get('offers'), list):
                previous = {}
        except Exception:
            previous = {}
    payload = build_payload(now, previous)
    payload = attach_availability(payload, previous)
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Bank offer feed:', len(payload['offers']), 'canonical offers; latest source', payload['checkedAt'])

if __name__ == '__main__':
    main()
