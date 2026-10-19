"""Static UI integration contracts for the mission operations enhancement."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HTML=(ROOT/'frontend/index.html').read_text(encoding='utf-8')
CSS=(ROOT/'frontend/assets/mission-v6.css').read_text(encoding='utf-8')
JS=(ROOT/'frontend/assets/mission-v6.js').read_text(encoding='utf-8')

def test_asset_references():
    assert 'href="/assets/mission-v6.css"' in HTML
    assert 'src="/assets/mission-v6.js"' in HTML
    assert HTML.index('workbench.css') < HTML.index('mission-v6.css')
    assert HTML.index('app.js') < HTML.index('mission-v6.js')

def test_event_navigation_reuses_single_playback_state():
    assert "'#desk-slider'" in JS
    assert "new Event('input',{bubbles:true})" in JS
    assert 'data-ops-filter' in JS
    assert 'data-ops-warning' in JS
    assert "'/api/v1'" not in JS  # Existing API helper owns the prefix

def test_responsive_map_and_selection_styles():
    assert '.desk-layout' in CSS
    assert '.spatial-panel .geo-map' in CSS
    assert '.inspector-panel' in CSS
    for bp in ['1400px','1150px','830px','580px']:
        assert bp in CSS
    assert 'prefers-reduced-motion' in CSS
