"""Read-only official-page change watch. Never infers an active/eligible bank offer.

Runs from the existing six-hour GitHub Actions bank-feed publisher.
Stores fingerprints and review flags, not page content or customer data.
"""
import datetime as dt
import hashlib
import html
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'data/quick-add-source-manifest.json'
OUTPUT = ROOT / 'data/quick-add-source-monitor.json'
HOSTS = {
    'Wells Fargo': {'accountoffers.wellsfargo.com', 'www.wellsfargo.com'},
    'Capital One': {'www.capitalone.com'},
}
ROLES = {'promotion', 'fees'}
HEX = re.compile(r'^[0-9a-f]{64}$')
FOCUS = re.compile(
    r'\b(checking|saving|bonus|deposit|qualif|offer|fee|monthly|waiv|'
    r'eligib|withdraw|balance|promotion|expire|account|direct debit|business)\w*\b',
    re.I,
)
BLOCK = re.compile(r'(access denied|request blocked|verify you are human|captcha|'
                   r'error\s*403|please enable javascript to continue|bot detection)', re.I)


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.fragments = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'svg', 'header', 'footer', 'nav'):
            self.hidden += 1
        elif tag in ('p', 'li', 'div', 'section', 'article', 'tr', 'h1', 'h2', 'h3'):
            self.fragments.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'svg', 'header', 'footer', 'nav'):
            self.hidden = max(self.hidden - 1, 0)
        elif not self.hidden and tag in ('p', 'li', 'div', 'section', 'article', 'tr', 'h1', 'h2', 'h3'):
            self.fragments.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.fragments.append(data)


def safe(url, bank):
    try:
        u = urllib.parse.urlsplit(url)
        return (u.scheme == 'https' and u.hostname in HOSTS[bank]
                and not u.username and not u.password and u.port in (None, 443)
                and not u.fragment and bool(u.path.strip('/')))
    except (ValueError, KeyError):
        return False


class BankRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, bank):
        self.bank = bank
        self.count = 0

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        self.count += 1
        if self.count > 3 or not safe(newurl, self.bank):
            raise ValueError('Redirect outside the reviewed official bank hosts')
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def material_hash(raw):
    """Fingerprint relevant rendered page text, NOT volatile raw HTML assets."""
    parser = VisibleText()
    parser.feed(raw.decode('utf-8', errors='replace'))
    body = html.unescape(''.join(parser.fragments))
    if BLOCK.search(body[:2500]):
        raise ValueError('Official source returned an access challenge')
    lines = []
    for line in body.splitlines():
        normalized = re.sub(r'\s+', ' ', line).strip().lower()
        if FOCUS.search(normalized) and 24 <= len(normalized) <= 700:
            lines.append(normalized)
    unique = sorted(set(lines))
    # Empty/blocked pages cannot establish a document fingerprint.
    if len(unique) < 3 or sum(map(len, unique)) < 150:
        raise ValueError('Not enough relevant official terms to monitor')
    return hashlib.sha256('\n'.join(unique).encode('utf-8')).hexdigest()


def fetch_hash(url, bank):
    if not safe(url, bank):
        raise ValueError('Unapproved official source')
    opener = urllib.request.build_opener(BankRedirect(bank))
    request = urllib.request.Request(url, headers={
        'User-Agent': 'BonusTracker-Official-Source-Monitor/1.0 (+https://load66.github.io/bonus-tracker/)',
        'Accept': 'text/html,application/xhtml+xml',
    })
    with opener.open(request, timeout=12) as response:
        if not safe(response.url, bank):
            raise ValueError('Source resolved outside the approved bank hosts')
        content_type = response.headers.get('Content-Type', '').lower()
        if 'html' not in content_type:
            raise ValueError('Unsupported official source content type')
        raw = response.read(1_250_001)
        if len(raw) > 1_250_000:
            raise ValueError('Official page exceeds safe bounded size')
    return material_hash(raw)


def valid_old(row, url):
    if not isinstance(row, dict) or row.get('url') != url:
        return {}
    return row if isinstance(row.get('baselineHash'), str) and HEX.fullmatch(row['baselineHash']) else {}


def update_row(url, prev, observed, timestamp):
    base = prev.get('baselineHash')
    pending = bool(prev.get('changeAt'))
    row = {
        'url': url,
        'status': 'unavailable',
        'baselineHash': base if base else None,
        'observedHash': prev.get('observedHash') if prev.get('observedHash') and HEX.fullmatch(prev['observedHash']) else None,
        'observedAt': prev.get('observedAt') if prev.get('observedAt') else None,
        'checkedAt': timestamp,
        'changeAt': prev.get('changeAt') if pending else None,
    }
    if observed is None:
        return row
    row['observedHash'] = observed
    row['observedAt'] = timestamp
    if not base:
        row['baselineHash'] = observed
        row['status'] = 'baseline'  # first observation is NOT source verification
    elif observed != base or pending:
        row['status'] = 'changed'
        row['changeAt'] = row['changeAt'] or timestamp  # sticky until human review
    else:
        row['status'] = 'unchanged'
    return row


def build(manifest, previous, now, observe):
    if manifest.get('schemaVersion') != 1 or set(manifest.get('records', {})) - set(HOSTS):
        raise ValueError('Unexpected bank/source manifest')
    checked_at = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    result = {'schemaVersion': 1, 'generatedAt': checked_at, 'records': {}}
    for bank, source in manifest['records'].items():
        links = source.get('sources', [])
        if not isinstance(source.get('offerKey'), str) or not 8 < len(source['offerKey']) < 150:
            raise ValueError('Unreviewed offer key')
        if not isinstance(links, list) or sorted(x['role'] for x in links) != ['fees', 'promotion']:
            raise ValueError('Missing bank promotion or fee source')
        old = previous.get('records', {}).get(bank, {})
        old = old if isinstance(old, dict) and old.get('offerKey') == source['offerKey'] else {}
        rows = {}
        for link in links:
            role, url = link['role'], link['url']
            if role not in ROLES or not safe(url, bank):
                raise ValueError('Unsafe bank source')
            prev = valid_old((old.get('sources') or {}).get(role), url)
            try:
                observed = observe(url, bank)
            except Exception:  # unavailability never counts as no change
                observed = None
            rows[role] = update_row(url, prev, observed, checked_at)
        result['records'][bank] = {'offerKey': source['offerKey'], 'sources': rows}
    return result


def main():
    manifest = json.loads(MANIFEST.read_text('utf-8'))
    previous = json.loads(OUTPUT.read_text('utf-8')) if OUTPUT.exists() else {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        future = {(url, bank): pool.submit(fetch_hash, url, bank)
                  for bank, value in manifest['records'].items()
                  for url in [src['url'] for src in value['sources']]}
        def get(url, bank):
            return future[(url, bank)].result()
        result = build(manifest, previous, dt.datetime.now(dt.timezone.utc), get)
    OUTPUT.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', 'utf-8')
    counts = {}
    for row in result['records'].values():
        for source in row['sources'].values():
            counts[source['status']] = counts.get(source['status'], 0) + 1
    print('Official source watch (public only):', counts,
          '— each source remains unverified until separately reviewed')


if __name__ == '__main__':
    main()
