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

record_response={"schemaVersion":1,"status":"complete","records":{offer["url"]:record},"usage":{"cacheHits":3,"queued":1},"coverage":["Everyday Checking"]}
m.download=lambda _:json.dumps(record_response).encode()
with_usage=m.attach_verification({"offers":[offer]}, {})
assert with_usage["verification"]["usage"]["cacheHits"]==3
assert with_usage["verification"]["coverage"]==["Everyday Checking"]
m.download=original

record.update(offerTitle=offer['title'],offerUrl=offer['url'])
m.download=lambda _:json.dumps({'schemaVersion':1,'status':'complete','records':{offer['url']:record}}).encode()
scoped=m.attach_availability({'offers':[offer]}, {})
assert scoped['availability']['records'][offer['url']]==record
changed=m.attach_availability({'offers':[{**offer,'title':'Different promotion'}]}, {})
assert changed['availability']['records']=={}
m.download=offline
failed=m.attach_availability({'offers':[offer]}, {'availability':scoped['availability']})
assert failed['availability']['status']=='unavailable' and failed['availability']['records']==scoped['availability']['records']
m.download=original
print('Official availability attachment passed: exact offer identity and unchanged evidence timestamps on outage')


# Canonical lifecycle and cross-source fixtures: all synthetic, no provider calls.
def rss(title, url, stamp, summary=''):
    import html as html_module
    return ('<rss><channel><item><title>' + html_module.escape(title) + '</title>'
            '<link>' + html_module.escape(url) + '</link><pubDate>' + stamp
            + '</pubDate><category>Bank Promotions</category>'
            '<description>' + html_module.escape(summary) + '</description></item></channel></rss>').encode()

def feeds(doc=None, hmb=None):
    def synthetic(url):
        if 'doctorofcredit.com' in url and doc:
            return doc
        if 'hustlermoneyblog.com' in url and hmb:
            return hmb
        raise OSError('synthetic source not configured')
    return synthetic

chase_doc='https://www.doctorofcredit.com/chase-400-checking-bonus/'
chase_hmb='https://www.hustlermoneyblog.com/chase-total-checking-bonus/'
t0=dt.datetime(2026,10,17,tzinfo=dt.timezone.utc)
doc400=rss('JPMorgan Chase $400 Checking Bonus',chase_doc,'Thu, 15 Oct 2026 12:00:00 +0000')
hmb400=rss('Chase Total Checking $400 Bonus',chase_hmb,'Fri, 16 Oct 2026 12:00:00 +0000')
m.download=feeds(doc400,hmb400)
merged=m.build_payload(t0)
assert merged['schemaVersion']==3
assert len(merged['offers'])==1, 'HMB and DoC must merge one real Chase offer'
one=merged['offers'][0]
assert one['bank']=='JPMorgan Chase' and one['product']=='checking' and one['amount']==400
assert len(one['links'])==2 and {x['sourceId'] for x in one['links']}=={'doc','hmb'}
assert one['title']=='Chase Total Checking $400 Bonus'
assert one['displayTitle']=='JPMorgan Chase · Checking · $400'
assert 'New' in one['badges']

# A newer different reward replaces, rather than creating a parallel active offer.
hmb500=rss('Chase Total Checking $500 Bonus',chase_hmb,'Sun, 18 Oct 2026 12:00:00 +0000')
t1=t0+dt.timedelta(days=2)
m.download=feeds(doc400,hmb500)
increased=m.build_payload(t1,merged)
assert len(increased['offers'])==1
assert increased['offers'][0]['amount']==500
assert increased['offers'][0]['badges'][0]=='Increased'
assert increased['offers'][0]['change']['from']==400 and increased['offers'][0]['change']['to']==500
assert all('400' not in x['title'] for x in increased['offers'][0]['links'])
assert increased['offers'][0]['id']!=one['id']

# Newest Update post controls headline; same product and amount retain identity.
doc500=rss('(Update) JPMorgan Chase $500 Checking Bonus',chase_doc,'Mon, 19 Oct 2026 12:00:00 +0000',
           'Offer ends 10/25/26.')
t2=t1+dt.timedelta(days=1)
m.download=feeds(doc500,hmb500)
updated=m.build_payload(t2,increased)
assert len(updated['offers'])==1
assert updated['offers'][0]['id']==increased['offers'][0]['id']
assert updated['offers'][0]['title'].startswith('(Update)')
assert 'Updated' in updated['offers'][0]['badges']
assert 'Ending soon' in updated['offers'][0]['badges']
assert updated['offers'][0]['expiresAt']=='2026-10-25', 'Summary expiry was not parsed'
assert len(updated['offers'][0]['links'])==2
assert m.parse_expiry('Chase $400 Checking Bonus','Expires October 31, 2026')=='2026-10-31'
assert m.parse_expiry('Chase $400 Checking Bonus','No expiry mentioned') is None

# Explicit ended article removes this offer and its superseded earlier $400 post.
ended=rss('(Expired) Chase Total Checking $500 Bonus',chase_hmb,'Tue, 20 Oct 2026 12:00:00 +0000')
t3=t2+dt.timedelta(days=1)
m.download=feeds(doc400,ended)
retired=m.build_payload(t3,updated)
assert retired['offers']==[], 'An ended offer cannot resurrect at its previous amount'
assert retired['endedOffers'], 'Persist ending tombstone across refresh runs'
m.download=feeds(doc400,None)
assert m.build_payload(t3+dt.timedelta(days=1),retired)['offers']==[], 'Tombstone must survive next RSS refresh'

# Region and product are part of identity; NEVER borrow evidence from another offer.
savings=rss('Chase $500 Savings Bonus',chase_hmb,'Mon, 19 Oct 2026 12:00:00 +0000')
checking_ca=rss('[CA Only] Chase $500 Checking Bonus',chase_doc,'Mon, 19 Oct 2026 12:00:00 +0000')
m.download=feeds(checking_ca,savings)
distinct=m.build_payload(t2)
assert len(distinct['offers'])==2 and distinct['offers'][0]['id']!=distinct['offers'][1]['id']
ca=next(o for o in distinct['offers'] if o['product']=='checking')
save=next(o for o in distinct['offers'] if o['product']=='savings')
assert ca['region']=='CA' and save['region']=='unknown'
assert all(x['url']==ca['url'] for x in ca['links'])
fake={'offerFingerprint':hashlib.sha256((ca['title']+'\n'+ca['url']).encode()).hexdigest(),
      'offerTitle':ca['title'],'offerUrl':ca['url']}
assert m.matching_evidence({ca['url']:fake}, {'offers':[save]},require_title=True)=={}
assert m.matching_evidence({ca['url']:fake}, {'offers':[ca]},require_title=True)[ca['url']]['offerTitle']==ca['title']
fake_bad={**fake,'offerTitle':save['title']}
assert m.matching_evidence({ca['url']:fake_bad}, {'offers':[ca]},require_title=True)=={}

# Keep an offer through an empty source refresh; expire after 90 days without a new post.
m.download=offline
kept=m.build_payload(t2+dt.timedelta(days=10),distinct)
assert len(kept['offers'])==2
old=m.build_payload(t2+dt.timedelta(days=91),distinct)
assert old['offers']==[]
m.download=original
print('Canonical feed lifecycle passed: alias merge, 400→500, Update, expired tombstones, summary dates, source isolation, 90-day retention')
