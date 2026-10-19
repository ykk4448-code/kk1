"""Mission console integration guard: v6 stylesheet retained, v7 event module is active."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HTML=(ROOT/'frontend/index.html').read_text(encoding='utf-8')
CSS=(ROOT/'frontend/assets/mission-v6.css').read_text(encoding='utf-8')
V7=(ROOT/'frontend/assets/mission-v7.js').read_text(encoding='utf-8')

def test_console_css_remains_layered():
    assert 'href="/assets/mission-v6.css"' in HTML
    assert 'href="/assets/mission-v7.css"' in HTML
    assert HTML.index('mission-v6.css') < HTML.index('design-v5.css') < HTML.index('mission-v7.css')
    for selector in ('.desk-layout','.spatial-panel .geo-map','.inspector-panel'):
        assert selector in CSS

def test_the_single_v7_event_controller_is_active():
    assert 'src="/assets/mission-v7.js"' in HTML
    assert 'src="/assets/mission-v6.js"' not in HTML
    assert 'data-ops-seek' in V7
    assert 'data-ops-first-incident' in V7
    assert '#desk-slider' in V7
