"""Chromium smoke test for the strict five-button home and second-level navigation.
Run: python scripts/build_preview.py && python frontend/tests/test_navigation_browser.py
Requires playwright and Chromium. Uses read-only HTML snapshots (not backend writes).
"""
from pathlib import Path
import re
import os
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
html = (root / 'preview.html').read_text('utf-8')
html = re.sub(r'@import url\([^)]*\);', '', html)
with sync_playwright() as p:
    binary = os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium')
    browser = p.chromium.launch(
        headless=True,
        **({'executable_path': binary} if Path(binary).exists() else {}),
        args=['--no-sandbox', '--disable-dev-shm-usage'],
    )
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    # Sandboxed about:blank disallows native sessionStorage.
    page.evaluate("""Object.defineProperty(window,'sessionStorage',{
      configurable:true,value:{getItem(){return null},setItem(){},removeItem(){}}
    })""")
    page.set_content(html, wait_until='domcontentloaded', timeout=30000)
    page.locator('.landing-module').first.wait_for(timeout=30000)
    assert page.locator('button:visible').count() == 5
    assert page.locator('.topbar:visible').count() == 0
    for module, initial_tab in [('data','nodes'), ('scenario','list'),
                                ('planning','workspace'), ('simulation','control'),
                                ('analytics','overview')]:
        page.locator(f'.landing-module[data-page="{module}"]').click()
        assert page.evaluate('location.hash') == f'#/{module}/{initial_tab}'
        assert page.locator('.rail-link.selected').count() == 1
        page.locator('.home-link').click()
        assert page.locator('button:visible').count() == 5
    page.evaluate("location.hash='#/scenario/tasks'")
    page.locator('#nav .rail-link.selected').filter(has_text='任务编排').wait_for()
    page.locator('#nav [data-tab="formations"]').click()
    assert page.evaluate('location.hash') == '#/scenario/formations'
    page.go_back(wait_until='domcontentloaded')
    page.locator('#nav .rail-link.selected').filter(has_text='任务编排').wait_for()
    page.evaluate("location.hash='#/home'")
    page.locator('.landing-module').first.wait_for()
    page.set_viewport_size({'width':390,'height':844})
    assert page.locator('button:visible').count() == 5
    page.locator('.landing-module[data-page="analytics"]').click()
    assert page.locator('.subnav-button:visible').count() == 6
    assert not errors, errors
    browser.close()
print('Five primary destinations and secondary navigation: PASS')
