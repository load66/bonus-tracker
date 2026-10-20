"""Pure mocked tests for public-source change monitoring. No live bank requests."""
import datetime as dt
import importlib.util
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('watch_source', root / 'scripts/watch-quick-add-sources.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

manifest = json.loads((root / 'data/quick-add-source-manifest.json').read_text('utf-8'))
now = dt.datetime(2026, 10, 20, 19, 0, tzinfo=dt.timezone.utc)
live_url = manifest['records']['Capital One']['sources'][0]['url']
fee_url = manifest['records']['Wells Fargo']['sources'][1]['url']

for bank, data in manifest['records'].items():
    assert sorted(source['role'] for source in data['sources']) == ['fees', 'promotion']
    for source in data['sources']:
        assert m.safe(source['url'], bank)
assert not m.safe('https://www.capitalone.com.evil.invalid/bank/', 'Capital One')
assert not m.safe('http://www.capitalone.com/bank/', 'Capital One')
assert not m.safe('https://www.capitalone.com@evil.invalid/', 'Capital One')
assert not m.safe('https://example.com/', 'Wells Fargo')

page1 = b'''<html><header>Navigation</header><main>
<p>Open a new checking account and earn a $250 bonus after eligible direct deposits.</p>
<p>Qualifying direct deposits are required within 75 days of account opening.</p>
<p>The monthly maintenance fee is $0 if the relevant conditions are satisfied.</p>
<p>Current and previous customers may be ineligible for this new account promotion.</p>
</main><script>const randomToken = "noisy-123";</script></html>'''
page2 = page1.replace(b'75 days', b'90 days')
assert m.material_hash(page1) != m.material_hash(page2), 'Relevant activity deadline change undetected'
assert m.material_hash(page1) == m.material_hash(page1.replace(b'noisy-123', b'noisy-999')), 'JavaScript noise changed terms hash'
try:
    m.material_hash(b'<html><body>Captcha access denied</body></html>')
    raise AssertionError('Blocked page must be unavailable')
except ValueError:
    pass

hash1 = m.material_hash(page1)
hash2 = m.material_hash(page2)
baseline = m.build(manifest, {}, now, lambda url, bank: hash1)
assert len(baseline['records']) == 2
for record in baseline['records'].values():
    for source in record['sources'].values():
        assert source['status'] == 'baseline', 'Initial observation must not claim verification'
next_time = now + dt.timedelta(hours=6)
stable = m.build(manifest, baseline, next_time, lambda url, bank: hash1)
assert all(source['status'] == 'unchanged' for record in stable['records'].values() for source in record['sources'].values())
changed = m.build(manifest, stable, next_time, lambda url, bank: hash2 if url == live_url else hash1)
assert changed['records']['Capital One']['sources']['promotion']['status'] == 'changed'
assert changed['records']['Capital One']['sources']['fees']['status'] == 'unchanged'
assert changed['records']['Wells Fargo']['sources']['fees']['status'] == 'unchanged'
old_marker = changed['records']['Capital One']['sources']['promotion']['changeAt']
reverted = m.build(manifest, changed, next_time + dt.timedelta(hours=6), lambda url, bank: hash1)
assert reverted['records']['Capital One']['sources']['promotion']['status'] == 'changed', 'Unreviewed changes must remain flagged'
assert reverted['records']['Capital One']['sources']['promotion']['changeAt'] == old_marker
def partial(url, bank):
    if url in (live_url, fee_url):
        raise OSError('synthetic official website unavailable')
    return hash1
outage = m.build(manifest, changed, next_time, partial)
assert outage['records']['Capital One']['sources']['promotion']['status'] == 'unavailable'
assert outage['records']['Capital One']['sources']['promotion']['changeAt'] == old_marker, 'Outage cannot clear change warning'
assert outage['records']['Wells Fargo']['sources']['fees']['status'] == 'unavailable'
assert outage['records']['Capital One']['sources']['promotion']['baselineHash'] == hash1
invalid = json.loads(json.dumps(manifest))
invalid['records']['Capital One']['sources'][0]['url'] = 'https://www.capitalone.com.evil.invalid/bonus/'
try:
    m.build(invalid, {}, now, lambda url, bank: hash1)
    raise AssertionError('Unsafe manifest allowed')
except ValueError:
    pass
print('Public source monitor PASS: strict hosts, meaningful terms changes, sticky warning, outages, no writes to enrolled terms')
