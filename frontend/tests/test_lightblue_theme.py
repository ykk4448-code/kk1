"""AETHER 9 palette and loading-order contract (no external services)."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]
CSS=(ROOT/'frontend/assets/lightblue-v9.css').read_text(encoding='utf-8')
INDEX=(ROOT/'frontend/index.html').read_text(encoding='utf-8')
BUILDER=(ROOT/'scripts/build_preview.py').read_text(encoding='utf-8')

def _relative_luminance(hex_value):
    rgb=[int(hex_value[i:i+2],16)/255 for i in (1,3,5)]
    linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
    return sum(a*b for a,b in zip(linear,(.2126,.7152,.0722)))

def _contrast(a,b):
    aa,bb=sorted((_relative_luminance(a),_relative_luminance(b)),reverse=True)
    return (aa+.05)/(bb+.05)

def test_theme_after_previous_layers():
    assert INDEX.index('cartographic-v8.css') < INDEX.index('lightblue-v9.css')
    assert INDEX.index('mission-v7.css') < INDEX.index('lightblue-v9.css')
    assert 'lightblue-v9.css' in BUILDER

def test_palette_is_blue_and_legible():
    palette=dict(re.findall(r'--(sky-[\w-]+)\s*:\s*(#[0-9a-f]{6})',CSS))
    assert _contrast(palette['sky-900'],palette['sky-50'])>=7
    assert _contrast(palette['sky-muted'],palette['sky-50'])>=4.5
    assert _contrast('#ffffff',palette['sky-600'])>=4.5
    assert palette['sky-100'].startswith('#e')

def test_app_surfaces_have_palette_coverage():
    for selector in (
        '.portal-landing','.landing-module','.workspace-mode .rail',
        '.workspace-mode .card','.workspace-mode table th',
        '.geo-map .geo-tile','.geo-map .geo-attribution',
        '.geo-map .geo-overlay line[stroke="#286bdb"]',
        '.assessment .schedule-row.chosen','.assessment .actual-bar.interrupted',
        '.assessment .spatial-panel .geo-map','.assessment .inspector-panel',
        '.assessment .desk-player','.assessment .assessment-trend polyline',
    ):
        assert selector in CSS,selector

def test_first_level_remains_five_modules():
    app=(ROOT/'frontend/assets/app.js').read_text(encoding='utf-8')
    for label in ('空投资源','应急场景','空投方案','空投仿真','实验评估'):
        assert label in app
    assert 'landing-modules' in app
