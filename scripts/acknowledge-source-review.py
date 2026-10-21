"""Create a deliberately scoped, human-reviewed source-change acknowledgement.

This does NOT verify a bank bonus, update an offer, or modify any tracker data.
Run only after reviewing the exact current official bank document and linked
BonusTracker issue/PR. Commit the generated ledger change for normal PR review.
"""
import argparse
import datetime as dt
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/watch-quick-add-sources.py'
spec = importlib.util.spec_from_file_location('quick_add_watch', SCRIPT)
watch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(watch)


def add_decision(ledger, decision):
    if ledger.get('schemaVersion') != 1 or not isinstance(ledger.get('decisions'), list):
        raise ValueError('Unexpected public review ledger format')
    entries = ledger['decisions']
    if len(entries) > 40:
        raise ValueError('Review ledger exceeds audited retention limit')
    # One currently applicable decision per exact bank and source role.
    new = [x for x in entries if isinstance(x, dict) and
           (x.get('bank'), x.get('role')) != (decision['bank'], decision['role'])]
    new.append(decision)
    return {'schemaVersion': 1, 'decisions': new[-40:]}


def main():
    parser = argparse.ArgumentParser(description='Record reviewed official source fingerprint, not offer approval')
    parser.add_argument('--bank', required=True, choices=sorted(watch.HOSTS))
    parser.add_argument('--role', required=True, choices=sorted(watch.ROLES))
    parser.add_argument('--observed-hash', required=True, help='Exact SHA-256 from the current public watch file')
    parser.add_argument('--review-ref', required=True, help='Public https://github.com/load66/bonus-tracker/issues/N or /pull/N')
    parser.add_argument('--confirm-reviewed', action='store_true', help='I personally checked this exact official source')
    args = parser.parse_args()
    if not args.confirm_reviewed:
        parser.error('Explicit --confirm-reviewed is required; a monitor hash is not offer verification')

    manifest = json.loads(watch.MANIFEST.read_text('utf-8'))
    current = json.loads(watch.OUTPUT.read_text('utf-8'))
    row = current.get('records', {}).get(args.bank, {}).get('sources', {}).get(args.role, {})
    decision = watch.review_decision(
        args.bank, args.role, row, manifest, args.observed_hash, args.review_ref,
        dt.datetime.now(dt.timezone.utc))
    ledger = json.loads(watch.DECISIONS.read_text('utf-8'))
    amended = add_decision(ledger, decision)
    watch.DECISIONS.write_text(json.dumps(amended, indent=2, sort_keys=True)+'\n', 'utf-8')
    print('Recorded pending public source review for', args.bank, args.role,
          '- applicable only if the next successful check matches the exact reviewed hash.')
    print('No offer status, financial record, or customer eligibility was approved.')


if __name__ == '__main__':
    main()
