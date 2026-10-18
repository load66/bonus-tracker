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

def bank_bonus(title, categories):
    text = html.unescape(title).lower()
    if re.search(r'\b(credit card|brokerage|crypto|binance|bitcoin|tastytrade|robinhood|investment|ira|stock)\b', text):
        return False
    if re.search(r'\b(roundup|round-up|best bank|weekly|monthly|recap)\b', text):
        return False
    bank = re.search(r'\b(checking|savings|bank|credit union|fcu|cu)\b', text)
    reward = re.search(r'\bbonus\b|\$\s*[\d,]+', text)
    allowed = {'bank accounts', 'bank promotions', 'bank account bonuses', 'bank bonuses'}
    return bool(bank and reward and any(c.lower() in allowed for c in categories))

def safe_link(link, source):
    try:
        parsed = urlsplit(link)
        return parsed.scheme == 'https' and parsed.hostname in source['hosts'] and not parsed.username and not parsed.password and parsed.port in (None, 443) and bool(parsed.path.strip('/')) and not parsed.query and not parsed.fragment
    except ValueError:
        return False

def availability(title, categories, summary):
    # Explicit source labels only. Bank identity never implies nationwide access.
    text = html.unescape(re.sub('<[^>]+>', ' ', summary or ''))
    if re.search(r'\b(?:not|isn.t|no longer)\s+(?:available\s+)?nationwide\b|\b(?:nationwide|all 50 states)\s+(?:except|excluding)\b', title + ' ' + text, re.I):
        return 'unknown'
    national = bool(re.search(r'\bnationwide\b|\ball 50 states\b', title, re.I) or any(re.fullmatch(r'nationwide(?: bank bonuses)?', c, re.I) for c in categories) or re.search(r'\b(?:availability|available|eligible locations?)\s*:?\s*(?:nationwide|in all 50 states)\b', text, re.I))
    regional = bool(re.search(r'^\s*\[[^\]]*(?:\b[A-Z]{2}\b|only|counties)[^\]]*\]', title) or any(re.fullmatch(r'[a-z]{2} bank bonuses', c.lower()) for c in categories) or re.search(r'\b(?:select states|select counties|regional|state residents only)\b', title, re.I))
    if national and regional:
        return 'unknown'
    return 'nationwide' if national else 'regional' if regional else 'unknown'

def title_key(title):
    text = html.unescape(title).lower().replace('u.s.', 'us').replace('u.s', 'us')
    text = re.sub(r'\b(?:earn|get|new|bonus|offer|offers|with|a|an|the|up to)\b', ' ', text)
    # Retain amounts, product words, location, and dates; avoid fuzzy bank-only merging.
    return ' '.join(sorted(re.findall(r'[a-z0-9]+', text)))

# Offer identity is deliberately stricter than a fuzzy title match. Exact reward,
# consumer/business product, and declared region belong to the offer key.
BANK_ALIASES = {
    'jpmorgan chase bank': 'chase', 'jpmorgan chase': 'chase',
    'chase bank': 'chase', 'chase': 'chase',
    'us bank': 'us bank', 'u s bank': 'us bank',
    'bank of america': 'bank of america',
    'wells fargo': 'wells fargo',
    'american express': 'american express',
}
STATE_CODES = set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
DATE_PATTERN = re.compile(r'\b(?:ends?|expires?|expiration(?:\s+date)?(?:\s+is)?|offer\s+ends?)\s*:?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b', re.I)

def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', str(value or '')))).strip()

def end_marker(title, summary=''):
    return bool(re.search(r'\b(?:expired|ended|offer\s+closed|no\s+longer\s+available|promotion\s+has\s+ended)\b', plain(title)+' '+plain(summary), re.I))

def expiry_from_text(title, summary=''):
    for value in (title, summary):
        match = DATE_PATTERN.search(plain(value))
        if match:
            month, day, year = map(int, match.groups())
            if year < 100: year += 2000
            try: return dt.date(year, month, day).isoformat()
            except ValueError: return None
    return None

