"""AETHER 8 theme contract and accessible text palette."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]
CSS=(ROOT/'frontend/assets/cartographic-v8.css').read_text(encoding='utf-8')
INDEX=(ROOT/'frontend/index.html').read_text(encoding='utf-8')
PREVIEW=(ROOT/'scripts/build_preview.py').read_text(encoding='utf-8')
def lum(hexvalue):
    rgb=[int(hexvalue[i:i+2],16)/255 for i in (1,3,5)]
    v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb]
    return sum(x*y for x,y in zip(v,(.2126,.7152,.0722)))
def ratio(a,b):
    a,b=sorted((lum(a),lum(b)),reverse=True)
    return (a+.05)/(b+.05)
def test_theme_loads_last():
    assert INDEX.index('mission-v7.css')<INDEX.index('cartographic-v8.css')
    assert INDEX.index('design-v5.css')<INDEX.index('cartographic-v8.css')
    assert 'cartographic-v8.css' in PREVIEW
def test_palette_contrast():
    colors=dict(re.findall(r'--(chart-[\w-]+)\s*:\s*(#[0-9a-f]{6})',CSS))
    assert ratio(colors['chart-ink'],colors['chart-paper'])>=7
    assert ratio(colors['chart-muted'],colors['chart-paper'])>=4.5
    assert ratio('#ffffff',colors['chart-red'])>=4.5
def test_map_semantics_and_osm_attribution():
    for selector in ['.geo-map .geo-tile','.geo-map .geo-attribution','.geo-map.map-offline:after','.geo-map .geo-overlay line[stroke="#286bdb"]']:
        assert selector in CSS
def test_mission_views():
    for selector in ['.assessment .actual-bar','.assessment .spatial-panel .geo-map','.assessment .inspector-panel','.assessment .desk-player','.assessment .assessment-trend polyline']:
        assert selector in CSS
def test_five_entry_navigation_unchanged():
    app=(ROOT/'frontend/assets/app.js').read_text(encoding='utf-8')
    for name in ['基础数据','想定管理','联合投送方案','行动推演','评估分析']:
        assert name in app
    assert 'landing-modules' in app
