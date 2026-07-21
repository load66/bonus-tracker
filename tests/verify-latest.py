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

runtime_text='\n'.join(p.read_text(encoding='utf-8',errors='ignore') for p in files if p.suffix in {'.js','.html','.css','.json'} and 'tests' not in p.parts)
obsolete='close-rules-'+'v3402.js'
if obsolete in runtime_text: fail('obsolete v3.4.02 patch reference remains')
for critical in ('index.html','sw.js','bank-rules-fourleaf.js','mobile-analyzer.js','mobile-analyzer.css'):
    if release not in text(critical): fail(f'{critical} is not aligned to release {release}')
workflow=text('.github/workflows/close-rules.yml')
for cmd in ('node tests/close-rules.test.js','node tests/full-app-smoke.test.js','python tests/verify-latest.py'):
    if cmd not in workflow: fail(f'workflow missing: {cmd}')

if issues:
    print(f'LATEST RELEASE VERIFY FAILED v{release}: {len(issues)} issue(s)')
    for issue in issues: print('FAIL',issue)
    sys.exit(1)
print(f'LATEST RELEASE VERIFIED v{release}: {len(files)} files · all asset, format, cache, analyzer, and mobile-scroll checks passed')
