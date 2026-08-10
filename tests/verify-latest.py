from pathlib import Path
from html.parser import HTMLParser
import json,re,sys,xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
issues=[]
def fail(msg): issues.append(msg)
def text(path): return (ROOT/path).read_text(encoding='utf-8')

files=[p for p in ROOT.rglob('*') if p.is_file() and '.git' not in p.parts]
for p in files:
    if p.stat().st_size==0: fail(f'empty file: {p.relative_to(ROOT)}')

html=text('index.html')
version_match=re.search(r'class="app-version">v([^<]+)',html)
release=version_match.group(1) if version_match else ''
if not release: fail('visible release version missing')

class RefParser(HTMLParser):
    def __init__(self): super().__init__(); self.refs=[]; self.scripts=[]; self.ids=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'): self.ids.append(a['id'])
        if tag=='script' and a.get('src'):
            p=a['src'].split('?',1)[0].removeprefix('./');self.refs.append(p);self.scripts.append(p)
        if tag=='link' and a.get('href') and not a['href'].startswith(('http:','https:','data:')):
            self.refs.append(a['href'].split('?',1)[0].removeprefix('./'))
parser=RefParser();parser.feed(html)
if len(parser.ids)!=len(set(parser.ids)): fail('duplicate static HTML id found')
for ref in parser.refs:
    if not (ROOT/ref).exists(): fail(f'index references missing file: {ref}')
if not parser.scripts or parser.scripts[0]!='close-rules-core.js': fail('close-rules-core.js must be first external script')
if not parser.scripts or parser.scripts[-1]!='mobile-analyzer.js': fail('mobile-analyzer.js must be final external script')
if 'bank-rules-fourleaf.js' not in parser.scripts: fail('FourLeaf analyzer rule is not loaded')
elif parser.scripts.index('bank-rules-fourleaf.js')<parser.scripts.index('bank-rules.js'): fail('FourLeaf rule must load after the base bank rules')
if 'bank-rules-wells-consumer.js' not in parser.scripts: fail('Wells Fargo consumer analyzer rule is not loaded')
elif parser.scripts.index('bank-rules-wells-consumer.js')<parser.scripts.index('bank-rules.js'): fail('Wells consumer rule must load after the base bank rules')
if 'churn-close-policy.js' not in parser.scripts: fail('confirmed-close-date churn policy is not loaded')
elif parser.scripts.index('churn-close-policy.js')<parser.scripts.index('wells-professional-runtime.js'): fail('churn close-date policy must load after professional runtime')
elif parser.scripts.index('churn-close-policy.js')>parser.scripts.index('mobile-analyzer.js'): fail('churn close-date policy must load before mobile release marker')

root_js=sorted(p.name for p in ROOT.glob('*.js') if p.name!='sw.js')
if sorted(parser.scripts)!=root_js:
    fail('root JavaScript files and index runtime scripts differ: '+str(sorted(set(root_js)^set(parser.scripts))))
root_css=sorted(p.name for p in ROOT.glob('*.css'))
index_css=sorted(x for x in parser.refs if x.endswith('.css'))
if root_css!=index_css: fail('root CSS files and index stylesheets differ')
if not index_css or 'mobile-analyzer.css' not in index_css: fail('mobile analyzer stylesheet is not loaded')

sw=text('sw.js')
m=re.search(r'const ASSETS\s*=\s*\[(.*?)\];',sw,re.S)
if not m: fail('service worker ASSETS list missing')
else:
    assets=[x.removeprefix('./') for x in re.findall(r"['\"]([^'\"]+)['\"]",m.group(1))]
    if len(assets)!=len(set(assets)): fail('duplicate service-worker asset')
    for a in assets:
        if not (ROOT/a).exists(): fail(f'service worker references missing file: {a}')
    for ref in parser.refs:
        if ref not in assets: fail(f'index asset is not cached by service worker: {ref}')

try: manifest=json.loads(text('manifest.json'))
except Exception as e: fail(f'manifest invalid JSON: {e}');manifest={}
for key in ('name','short_name','start_url','display','icons'):
    if key not in manifest: fail(f'manifest missing {key}')
for icon in manifest.get('icons',[]):
    src=str(icon.get('src','')).removeprefix('./')
    if src and not (ROOT/src).exists(): fail(f'manifest icon missing: {src}')
try: ET.parse(ROOT/'icon.svg')
except Exception as e: fail(f'icon.svg invalid XML: {e}')

for css in ROOT.glob('*.css'):
    s=css.read_text(encoding='utf-8')
    if s.count('{')!=s.count('}'): fail(f'CSS brace mismatch: {css.name}')

mobile_css=text('mobile-analyzer.css')
for token in ('#tca_overlay .tca-box','overflow-y:auto!important','-webkit-overflow-scrolling:touch','touch-action:pan-y'):
    if token not in mobile_css: fail(f'mobile analyzer scroll protection missing: {token}')

fourleaf=text('bank-rules-fourleaf.js')
for token in ("r.reqMoney=500","r.reqDays=90","r.closeRestrictionType='payout-only'","r.churnable=false","24 consecutive"):
    if token not in fourleaf: fail(f'FourLeaf rule missing required logic: {token}')

