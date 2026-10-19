"""Static and pure-function regression tests for the AETHER 7 mission console.
Run with pytest; requires Node 22 (already used by CI) for pure-event contracts.
No synthetic indicator is permitted to masquerade as live telemetry.
"""
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
HTML=ROOT/'frontend/index.html'
JS=ROOT/'frontend/assets/mission-v7.js'
CSS=ROOT/'frontend/assets/mission-v7.css'
BUILD=ROOT/'scripts/build_preview.py'


def test_v7_assets_load_in_order():
    html=HTML.read_text(encoding='utf-8')
    assert 'href="/assets/mission-v7.css"' in html
    assert 'src="/assets/mission-v7.js"' in html
    assert html.index('design-v5.css') < html.index('mission-v7.css')
    assert html.index('app.js') < html.index('mission-v7.js')
    assert 'src="/assets/mission-v6.js"' not in html
    assert 'mission-v7.css' in BUILD.read_text(encoding='utf-8')
    assert 'mission-v7.js' in BUILD.read_text(encoding='utf-8')


def test_v7_single_source_of_playback_truth():
    source=JS.read_text(encoding='utf-8')
    assert "'#desk-slider'" in source
    assert "new Event('input',{bubbles:true})" in source
    assert "'/api/v1'" not in source
    assert 'filterEvents' in source and 'normalizedEvents' in source
    assert 'setInterval(ticker,300)' in source
    assert 'data-ops-inspector' in source
    assert 'aria-label' in source
    assert 'data-ops-more' in source
    assert 'document.activeElement?.closest' in source
    assert '#/simulation' not in source # Module only, does not hijack router


def test_v7_layout_responsive():
    css=CSS.read_text(encoding='utf-8')
    for bp in ('1400px','1150px','830px','560px'):
        assert bp in css
    for selector in ('.ops-v7-header','.ops-v7-list','.ops-v7-bookmarks','.ops-v7-inspector-toggle'):
        assert selector in css


def test_event_order_search_and_invalid_data():
    source=JS.read_text(encoding='utf-8')
    source=source.replace("import {get} from './api.js';",'').replace('export function ','function ')
    js=source+'''\nconst A=normalizedEvents({events:[
      {kind:'arrived',at_min:5,vehicle:'B'},
      {kind:'warning',at_min:1,vehicle:'A',message:'环境扰动'},
      {kind:'warning',at_min:'oops'},
      {kind:'position',at_min:3},
      {kind:'dispatch',at_min:0,vehicle:'C'},
      {kind:'failed',at_min:1,vehicle:'D'}
    ]});
    if(A.length!==4||A.map(e=>e.kind).join('|')!=='dispatch|warning|failed|arrived')process.exit(1);
    if(filterEvents(A,{filter:'incident'}).length!==2)process.exit(2);
    if(filterEvents(A,{query:'环境'}).length!==1)process.exit(3);
    if(filterEvents(A,{query:'not-here'}).length!==0)process.exit(4);
    console.log('pure event normalization / sorting / filtering OK');'''
    proc=subprocess.run(['node','--input-type=module','--eval',js],capture_output=True,text=True,timeout=8)
    assert proc.returncode==0,proc.stderr
