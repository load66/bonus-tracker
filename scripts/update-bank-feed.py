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

def bank_bonus(title, categories):
    text = html.unescape(title).lower()
    if re.search(r'\b(credit card|brokerage|crypto|binance|bitcoin|tastytrade|robinhood|investment|ira|stock)\b', text):
        return False
    if re.search(r'\b(expired|ended|closed offer|roundup|round-up|best bank|weekly|monthly|recap)\b', text):
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

def parse_feed(raw, now, source=None):
    source = source or SOURCES[0]
    root = ET.fromstring(raw)
    if root.tag != 'rss' or root.find('channel') is None:
        raise ValueError('Expected an RSS channel')
    items = root.findall('./channel/item')
    if not items:
        raise ValueError('Source returned no RSS items')
    offers = {}
    for item in items:
        title = html.unescape(item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        cats = [c.text or '' for c in item.findall('category')]
        if not bank_bonus(title, cats) or not safe_link(link, source):
            continue
        try:
            published = email.utils.parsedate_to_datetime(item.findtext('pubDate')).astimezone(dt.timezone.utc)
        except (TypeError, ValueError, AttributeError):
            continue
        if published > now or now - published > dt.timedelta(days=90):
            continue
        # Discard explicit title expiry dates; do not invent one from article dates.
        expiry = re.search(r'\bends?\s+(\d{1,2})/(\d{1,2})/(\d{2,4})\b', title, re.I)
        if expiry:
            try:
                month, day, year = map(int, expiry.groups())
                if dt.date(year + 2000 if year < 100 else year, month, day) < now.date():
                    continue
            except ValueError:
                continue
        offers[link] = {'title': title[:300], 'url': link, 'publishedAt': published.isoformat(), 'source': source['name'], 'sourceId': source['id'], 'availability': availability(title, cats, item.findtext('description')), 'groupKey': title_key(title)}
    return sorted(offers.values(), key=lambda x: x['publishedAt'], reverse=True)

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
            return rows, {'id': source['id'], 'name': source['name'], 'checkedAt': now.isoformat(), 'status': 'ok'}
        except Exception as exc:
            print(source['name'], 'feed unavailable:', type(exc).__name__, file=sys.stderr)
    old = next((s for s in previous.get('sources', []) if s.get('id') == source['id']), {})
    checked = old.get('checkedAt') or (previous.get('checkedAt') if source['id'] == 'doc' and previous.get('schemaVersion') == 1 else None)
    rows = [r for r in previous.get('offers', []) if r.get('sourceId') == source['id'] or (source['id'] == 'doc' and r.get('source') == source['name'])]
    kept = []
    for row in rows:
        try:
            if safe_link(str(row.get('url', '')), source) and dt.timedelta(0) <= now - dt.datetime.fromisoformat(row['publishedAt']) <= dt.timedelta(days=90):
                kept.append(row)
        except (KeyError, ValueError, TypeError):
            pass
    rows = kept
    return rows, {'id': source['id'], 'name': source['name'], 'checkedAt': checked, 'status': 'unavailable'}

def build_payload(now, previous=None):
    previous = previous or {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda source: collect_source(source, now, previous), SOURCES))
    rows = [r for offers, _ in results for r in offers]
    states = [state for _, state in results]
    checks = [s['checkedAt'] for s in states if s.get('checkedAt')]
    if not checks:
        raise ValueError('No source is available and no last-good snapshot exists')
    return {'schemaVersion': 2, 'checkedAt': max(checks), 'sources': states, 'offers': sorted(rows, key=lambda x: x['publishedAt'], reverse=True)[:200]}

def main():
    now = dt.datetime.now(dt.timezone.utc)
    previous = {}
    try:
        previous = json.loads(download(PUBLISHED))
        if previous.get('schemaVersion') not in (1, 2) or not isinstance(previous.get('offers'), list):
            previous = {}
    except Exception:
        pass
    payload = build_payload(now, previous)  # Discovery needs no paid AI calls; Tracker AI is on demand.
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Bank-only feed:', len(payload['offers']), 'items; source checked', payload['checkedAt'])
    print('Source status:', ', '.join(s['name'] + ': ' + s['status'] for s in payload['sources']))

if __name__ == '__main__':
    main()