wells=text('bank-rules-wells-consumer.js')
for token in (
    'Wells Fargo Consumer Checking $400',
    'r.reqMoney=1000',
    'r.reqIsTotal=true',
    'r.reqDays=90',
    'r.fundedDays=0',
    'r.holdDays=0',
    "r.closeRestrictionType='payout-only'",
    "r.churnable=true",
    "r.churn='1'",
    "r.churnBasis='closed'",
    "r.sourceEligibilityBasis='bonus-received'",
    "r.churnTrackingPolicy='confirmed-close-date'",
    'r.churnBufferDays=0',
    'Consumer Account Fee and Information Schedule'
):
    if token not in wells: fail(f'Wells consumer exact-rule logic missing: {token}')

memory=text('churn-profile-memory.js')
for token in ('profileKey:keyFor(r)','accountType:typeFor(r)','compatibleProduct','opts.noGlobalFallback','opts.selfTest','opts.testMode','business and personal offers never cross-fill'):
    if token not in memory: fail(f'product-safe analyzer memory protection missing: {token}')

app_js=text('app.js')
for token in ('isNonRepeatableEntry','archived-nonrepeatable',"return'ARCHIVED'",'Closed & Archived','Non-repeatable offer'):
    if token not in app_js: fail(f'archive lifecycle missing from app.js: {token}')
for token in ('Future Eligibility *','Can this bonus be earned again? *','hasSavedChurnDecision','Future eligibility is required before creating this bank','Eligibility Reset / Churn Rule *'):
    if token not in app_js: fail(f'churnability intake gate missing from app.js: {token}')

runtime_fix=text('wells-professional-runtime.js')
for token in ('repairWellsConsumer400Entry','Requirement Due','requirementSummaryForEntry','churnBasisDate','Key Deadlines','Lifecycle & Deadlines','btWellsProfessionalRuntimeVersion','normalizeLifecycleEntry'):
    if token not in runtime_fix: fail(f'professional Wells runtime repair missing: {token}')

controller=text('controller.js')
professional=text('professional-upgrades.js')
for token in ('tcV3MakeSuggestedTimers','tcApplyReviewed','rModal'):
    if token not in controller+professional: fail(f'legacy analyzer/professional hook missing: {token}')
for token in ('wellsSuggestedTimers','Can this bonus be earned again? *','Future eligibility','Separate fee schedule','Fee Schedule','requirementSummaryForEntry','polishAnalyzerDom','tcApplyReviewed','After '+"'+fM(e.bonus||0)+'"+' posts'):
    if token not in runtime_fix: fail(f'professional Wells runtime behavior missing: {token}')

churn_policy=text('churn-close-policy.js')
for token in ('confirmed bank close date','churnBasisDate','nextReopen','churnReadyDate','churnBufferDaysFor','churnTrackingPolicy','Churn countdown starts after confirmed closure','collectModalEntryData','normalizeLifecycleEntry'):
    if token not in churn_policy: fail(f'confirmed-close-date churn policy missing: {token}')

close_core=text('close-rules-core.js')
for token in ('Payout attempt wording recognized','attempt to deposit the bonus'):
    if token not in close_core: fail(f'payout-attempt close wording support missing: {token}')

integration=text('close-rules-integration.js')
for token in ("nonRepeatable(e)?'ARCHIVED'",'Closed / Archived','Non-repeatable offer','__tcV3WellsConsumerRulesWrapped','After '+"'+fM(e.bonus)+'"+' posts'):
    if token not in integration: fail(f'archive/Wells close integration missing: {token}')

runtime_text='\n'.join(p.read_text(encoding='utf-8',errors='ignore') for p in files if p.suffix in {'.js','.html','.css','.json'} and 'tests' not in p.parts)
obsolete='close-rules-'+'v3402.js'
if obsolete in runtime_text: fail('obsolete v3.4.02 patch reference remains')
for critical in ('index.html','sw.js','bank-rules-wells-consumer.js','churn-close-policy.js','mobile-analyzer.js'):
    if release not in text(critical): fail(f'{critical} is not aligned to release {release}')

workflow=text('.github/workflows/close-rules.yml')
for token in (
    'actions/setup-python@v5',
    "python-version: '3.12'",
    'python3 tests/verify-latest.py',
    'node tests/close-rules.test.js',
    'node tests/full-app-smoke.test.js',
    'needs: verify',
    'actions/configure-pages@v5',
    'enablement: true',
    'actions/upload-pages-artifact@v4',
    'actions/deploy-pages@v4',
    'name: github-pages'
):
    if token not in workflow: fail(f'verify/deploy workflow missing: {token}')
if workflow.find('needs: verify')>workflow.find('actions/deploy-pages@v4'):
    fail('Pages deploy is not gated behind verification')

if issues:
    print(f'LATEST RELEASE VERIFY FAILED v{release}: {len(issues)} issue(s)')
    for issue in issues: print('FAIL',issue)
    sys.exit(1)
print(f'LATEST RELEASE VERIFIED v{release}: {len(files)} files · all asset, format, cache, Wells accuracy, analyzer isolation, archive lifecycle, churn intake, professional UI, and verify-before-deploy checks passed')
