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
DECISIONS = ROOT / 'data/quick-add-source-review-decisions.json'
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


# These are *review hints*, not verified changes to a promotion's terms.
# Store only SHA-256 fingerprints of public clauses; never copy bank page text.
REVIEW_CATEGORIES = {
    'bonus_amount': re.compile(r'(?:\bbonus\b|\bearn\b|\breward\b|cash offer)', re.I),
    'monthly_fees': re.compile(r'(?:\bfee\b|\bmonthly\b|\bwaiv\w*\b|\bmaintenance\b)', re.I),
    'direct_deposit': re.compile(r'(?:\bdirect deposits?\b|\bqualifying deposits?\b|\bpayroll\b)', re.I),
    'deadlines': re.compile(r'(?:\bwithin\s+\d+\s+days?\b|\bdeadline\b|\bexpires?\b|\bexpiration\b|\bby\s+\w+\s+\d{1,2}\b)', re.I),
    'eligibility': re.compile(r'(?:\beligib\w*\b|\bnew customers?\b|\bprevious customers?\b|\bresiden\w*\b|\bmember\w*\b)', re.I),
    'closure_rules': re.compile(r'(?:\bearly clos\w*\b|\bclose account\b|\bclawback\b|\bforfeit\b)', re.I),
}


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


def material_lines(raw):
    """Keep source text in process; never retain public page excerpts in JSON."""
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
    if len(unique) < 3 or sum(map(len, unique)) < 150:
        raise ValueError('Not enough relevant official terms to monitor')
    return unique


def material_hash(raw):
    """Fingerprint relevant rendered text, independent of volatile HTML."""
    lines = material_lines(raw)
    return hashlib.sha256('\n'.join(lines).encode('utf-8')).hexdigest()


def material_observation(raw):
    """Bounded category digests allow review hints without retaining page copy."""
    lines = material_lines(raw)
    signals = {}
    for category, pattern in REVIEW_CATEGORIES.items():
        matching = [line for line in lines if pattern.search(line)]
        if matching:
            signals[category] = hashlib.sha256('\n'.join(matching).encode('utf-8')).hexdigest()
    return {'digest': hashlib.sha256('\n'.join(lines).encode('utf-8')).hexdigest(), 'signals': signals}


def valid_signals(value):
    if not isinstance(value, dict) or len(value) > len(REVIEW_CATEGORIES):
        return None
    if any(category not in REVIEW_CATEGORIES or not isinstance(digest, str) or not HEX.fullmatch(digest)
           for category, digest in value.items()):
        return None
    return dict(value)


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
    return material_observation(raw)


def valid_old(row, url):
    if not isinstance(row, dict) or row.get('url') != url:
        return {}
    return row if isinstance(row.get('baselineHash'), str) and HEX.fullmatch(row['baselineHash']) else {}


