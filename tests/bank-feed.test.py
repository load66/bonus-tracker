import datetime as dt
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1] / 'scripts/update-bank-feed.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
for title in ('Chase $900 Checking Bonus', '[MO] Busey Bank $500 Bonus', 'Unitus Community Credit Union $300', 'Savings $100 Bonus'):
    assert m.bank_bonus(title, ['Bank Accounts']), title
for title in ('Binance $200 bonus', 'TastyTrade Brokerage Bonus', 'Chase Credit Card $300 Bonus', 'Best Bank Bonuses Roundup', '[Expired] Bank $400 Bonus', 'Bank Fee Increase', 'Bank IRA $200 Bonus'):
    assert not m.bank_bonus(title, ['Bank Accounts']), title
assert not m.bank_bonus('Chase Checking $500 Bonus', ['Credit Cards'])
now = dt.datetime(2026, 10, 13, tzinfo=dt.timezone.utc)
def item(title, date, link='https://www.doctorofcredit.com/checking-bonus/'):
    return f'<item><title>{title}</title><link>{link}</link><pubDate>{date}</pubDate><category>Bank Accounts</category></item>'
good = item('Bank Checking $500 Bonus', 'Sun, 11 Oct 2026 12:00:00 +0000')
raw = '<rss><channel>' + good + good + item('Future Bank $500 Bonus', 'Mon, 19 Oct 2026 12:00:00 +0000') + item('Bad Bank $500 Bonus', 'bad') + item('Unsafe Bank $500 Bonus', 'Sun, 11 Oct 2026 12:00:00 +0000', 'javascript:alert(1)') + '</channel></rss>'
rows = m.parse_feed(raw, now)
assert len(rows) == 1
assert rows[0]['title'] == 'Bank Checking $500 Bonus'
try:
    m.parse_feed('<html>blocked</html>', now)
    raise AssertionError('Accepted non-RSS')
except ValueError:
    pass
print('Bank RSS filter passed: bank-only categories, exclusions, deduplication, future/invalid dates and unsafe URLs')
assert m.bank_bonus('American Express $300 Checking Bonus', ['Bank Account Bonuses'])
assert not m.bank_bonus('American Express Credit Card Bonus', ['Bank Account Bonuses'])
assert m.availability('Wells Fargo $325 Checking Bonus (Nationwide)', [], '') == 'nationwide'
assert m.availability('U.S. Bank $450 Checking Bonus', [], '') == 'unknown'
assert m.availability('[MO] Bank $300 Checking Bonus', [], '') == 'regional'
assert m.availability('Bank $300 Checking Bonus', ['nationwide bank bonuses'], '') == 'nationwide'
assert m.availability('[MO] Bank $300 Bonus (Nationwide)', [], '') == 'unknown'
assert m.availability('Bank $300 Bonus', [], 'Not available nationwide') == 'unknown'
assert m.availability('Bank $300 Bonus', [], 'Available nationwide except Alaska') == 'unknown'
assert m.availability('Bank $300 Bonus', [], 'Availability: Nationwide') == 'nationwide'
assert m.title_key('U.S. Bank $450 Checking Bonus') == m.title_key('Earn $450 bonus with a new US Bank checking')
assert m.title_key('Bank $450 Checking Bonus') != m.title_key('Bank $500 Checking Bonus')
assert m.title_key('Bank $450 Checking Bonus') != m.title_key('Bank $450 Business Checking Bonus')
assert m.safe_link('https://frequentmiler.com/checking/', m.SOURCES[1])
assert not m.safe_link('https://frequentmiler.com.evil.test/checking/', m.SOURCES[1])
assert not m.safe_link('https://user@frequentmiler.com/checking/', m.SOURCES[1])
assert not m.safe_link('https://frequentmiler.com:bad/checking/', m.SOURCES[1])
original=m.download
def offline(url): raise OSError('synthetic source outage')
m.download=offline
previous={'schemaVersion':1,'checkedAt':'2026-10-11T12:00:00+00:00','offers':rows}
payload=m.build_payload(now, previous)
assert payload['checkedAt']==previous['checkedAt']
assert len(payload['offers'])==1
assert all(s['status']=='unavailable' for s in payload['sources'])
try:
    m.build_payload(now)
    raise AssertionError('Uninitialized outage should block publication')
except ValueError: pass
def partial(url):
    if 'hustlermoneyblog' in url:
        return '<rss><channel><item><title>Wells Fargo $325 Checking Bonus (Nationwide)</title><link>https://www.hustlermoneyblog.com/wells-fargo-promotions/</link><pubDate>Sun, 11 Oct 2026 12:00:00 +0000</pubDate><category>Bank Promotions</category></item></channel></rss>'
    raise OSError('synthetic outage')
m.download=partial
payload=m.build_payload(now, previous)
assert len(payload['offers'])==2
assert payload['sources'][2]['status']=='ok'
assert payload['sources'][0]['checkedAt']==previous['checkedAt']
m.download=original
print('Multi-source coverage passed: availability evidence, conservative title keys, per-source fallback, partial outage and no false freshness')
import hashlib
offer={'title':'Wells Fargo $325 Checking Bonus','url':'https://www.hustlermoneyblog.com/wells-fargo-checking-bonus/'}
record={'offerFingerprint':hashlib.sha256((offer['title']+'\n'+offer['url']).encode()).hexdigest(),'status':'evidence-found','fields':{}}
def evidence_response(url):return json.dumps({'schemaVersion':1,'status':'complete','records':{offer['url']:record}}).encode()
import json
m.download=evidence_response
attached=m.attach_verification({'offers':[offer]}, {})
assert attached['verification']['records'][offer['url']]['offerTitle']==offer['title']
changed=m.attach_verification({'offers':[{**offer,'title':'Wells Fargo $500 Checking Bonus'}]}, {})
assert changed['verification']['records']=={}
m.download=offline
old={'verification':attached['verification']}
failed=m.attach_verification({'offers':[offer]}, old)
assert failed['verification']['status']=='unavailable'
assert failed['verification']['records']==attached['verification']['records']
m.download=original
print('Evidence attachment passed: exact offer fingerprint, changed-headline isolation and unavailable-state preservation')
