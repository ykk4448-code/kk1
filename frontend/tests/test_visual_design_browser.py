"""AETHER visual-regression smoke test (functional contracts, not pixel snapshots).

Usage: python scripts/build_preview.py && python frontend/tests/test_visual_design_browser.py
This uses offline, read-only fixture HTML. No authentication or network access is required.
"""
from pathlib import Path
import os
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
HTML = (ROOT / 'preview.html').read_text('utf-8')
HTML = re.sub(r'@import url\([^)]*\);', '', HTML)

with sync_playwright() as playwright:
    browser_path = os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium')
    browser = playwright.chromium.launch(
        headless=True,
        args=['--no-sandbox', '--disable-dev-shm-usage'],
        **({'executable_path': browser_path} if Path(browser_path).is_file() else {}),
    )
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.evaluate('''Object.defineProperty(window, 'sessionStorage', {
      configurable: true, value: {getItem(){return null},setItem(){},removeItem(){}}
    })''')
    page.set_content(HTML, wait_until='domcontentloaded', timeout=30000)
    page.locator('.landing-module').first.wait_for()
    assert page.locator('.landing-module').count() == 5
    assert page.locator('button:visible').count() == 5
    assert page.locator('.rail:visible').count() == 0
    assert page.locator('.topbar:visible').count() == 0
    assert page.locator('#geo-map').count() == 1
    assert page.locator('#geo-basemap path').count() == 35
    assert page.locator('.map-stage').evaluate('(el) => getComputedStyle(el).position') == 'fixed'

    routes = [('data', 'nodes'), ('scenario', 'list'), ('planning', 'workspace'),
              ('simulation', 'control'), ('analytics', 'overview')]
    for width, height in [(1440, 900), (768, 1024), (390, 844)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.locator('button:visible').count() == 5
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'landing overflow at {width}'
        for module, tab in routes:
            page.locator(f'.landing-module[data-page="{module}"]').click()
            assert page.evaluate('location.hash') == f'#/{module}/{tab}'
            assert page.locator('.page-heading h1:visible').count() == 1
            assert page.locator('#geo-map').count() == 1
            assert abs(page.locator('#geo-map').evaluate('(el) => el.getBoundingClientRect().height') - height) < 2
            if width > 1150 and module in ('simulation','analytics'):
                page.locator('.schedule-panel').wait_for()
                assert not page.locator('.trend-panel').is_visible()
                assert not page.locator('.inspector-panel').is_visible()
                page.locator('[data-workspace-tool="stats"]').click()
                assert page.locator('.trend-panel').is_visible()
                page.locator('[data-workspace-tool="stats"]').click()
                page.locator('[data-workspace-tool="inspector"]').click()
                assert page.locator('.inspector-panel').is_visible()
                assert not page.locator('.trend-panel').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'{module} overflow at {width}'
            assert page.locator('#nav .rail-link.selected').count() == 1
            # Module controls form a horizontal ribbon, never a left sidebar.
            assert page.locator('.rail').evaluate('(el) => el.getBoundingClientRect().width') >= width - 50
            page.locator('.home-link').click()
            assert page.locator('button:visible').count() == 5
    assert not errors, errors
    browser.close()
print('PASS: five-subsystem portal, horizontal mission ribbon, responsive workspaces, no page overflow or JS errors')