def bank_identity(title):
    head = plain(title)
    head = re.sub(r'^\s*(?:\[[^\]]+\]\s*|\(update\)\s*)+', '', head, flags=re.I)
    head = re.sub(r'\bu\.s\.\s*bank\b', 'US Bank', head, flags=re.I)
    normalized = re.sub(r'[^a-z0-9]+', ' ', head.lower()).strip()
    for alias in sorted(BANK_ALIASES, key=len, reverse=True):
        if re.search(r'(?:^| )'+re.escape(alias)+r'(?: |$)', normalized):
            return BANK_ALIASES[alias]
    # Unlisted banks: take the prefix before the reward/product, not the entire headline.
    text = re.split(r'\$\s*[\d,]+|\b(?:checking|savings?|business|commercial|bonus|offer|promotion|promotions|account)\b', head, 1, flags=re.I)[0]
    text = re.sub(r'^\s*(?:get|earn|new|up to|the)\s+', '', text, flags=re.I)
    text = re.sub(r'\b(?:bank promotions|promotions|promotion)\s*$', '', text, flags=re.I).strip(' -:–—')
    return re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()[:75]

def identity(title):
    text = plain(title)
    bank = bank_identity(text)
    # Multiple different monetary prizes in one headline are ambiguous: do not
    # silently choose one for a purportedly exact offer identity.
    rewards = [int(v.replace(',', '')) for v in re.findall(r'\$\s*(\d[\d,]*)', text)]
    amount = rewards[0] if len(rewards)==1 and 0 < rewards[0] < 100000 else None
    if re.search(r'\b(?:checking\s*(?:&|and|\+)\s*savings|checking\s*/\s*savings|combo)\b', text, re.I):
        product='combo'
    elif re.search(r'\b(?:business|commercial|biz)\b', text, re.I): product='business'
    elif re.search(r'\bsavings?\b', text, re.I): product='savings'
    elif re.search(r'\bchecking\b', text, re.I): product='checking'
    else: product='unknown'
    regions=[]
    for bracket in re.findall(r'\[([^\]]+)\]|\(([^\)]+)\)', text):
        inner=' '.join(bracket)
        codes=[w for w in re.findall(r'\b[A-Z]{2}\b', inner) if w in STATE_CODES]
        regions.extend(codes)
    region=','.join(sorted(set(regions))) if regions else 'nationwide' if re.search(r'\bnationwide\b|\ball 50 states\b',text,re.I) else 'unknown'
    key='|'.join((bank or 'unknown',product,str(amount) if amount is not None else '?',region))
    return {'bank':bank,'product':product,'amount':amount,'region':region,'offerKey':key}

def post_row(title, link, published, source, categories=(), summary=''):
    values = identity(title)
    expire = expiry_from_text(title, summary)
    if values['amount'] is None or values['product']=='unknown':
        values['offerKey']+='|'+hashlib.sha256(link.encode()).hexdigest()[:12]
    row = {'title':title[:300], 'url':link, 'publishedAt':published.isoformat(),
           'source':source['name'], 'sourceId':source['id'],
           'availability':availability(title, categories, summary),
           'groupKey':values['offerKey'], **values, 'firstSeen':published.isoformat(),
           'lastSeen':published.isoformat(), 'expiresAt':expire,
           'isUpdate':bool(re.search(r'\(\s*update\s*\)', title,re.I)),
           'ended':end_marker(title, summary)}
    row['links']=[{'url':link,'source':source['name'],'sourceId':source['id'],
                   'title':title[:300],'publishedAt':published.isoformat()}]
    return row

def source_for_url(url):
    return next((x for x in SOURCES if safe_link(url, x)), None)

