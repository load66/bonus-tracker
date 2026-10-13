"""Collect RSS metadata only. No offer list or financial rules are hardcoded."""
import datetime as dt
import email.utils
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

SOURCE = 'https://www.doctorofcredit.com/category/bank-account-bonuses/feed/'
PUBLISHED = 'https://load66.github.io/bonus-tracker/data/bank-bonuses.json'
OUTPUT = Path(__file__).resolve().parents[1] / 'data/bank-bonuses.json'

def bank_bonus(title, categories):
    text = html.unescape(title).lower()
    if re.search(r'\b(credit card|brokerage|crypto|binance|bitcoin|tastytrade|robinhood|investment|ira|stock|amex|american express)\b', text):
        return False
    if re.search(r'\b(expired|ended|closed offer|roundup|round-up|best bank|weekly|monthly|recap)\b', text):
        return False
    bank = re.search(r'\b(checking|savings|bank|credit union|fcu|cu)\b', text)
    reward = re.search(r'\bbonus\b|\$\s*[\d,]+', text)
    return bool(bank and reward and any(c.lower() == 'bank accounts' for c in categories))

def parse_feed(raw, now):
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
        if not bank_bonus(title, cats) or not re.fullmatch(r'https://www\.doctorofcredit\.com/[a-zA-Z0-9%_/-]+/?', link):
            continue
        try:
            published = email.utils.parsedate_to_datetime(item.findtext('pubDate')).astimezone(dt.timezone.utc)
        except (TypeError, ValueError, AttributeError):
            continue
        if published > now or now - published > dt.timedelta(days=90):
            continue
        offers[link] = {'title': title[:300], 'url': link, 'publishedAt': published.isoformat(), 'source': 'Doctor of Credit'}
    return sorted(offers.values(), key=lambda x: x['publishedAt'], reverse=True)

def download(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'BonusTracker/1.0 (RSS metadata reader)'})
    with urllib.request.urlopen(req, timeout=30) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('Feed exceeds size limit')
    return raw

def main():
    now = dt.datetime.now(dt.timezone.utc)
    try:
        offers = parse_feed(download(SOURCE), now)
        payload = {'schemaVersion': 1, 'checkedAt': now.isoformat(), 'sourceUrl': SOURCE, 'offers': offers}
    except Exception as exc:
        print('Feed refresh failed; attempting last published snapshot:', type(exc).__name__, file=sys.stderr)
        payload = json.loads(download(PUBLISHED))
        if payload.get('schemaVersion') != 1 or not isinstance(payload.get('offers'), list) or not payload.get('checkedAt'):
            raise ValueError('No valid last-good snapshot')
        # Do not advance checkedAt: the client must expose the stale source check.
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Bank-only feed:', len(payload['offers']), 'items; source checked', payload['checkedAt'])

if __name__ == '__main__':
    main()
