import datetime as dt
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1] / 'scripts/update-bank-feed.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
for title in ('Chase $900 Checking Bonus', '[MO] Busey Bank $500 Bonus', 'Unitus Community Credit Union $300', 'Savings $100 Bonus'):
    assert m.bank_bonus(title, ['Bank Accounts']), title
for title in ('Binance $200 bonus', 'TastyTrade Brokerage Bonus', 'Chase Credit Card $300 Bonus', 'Best Bank Bonuses Roundup', 'Bank Fee Increase', 'Bank IRA $200 Bonus'):
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


# Canonical identity / retention regressions run entirely against synthetic RSS.
def rss(title, source, timestamp, summary=''):
    return m.post_row(title,'https://'+source['hosts'][0]+'/synthetic-offer/',timestamp,source,['Bank Promotions'],summary)
newer=now-dt.timedelta(hours=1)
older=now-dt.timedelta(days=12)
chase_hmb=rss('Chase Total Checking $400 Bonus',m.SOURCES[2],older)
chase_doc=rss('(Update) JPMorgan Chase Total Checking $400 Bonus',m.SOURCES[0],newer)
cross=m.merge_offers([], [chase_hmb,chase_doc],now)
assert len(cross)==1 and len(cross[0]['links'])==2, cross
assert cross[0]['title']==chase_doc['title']
assert 'Updated' in cross[0]['badges']

old_300=rss('Chase Total Checking $300 Bonus',m.SOURCES[2],older)
new_400=rss('Chase Total Checking $400 Bonus',m.SOURCES[2],newer)
changed=m.merge_offers([old_300], [new_400],now)
assert len(changed)==1 and changed[0]['amount']==400
assert 'Increased' in changed[0]['badges']
assert changed[0]['changeLabel']=='$300 → $400'
decreased=m.merge_offers([new_400], [rss('Chase Total Checking $250 Bonus',m.SOURCES[0],now)],now)
assert decreased[0]['changeLabel']=='$400 → $250' and 'Decreased' in decreased[0]['badges']

update=m.merge_offers([chase_hmb],[chase_doc],now)
assert 'Updated' in update[0]['badges'] and update[0]['title']==chase_doc['title']
assert m.merge_offers([chase_hmb],[rss('[Expired] Chase Total Checking $400 Bonus',m.SOURCES[2],now)],now)==[]
assert m.merge_offers([chase_hmb],[rss('Chase Total Checking $400 Bonus (Ended)',m.SOURCES[0],now)],now)==[]
assert m.expiry_from_text('Chase $400 Checking Bonus','Expires 10/21/26 after activation')=='2026-10-21'
assert m.expiry_from_text('Chase $400 Checking Bonus','No expiration listed') is None
expiring=rss('Chase Total Checking $400 Bonus',m.SOURCES[0],newer,'Ends 10/21/26')
near=m.merge_offers([], [expiring],now)
assert near[0]['expiresAt']=='2026-10-21' and 'Ending soon' in near[0]['badges']
assert m.merge_offers([], [rss('Chase $400 Checking Bonus',m.SOURCES[0],older,'Expires 10/01/26')],now)==[]

mo=rss('[MO] Chase Total Checking $400 Bonus',m.SOURCES[0],newer)
ks=rss('[KS] Chase Total Checking $400 Bonus',m.SOURCES[2],newer)
assert len(m.merge_offers([], [mo,ks],now))==2,'Different explicit regions must stay separate'
biz=rss('Chase $400 Business Checking Bonus',m.SOURCES[0],newer)
assert len(m.merge_offers([], [chase_doc,biz],now))==2,'Business and consumer offers must not merge'
assert m.identity('U.S. Bank $400 Checking Bonus')['offerKey']==m.identity('US Bank $400 Checking Bonus')['offerKey']
assert m.identity('JPMorgan Chase $400 Checking Bonus')['offerKey']==m.identity('Chase $400 Checking Bonus')['offerKey']

retained=m.merge_offers([rss('Chase $400 Checking Bonus',m.SOURCES[0],now-dt.timedelta(days=70))],[],now)
assert len(retained)==1, 'Old but still active post must survive RSS eviction'
assert m.merge_offers([rss('Chase $400 Checking Bonus',m.SOURCES[0],now-dt.timedelta(days=91))],[],now)==[]
# Direct-URL provenance: a valid verification record for an older source article
# must not authenticate a newer article with the same canonical bank/product/amount.
historical=chase_hmb
replacement=chase_doc
oldProof={'offerFingerprint':hashlib.sha256((historical['title']+'\n'+historical['url']).encode()).hexdigest(),
          'offerTitle':historical['title'],'offerUrl':historical['url']}