REVIEW_REF = re.compile(r'^https://github\.com/load66/bonus-tracker/(?:pull|issues)/[1-9]\d{0,8}
    base = prev.get('baselineHash')
    pending = bool(prev.get('changeAt'))
    baseline_signals = valid_signals(prev.get('baselineSignals'))
    observed_signals = valid_signals(prev.get('observedSignals'))
    sticky = prev.get('reviewSignals') if isinstance(prev.get('reviewSignals'), list) else []
    sticky = [x for x in sticky if x in REVIEW_CATEGORIES or x == 'other_terms'][:7]
    row = {
        'url': url,
        'status': 'unavailable',
        'baselineHash': base if base else None,
        'observedHash': prev.get('observedHash') if isinstance(prev.get('observedHash'), str) and HEX.fullmatch(prev['observedHash']) else None,
        'observedAt': prev.get('observedAt') if prev.get('observedAt') else None,
        'checkedAt': timestamp,
        'changeAt': prev.get('changeAt') if pending else None,
        'baselineSignals': baseline_signals,
        'observedSignals': observed_signals,
        'reviewSignals': sticky,
        'lastReviewedAt': prev.get('lastReviewedAt') if utc_stamp(prev.get('lastReviewedAt')) else None,
        'lastReviewRef': prev.get('lastReviewRef') if REVIEW_REF.fullmatch(str(prev.get('lastReviewRef', ''))) else None,
    }
    if observed is None:
        return row
    # Preserve legacy hash-only observers used in the original synthetic tests.
    if isinstance(observed, dict):
        digest = observed.get('digest')
        signals = valid_signals(observed.get('signals'))
    else:
        digest, signals = observed, None
    if not isinstance(digest, str) or not HEX.fullmatch(digest):
        return row
    row['observedHash'] = digest
    row['observedAt'] = timestamp
    row['observedSignals'] = signals
    if not base:
        row['baselineHash'] = digest
        row['baselineSignals'] = signals
        row['status'] = 'baseline'  # baseline is NOT source approval
    elif digest != base or pending:
        row['status'] = 'changed'
        row['changeAt'] = row['changeAt'] or timestamp
        if digest != base:
            if baseline_signals is not None and signals is not None:
                changed = [k for k in REVIEW_CATEGORIES if baseline_signals.get(k) != signals.get(k)]
            else:
                changed = ['other_terms']  # Do not invent specific changes.
            if not changed:
                changed = ['other_terms']
            row['reviewSignals'] = list(dict.fromkeys(sticky + changed))[:7]
    else:
        row['status'] = 'unchanged'
        # A legacy baseline can safely adopt category digests only while its
        # ENTIRE material fingerprint still matches the original baseline.
        if baseline_signals is None and signals is not None:
            row['baselineSignals'] = signals
    return row


def build(manifest, previous, now, observe, decisions=None):
    if manifest.get('schemaVersion') != 1 or set(manifest.get('records', {})) - set(HOSTS):
        raise ValueError('Unexpected bank/source manifest')
    checked_at = now.strftime('%Y-%m-%dT%H:%M:%SZ')
    result = {'schemaVersion': 1, 'generatedAt': checked_at, 'records': {}}
    approvals = {}
    ledger = decisions if isinstance(decisions, dict) else {}
    if ledger.get('schemaVersion') == 1 and isinstance(ledger.get('decisions'), list) and len(ledger['decisions']) <= 40:
        for decision in ledger['decisions']:
            if isinstance(decision, dict):
                key = (decision.get('bank'), decision.get('role'))
                approvals[key] = decision
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
            row = update_row(url, prev, observed, checked_at)
            decision = approvals.get((bank, role))
            if (decision and decision.get('bank') == bank
                    and decision.get('role') == role
                    and decision.get('offerKey') == source['offerKey']
                    and observed is not None
                    and approved_change(link, prev, row, decision, now)):
                row.update({
                    'baselineHash': row['observedHash'],
                    'baselineSignals': row['observedSignals'],
                    'changeAt': None, 'reviewSignals': [],
                    'status': 'unchanged', 'lastReviewedAt': decision['reviewedAt'],
                    'lastReviewRef': decision['reviewRef'],
                })
            rows[role] = row
        result['records'][bank] = {'offerKey': source['offerKey'], 'sources': rows}
    return result


def main():
    manifest = json.loads(MANIFEST.read_text('utf-8'))
    previous = json.loads(OUTPUT.read_text('utf-8')) if OUTPUT.exists() else {}
    decisions = json.loads(DECISIONS.read_text('utf-8')) if DECISIONS.exists() else {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        future = {(url, bank): pool.submit(fetch_hash, url, bank)
                  for bank, value in manifest['records'].items()
                  for url in [src['url'] for src in value['sources']]}
        def get(url, bank):
            return future[(url, bank)].result()
        result = build(manifest, previous, dt.datetime.now(dt.timezone.utc), get, decisions)
    OUTPUT.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', 'utf-8')
    counts = {}
    for row in result['records'].values():
        for source in row['sources'].values():
            counts[source['status']] = counts.get(source['status'], 0) + 1
    print('Official source watch (public only):', counts,
          '— each source remains unverified until separately reviewed')


if __name__ == '__main__':
    main()
)


def utc_stamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(dt.timezone.utc) if parsed.tzinfo else None
    except ValueError:
        return None


def review_decision(bank, role, record, manifest, expected, reference, now):
    """Human-confirmed acknowledgement; never certifies an offer or its fee terms."""
    scope = manifest.get('records', {}).get(bank)
    if bank not in HOSTS or not isinstance(scope, dict) or role not in ROLES:
        raise ValueError('Unrecognized bank or document role')
    match = next((x for x in scope.get('sources', []) if x.get('role') == role), None)
    if not match or not safe(match.get('url', ''), bank):
        raise ValueError('Source is not a pinned official bank document')
    if not REVIEW_REF.fullmatch(reference or ''):
        raise ValueError('Review must link a public BonusTracker issue or pull request')
    if record.get('status') != 'changed' or record.get('url') != match['url']:
        raise ValueError('Only a pending change for this exact official source can be acknowledged')
    prior, observed = record.get('baselineHash'), record.get('observedHash')
    if not all(isinstance(v, str) and HEX.fullmatch(v) for v in (prior, observed, expected)):
        raise ValueError('Missing verified document hash')
    if observed != expected:
        raise ValueError('The observed document has changed since the proposed review')
    changed_at, checked_at = utc_stamp(record.get('changeAt')), utc_stamp(record.get('checkedAt'))
    if not changed_at or not checked_at or checked_at < changed_at or checked_at > now:
        raise ValueError('Pending check time is invalid or in the future')
    if now - checked_at > dt.timedelta(hours=36):
        raise ValueError('Recheck the official source before acknowledging an overdue observation')
    if prior == observed:
        raise ValueError('A reversion still requires a new explicit review, not a silent baseline reset')
    return {
        'bank': bank, 'role': role, 'offerKey': scope['offerKey'], 'url': match['url'],
        'previousHash': prior, 'reviewedHash': expected,
        'reviewedAt': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'reviewRef': reference,
    }


def approved_change(source, previous, row, decision, now):
    """Approve a specific newly observed fingerprint only after successful refetch."""
    if not isinstance(decision, dict) or row.get('status') != 'changed':
        return False
    if not isinstance(previous, dict) or not previous.get('changeAt'):
        return False
    if not REVIEW_REF.fullmatch(str(decision.get('reviewRef', ''))):
        return False
    when = utc_stamp(decision.get('reviewedAt'))
    change = utc_stamp(previous.get('changeAt'))
    if not when or not change or when < change or when > now:
        return False
    if now - when > dt.timedelta(days=30):
        return False
    if previous.get('lastReviewRef') == decision['reviewRef']:
        return False
    return (decision.get('url') == source['url']
            and decision.get('previousHash') == previous.get('baselineHash')
            and decision.get('reviewedHash') == row.get('observedHash')
            and isinstance(row.get('observedHash'), str)
            and HEX.fullmatch(row['observedHash']) is not None
            and row.get('observedAt') == row.get('checkedAt'))


def update_row(url, prev, observed, timestamp):
    base = prev.get('baselineHash')
    pending = bool(prev.get('changeAt'))
    baseline_signals = valid_signals(prev.get('baselineSignals'))
    observed_signals = valid_signals(prev.get('observedSignals'))
    sticky = prev.get('reviewSignals') if isinstance(prev.get('reviewSignals'), list) else []
    sticky = [x for x in sticky if x in REVIEW_CATEGORIES or x == 'other_terms'][:7]
    row = {
        'url': url,
        'status': 'unavailable',
        'baselineHash': base if base else None,
        'observedHash': prev.get('observedHash') if isinstance(prev.get('observedHash'), str) and HEX.fullmatch(prev['observedHash']) else None,
        'observedAt': prev.get('observedAt') if prev.get('observedAt') else None,
        'checkedAt': timestamp,
        'changeAt': prev.get('changeAt') if pending else None,
        'baselineSignals': baseline_signals,
        'observedSignals': observed_signals,
        'reviewSignals': sticky,
    }
    if observed is None:
        return row
    # Preserve legacy hash-only observers used in the original synthetic tests.
    if isinstance(observed, dict):
        digest = observed.get('digest')
        signals = valid_signals(observed.get('signals'))
    else:
        digest, signals = observed, None
    if not isinstance(digest, str) or not HEX.fullmatch(digest):
        return row
    row['observedHash'] = digest
    row['observedAt'] = timestamp
    row['observedSignals'] = signals
    if not base:
        row['baselineHash'] = digest
        row['baselineSignals'] = signals
        row['status'] = 'baseline'  # baseline is NOT source approval
    elif digest != base or pending:
        row['status'] = 'changed'
        row['changeAt'] = row['changeAt'] or timestamp
        if digest != base:
            if baseline_signals is not None and signals is not None:
                changed = [k for k in REVIEW_CATEGORIES if baseline_signals.get(k) != signals.get(k)]
            else:
                changed = ['other_terms']  # Do not invent specific changes.
            if not changed:
                changed = ['other_terms']
            row['reviewSignals'] = list(dict.fromkeys(sticky + changed))[:7]
    else:
        row['status'] = 'unchanged'
        # A legacy baseline can safely adopt category digests only while its
        # ENTIRE material fingerprint still matches the original baseline.
        if baseline_signals is None and signals is not None:
            row['baselineSignals'] = signals
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
