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
# Category fingerprints are review hints only; the result stores no page excerpts.
o1 = m.material_observation(page1)
o2 = m.material_observation(page2)
assert o1['digest'] == hash1
assert o2['digest'] == hash2
assert o1['signals']['monthly_fees'] == o2['signals']['monthly_fees'], 'Unrelated fee content should not change'
assert o1['signals']['deadlines'] != o2['signals']['deadlines'], 'Deadline change not isolated'
categorized = m.build(manifest, {}, now, lambda url, bank: o1)
edited = m.build(manifest, categorized, next_time, lambda url, bank: o2 if url == live_url else o1)
record = edited['records']['Capital One']['sources']['promotion']
assert record['status'] == 'changed'
assert 'deadlines' in record['reviewSignals']
assert record['baselineSignals']['deadlines'] == o1['signals']['deadlines']
assert record['observedSignals']['deadlines'] == o2['signals']['deadlines']
assert 'monthly_fees' not in record['reviewSignals'], 'No fabricated fee change'
assert not any('75 days' in json.dumps(record) for _ in [0]), 'No extracted page text stored'
reverted_categories = m.build(manifest, edited, now + dt.timedelta(hours=13), lambda url, bank: o1)
assert 'deadlines' in reverted_categories['records']['Capital One']['sources']['promotion']['reviewSignals'], 'Unreviewed risk must remain flagged after reversion'
lost = m.build(manifest, edited, now + dt.timedelta(hours=13),
               lambda url, bank: None if url == live_url else o1)
assert 'deadlines' in lost['records']['Capital One']['sources']['promotion']['reviewSignals'], 'Outage cannot erase review signals'
legacy = m.build(manifest, baseline, next_time, lambda url, bank: o2 if url == live_url else o1)
assert legacy['records']['Capital One']['sources']['promotion']['reviewSignals'] == ['other_terms'], 'Old hash-only baseline cannot claim exact field changes'
legacy_equal = m.build(manifest, baseline, next_time, lambda url, bank: o1)
assert legacy_equal['records']['Capital One']['sources']['promotion']['baselineSignals'], 'Matching legacy fingerprint may safely initialize categorized baseline'
try:
    m.valid_signals({'untrusted_category': 'a'*64})
    assert m.valid_signals({'untrusted_category': 'a'*64}) is None
except AssertionError:
    raise


# Review acknowledgement must be a PR-audited, exact document decision.
review_time = next_time + dt.timedelta(minutes=10)
ref = 'https://github.com/load66/bonus-tracker/issues/123'
decision = m.review_decision('Capital One', 'promotion',
    changed['records']['Capital One']['sources']['promotion'],
    manifest, hash2, ref, review_time)
assert decision['previousHash'] == hash1
assert decision['reviewedHash'] == hash2
assert decision['offerKey'] == manifest['records']['Capital One']['offerKey']
approved_at = next_time + dt.timedelta(hours=6)
ledger = {'schemaVersion': 1, 'decisions': [decision]}
approved = m.build(manifest, changed, approved_at,
    lambda url, bank: hash2 if url == live_url else hash1, ledger)
reviewed = approved['records']['Capital One']['sources']['promotion']
assert reviewed['status'] == 'unchanged', 'Matching, re-fetched source can be acknowledged'
assert reviewed['baselineHash'] == hash2 and reviewed['changeAt'] is None
assert reviewed['reviewSignals'] == []
assert reviewed['lastReviewRef'] == ref
assert reviewed['lastReviewedAt'] == decision['reviewedAt']
assert approved['records']['Capital One']['sources']['fees']['baselineHash'] == hash1, 'Fee source must stay independent'
assert approved['records']['Wells Fargo']['offerKey'] == manifest['records']['Wells Fargo']['offerKey']
assert approved['schemaVersion'] == 1
after = m.build(manifest, approved, approved_at + dt.timedelta(hours=6),
    lambda url, bank: hash1 if url == live_url else hash1, ledger)