m.download=lambda _:json.dumps({'schemaVersion':1,'status':'complete',
                                  'records':{historical['url']:oldProof}}).encode()
projected=m.attach_verification({'offers':[replacement]}, {})
assert projected['verification']['records']=={}, 'Official evidence borrowed from another source/headline'
m.download=original
print('Canonical feed regressions passed: cross-source merge, increase/decrease, updates, ended posts, summary expiry, retention, region separation and provenance')

# No stale source item may resurrect an ended promotion after the tombstone is saved.
ended_post=rss('[Expired] Chase Total Checking $400 Bonus',m.SOURCES[2],now)
tomb=[{'offerKey':ended_post['offerKey'],'endedAt':ended_post['publishedAt']}]
assert m.merge_offers([chase_hmb],[],now,tomb)==[]
assert len(m.merge_offers([], [rss('Chase Total Checking $400 Bonus',m.SOURCES[0],now+dt.timedelta(hours=1))],now+dt.timedelta(hours=2),tomb))==1

# A first-discovered older-dated post is still marked newly discovered.
summary_rss='<rss><channel><item><title>Chase $400 Checking Bonus</title><link>https://www.doctorofcredit.com/synthetic/</link><pubDate>Sun, 11 Oct 2026 12:00:00 +0000</pubDate><description>Expires 10/21/26</description><category>Bank Accounts</category></item></channel></rss>'
fresh_rows=m.parse_feed(summary_rss,now,m.SOURCES[0])
assert fresh_rows[0]['expiresAt']=='2026-10-21'
assert fresh_rows[0]['firstSeen']==now.isoformat()
assert 'New' in m.merge_offers([],fresh_rows,now)[0]['badges']
print('RSS lifecycle passed: persisted ended tombstones, reopen only on newer evidence, first-seen and summary expiry')


# Exact problematic headlines: bonus reward is not the required deposit.
assert m.identity('Chase $900 Checking Bonus ($10,000 Direct Deposit Required)')['amount'] == 900
assert m.identity('US Bank Business $400 or $1200 Bonus')['amount'] == 1200
assert m.identity('US Bank Business $400 or $1200 Bonus')['rewardIsUpperBound']
assert m.identity('Bank of America Business $2,500 Bonus ($25,000 Deposit Required)')['amount'] == 2500
assert m.identity('BoA Business $2,500 Bonus')['bank'] == 'bank of america'
assert m.identity('Bank of America Business $2,500 Bonus')['bank'] == 'bank of america'

chase_combo = rss('Chase $900 Checking & Savings Combo Bonus ($10,000 Direct Deposit Required)', m.SOURCES[2], older)
chase_checking = rss('Chase $900 Checking Bonus ($10,000 Direct Deposit Required)', m.SOURCES[0], newer)
chase_group = m.merge_offers([], [chase_combo, chase_checking], now)
assert len(chase_group) == 1, chase_group
assert len(chase_group[0]['links']) == 2
assert chase_group[0]['amount'] == 900
boa_fm = rss('Bank of America Business Checking $2,500 Bonus ($20,000 Deposit Required)', m.SOURCES[1], older)
boa_hmb = rss('BoA Business Checking $2,500 Bonus', m.SOURCES[2], newer)
boa_group = m.merge_offers([], [boa_fm, boa_hmb], now)
assert len(boa_group) == 1 and len(boa_group[0]['links']) == 2, boa_group
assert boa_group[0]['amount'] == 2500
assert len(m.merge_offers([], [chase_combo, boa_hmb], now)) == 2, 'Never merge distinct banks'
assert len(m.merge_offers([], [chase_combo, rss('Chase $900 Business Checking Bonus',m.SOURCES[0],newer)],now)) == 2, 'Never merge consumer/business'

baseline=m.merge_offers([], [chase_combo], now, baseline=True)
assert not any(b=='New' for b in baseline[0]['badges'])
assert baseline[0]['firstSeenBaseline'] is True
continuation=m.merge_offers(baseline, [chase_checking], now)
assert len(continuation)==1 and 'New' not in continuation[0]['badges']
actual_new=m.merge_offers(baseline, [boa_hmb], now)
assert any(x['bank']=='bank of america' and 'New' in x['badges'] for x in actual_new)
print('Offer rewards, matching promotions and first-snapshot baseline verified')
