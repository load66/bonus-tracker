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