assert after['records']['Capital One']['sources']['promotion']['status'] == 'changed', (
    'A subsequent reversion after review is a NEW change, never silently approved again')
assert after['records']['Capital One']['sources']['promotion']['lastReviewRef'] == ref

# A reversion remains a pending change until a human checks the restored text.
revert_review = m.review_decision(
    'Capital One', 'promotion',
    reverted['records']['Capital One']['sources']['promotion'],
    manifest, hash1, ref, approved_at)
reverted_ok = m.build(manifest, reverted, approved_at + dt.timedelta(minutes=10),
    lambda url, bank: hash1, {'schemaVersion':1,'decisions':[revert_review]})
assert reverted_ok['records']['Capital One']['sources']['promotion']['status'] == 'unchanged'
assert reverted_ok['records']['Capital One']['sources']['promotion']['changeAt'] is None

wrong_hash = {'schemaVersion': 1, 'decisions': [{**decision, 'reviewedHash': 'a'*64}]}
wrong = m.build(manifest, changed, approved_at, lambda url, bank: hash2 if url == live_url else hash1, wrong_hash)
assert wrong['records']['Capital One']['sources']['promotion']['status'] == 'changed'
old_review = {'schemaVersion': 1, 'decisions': [{**decision, 'reviewedAt':'2026-01-01T00:00:00Z'}]}
assert m.build(manifest, changed, approved_at,
    lambda url, bank: hash2 if url == live_url else hash1, old_review
)['records']['Capital One']['sources']['promotion']['status'] == 'changed'
lost_review = m.build(manifest, changed, approved_at,
    lambda url, bank: None if url == live_url else hash1, ledger)
assert lost_review['records']['Capital One']['sources']['promotion']['status'] == 'unavailable'
assert lost_review['records']['Capital One']['sources']['promotion']['changeAt'], 'An outage cannot clear a pending decision'
for bad in [
  ('Wells Fargo','promotion',hash2,ref),
  ('Capital One','fees',hash2,ref),
  ('Capital One','promotion','0'*64,ref),
  ('Capital One','promotion',hash2,'https://github.com/evil/repo/issues/123'),
]:
    try:
        m.review_decision(bad[0],bad[1],changed['records']['Capital One']['sources']['promotion'],
                         manifest,bad[2],bad[3],review_time)
        raise AssertionError('Wrong scope, hash, or review link accepted')
    except ValueError:
        pass
try:
    m.review_decision('Capital One','promotion',
        changed['records']['Capital One']['sources']['promotion'],
        manifest,hash2,ref,next_time + dt.timedelta(hours=40))
    raise AssertionError('Overdue observation can be acknowledged without recheck')
except ValueError:
    pass
assert m.approved_change(
    {'url':live_url},
    changed['records']['Capital One']['sources']['promotion'],
    {'status':'changed','observedHash':hash2,'checkedAt':'2026-10-21T00:00:00Z','observedAt':'old'},
    decision,approved_at) is False, 'Never trust approval without a new successful observation'
# Ledger creation is additive, scoped, and never a public-page or financial write.
review_spec = importlib.util.spec_from_file_location(
    'ack_review', root / 'scripts/acknowledge-source-review.py')
ack = importlib.util.module_from_spec(review_spec)
review_spec.loader.exec_module(ack)
assert ack.add_decision({'schemaVersion':1,'decisions':[]}, decision)['decisions'] == [decision]
replaced = ack.add_decision({'schemaVersion':1,'decisions':[decision]},
    {**decision, 'reviewedHash':'d'*64})
assert len(replaced['decisions']) == 1 and replaced['decisions'][0]['reviewedHash'] == 'd'*64
try:
    ack.add_decision({'schemaVersion':999,'decisions':[]},decision)
    raise AssertionError('Unrecognized ledger format accepted')
except ValueError:
    pass

print('Scoped source review acknowledgements PASS: explicit review reference, current digest, no stale/outage or cross-role approval')

print('Public source monitor PASS: strict hosts, meaningful terms changes, sticky warning, outages, no writes to enrolled terms')