def rehydrate(row):
    if not isinstance(row,dict): return None
    source=source_for_url(str(row.get('url','')))
    if source is None or not isinstance(row.get('title'),str): return None
    try: published=dt.datetime.fromisoformat(row['publishedAt']).astimezone(dt.timezone.utc)
    except (KeyError,ValueError,TypeError): return None
    item=post_row(row['title'],row['url'],published,source,(), '')
    item['availability']=row.get('availability') if row.get('availability') in ('unknown','regional','nationwide') else 'unknown'
    for field in ('firstSeen','lastSeen'):
        try:
            value=dt.datetime.fromisoformat(row.get(field, '')).astimezone(dt.timezone.utc)
            item[field]=value.isoformat()
        except (ValueError,TypeError): pass
    if isinstance(row.get('expiresAt'),str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',row['expiresAt']):
        item['expiresAt']=row['expiresAt']
    links=[]
    for x in row.get('links',[]) if isinstance(row.get('links'),list) else []:
        if not isinstance(x,dict) or not isinstance(x.get('title'),str): continue
        source=source_for_url(str(x.get('url','')))
        if not source: continue
        try: stamp=dt.datetime.fromisoformat(x['publishedAt']).astimezone(dt.timezone.utc)
        except (TypeError,ValueError,KeyError): continue
        link_key=identity(x['title'])['offerKey']
        if link_key!=item['offerKey'] and not item['offerKey'].startswith(link_key+'|'): continue
        links.append({'url':x['url'],'sourceId':source['id'],'source':source['name'],
                      'title':x['title'][:300],'publishedAt':stamp.isoformat()})
    if links: item['links']=links
    return item

def merge_offers(previous, fresh, now, retired=()):
    # Source post dates, not scrape time, determine lifecycle and "New" status.
    posts=[x for x in (rehydrate(r) for r in previous) if x is not None]+fresh
    tombstones={r.get('offerKey'):r.get('endedAt') for r in retired if isinstance(r,dict) and isinstance(r.get('offerKey'),str) and isinstance(r.get('endedAt'),str)}
    groups={}
    for item in posts:
        if not item.get('bank'): continue
        stamp=dt.datetime.fromisoformat(item['publishedAt'])
        if stamp>now or now-stamp>dt.timedelta(days=90): continue
        groups.setdefault(item['offerKey'],[]).append(item)
    merged=[]
    for key,items in groups.items():
        items.sort(key=lambda r:(r['publishedAt'],bool(r.get('isUpdate'))),reverse=True)
        current=items[0]
        if current.get('ended') or (tombstones.get(key) and current['publishedAt']<=tombstones[key]): continue
        expiry=current.get('expiresAt') or next((r['expiresAt'] for r in items if r.get('expiresAt')),None)
        if expiry and expiry<now.date().isoformat(): continue
        newest=dt.datetime.fromisoformat(current['publishedAt'])
        if now-newest>dt.timedelta(days=90): continue
        links={}
        for item in items:
            for link in item.get('links',[]):
                link_key=identity(link['title'])['offerKey']
                if key!=link_key and not key.startswith(link_key+'|'): continue
                prev=links.get(link['url'])
                if not prev or link['publishedAt']>prev['publishedAt']:links[link['url']]=link
        first=min(i.get('firstSeen',i['publishedAt']) for i in items)
        result={k:v for k,v in current.items() if k not in ('ended',)}
        result.update(firstSeen=first,lastSeen=current['publishedAt'],expiresAt=expiry,
                      links=sorted(links.values(),key=lambda x:x['publishedAt'],reverse=True))
        result['groupKey']=key
        merged.append(result)
    # A newer post for a different reward supersedes an older amount only for
    # the same bank/product/region (never across business/consumer or states).
    by_family={}
    for item in merged:
        family=(item['bank'],item['product'],item['region']) if item['amount'] is not None and item['product']!='unknown' else (item['offerKey'],)
        by_family.setdefault(family,[]).append(item)
    output=[]
    for family,items in by_family.items():
        items.sort(key=lambda x:(x['publishedAt'],x['offerKey']),reverse=True)
        current=items[0]
        older=[x for x in items[1:] if x['amount']!=current['amount'] and x['publishedAt']<current['publishedAt']]
        if older:
            old=max(older,key=lambda x:x['publishedAt'])
            current['previousAmount']=old['amount']
            current['change']=('Increased' if current['amount']>old['amount'] else 'Decreased')
            current['firstSeen']=min(current['firstSeen'],old['firstSeen'])
            current['changeLabel']='$'+str(old['amount'])+' → $'+str(current['amount'])
        for item in items:
            if item is not current and item in older: continue
            try: days=(now-dt.datetime.fromisoformat(item['firstSeen'])).days
            except (ValueError,TypeError): days=100
            badges=[]
            if item.get('change'):badges.append(item['change'])
            elif days<=7:badges.append('New')
            if item.get('isUpdate'):badges.append('Updated')
            if item.get('expiresAt'):
                delta=(dt.date.fromisoformat(item['expiresAt'])-now.date()).days
                if 0<=delta<=14:badges.append('Ending soon')
            item['badges']=badges
            output.append(item)
    return sorted(output,key=lambda x:x['publishedAt'],reverse=True)[:200]

def parse_feed(raw, now, source=None):
    source=source or SOURCES[0]
    root=ET.fromstring(raw)
    if root.tag!='rss' or root.find('channel') is None: raise ValueError('Expected an RSS channel')
    items=root.findall('./channel/item')
    if not items: raise ValueError('Source returned no RSS items')
    offers={}
    for item in items:
        title=html.unescape(item.findtext('title') or '').strip()
        link=(item.findtext('link') or '').strip()
        cats=[c.text or '' for c in item.findall('category')]
        summary=plain(item.findtext('description'))
        if not bank_bonus(title,cats) or not safe_link(link,source): continue
        try: published=email.utils.parsedate_to_datetime(item.findtext('pubDate')).astimezone(dt.timezone.utc)
        except (TypeError,ValueError,AttributeError):continue
        if published>now or now-published>dt.timedelta(days=90): continue
        row=post_row(title,link,published,source,cats,summary)
        row['firstSeen']=now.isoformat()
        if not row['bank']:continue
        previous=offers.get(row['offerKey'])
        if not previous or row['publishedAt']>previous['publishedAt']:offers[row['offerKey']]=row
    return sorted(offers.values(),key=lambda x:x['publishedAt'],reverse=True)

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
            rows=parse_feed(download(url),now,source)
            return rows, {'id':source['id'],'name':source['name'],'checkedAt':now.isoformat(),'status':'ok'}
        except Exception as exc: print(source['name'],'feed unavailable:',type(exc).__name__,file=sys.stderr)
    old=next((s for s in previous.get('sources',[]) if s.get('id')==source['id']),{})
    checked=old.get('checkedAt') or (previous.get('checkedAt') if source['id']=='doc' and previous.get('schemaVersion')==1 else None)
    return [], {'id':source['id'],'name':source['name'],'checkedAt':checked,'status':'unavailable'}

def build_payload(now, previous=None):
    previous=previous or {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        results=list(pool.map(lambda source:collect_source(source,now,previous),SOURCES))
    fresh=[r for offers,_ in results for r in offers]
    states=[state for _,state in results]
    checks=[s['checkedAt'] for s in states if s.get('checkedAt')]
    if not checks:raise ValueError('No source is available and no last-good snapshot exists')
    retired=[r for r in previous.get('retired',[]) if isinstance(r,dict) and isinstance(r.get('offerKey'),str) and isinstance(r.get('endedAt'),str)
             and r['endedAt']>= (now-dt.timedelta(days=90)).isoformat()]
    retired.extend({'offerKey':r['offerKey'],'endedAt':r['publishedAt']} for r in fresh if r.get('ended'))
    latest={}
    for r in retired:
        if r['offerKey'] not in latest or r['endedAt']>latest[r['offerKey']]['endedAt']:latest[r['offerKey']]=r
    retired=list(latest.values())[:200]
    rows=merge_offers(previous.get('offers',[]),fresh,now,retired)
    return {'schemaVersion':2,'checkedAt':max(checks),'sources':states,'offers':rows,'retired':retired}

def main():
    now = dt.datetime.now(dt.timezone.utc)
    previous = {}
    try:
        previous = json.loads(OUTPUT.read_text(encoding='utf-8')) if OUTPUT.exists() else json.loads(download(PUBLISHED))
        if previous.get('schemaVersion') not in (1, 2) or not isinstance(previous.get('offers'), list):
            previous = {}
    except Exception:
        pass
    payload = build_payload(now, previous)  # Discovery needs no paid AI calls; Tracker AI is on demand.
    payload = attach_availability(payload, previous)
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Bank-only feed:', len(payload['offers']), 'items; source checked', payload['checkedAt'])
    print('Source status:', ', '.join(s['name'] + ': ' + s['status'] for s in payload['sources']))

if __name__ == '__main__':
    main()
