"""Real Chromium DOM regression of AETHER mission console augmentation.
Offline fixture intentionally uses the same assessment event schema as the backend,
but does not claim an end-to-end backend or geographic tile validation.
"""
import json,re
from pathlib import Path
import pytest
sync_playwright=pytest.importorskip('playwright.sync_api').sync_playwright
SRC=(Path(__file__).resolve().parents[1]/'assets/mission-v7.js').read_text(encoding='utf-8')
SRC=re.sub(r'^import .*?;\s*$', '', SRC, flags=re.M)
SRC=SRC.replace('export function ','function ')
EVENTS=[{'kind':('warning' if i==10 else 'failed' if i==13 else 'arrived' if i%3==0 else 'dispatch'),'at_min':i*0.75,'vehicle':f'TRUCK-{i%5:02}','message':f'任务 {i:02} 模拟事件'} for i in range(105)]
mock='<script>async function get(p){window.fetchCount=(window.fetchCount||0)+1;return '+json.dumps({'events':EVENTS,'duration_min':110},ensure_ascii=False)+'}</script>'
HTML='''<div id="focus-target" tabindex="0">keyboard zone</div><div id="assessment"><select id="assessment-run"><option value="SIM-A">SIM-A</option></select>
<div class="desk-layout"><div class="desk-map-layers"><button id="original" type="button">全部范围</button></div><aside class="inspector-panel"><div id="desk-inspector">平台详情</div></aside></div>
<div class="desk-player"><button data-desk="play">播放</button><button data-desk="previous">上个事件</button><button data-desk="next">下个事件</button><button data-desk="reset">重置</button><input id="desk-slider" type="range" min="0" max="110" step="0.01" value="0"></div>
<div class="desk-event-strip">事件概览</div></div>'''
def test_mission_console_browser():
 with sync_playwright() as p:
   browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
   page=browser.new_page(viewport={'width':1290,'height':850})
   errors=[]; page.on('pageerror', lambda e:errors.append(str(e)))
   page.set_content(HTML+mock+'<script>'+SRC+'</script>',wait_until='domcontentloaded',timeout=15000)
   page.locator('.ops-v7-header').wait_for(timeout=10000)
   assert page.locator('.ops-event-v7').count()==48
   assert '105' in page.locator('.ops-v7-count').inner_text()
   page.locator('[data-ops-more]').click()
   assert page.locator('.ops-event-v7').count()==96
   page.locator('.ops-v7-search').fill('TRUCK-03')
   assert page.locator('.ops-event-v7').count() in range(1,49)
   page.locator('.ops-v7-search').fill('')
   page.locator('.ops-v7-filter').select_option('incident')
   assert page.locator('.ops-event-v7').count()==2
   page.locator('[data-ops-first-incident]').click()
   assert abs(float(page.locator('#desk-slider').input_value())-7.5)<0.01
   assert 'T+7.5' in page.locator('.ops-v7-clock').inner_text()
   page.evaluate("document.querySelector('#desk-slider').value='45'")
   page.wait_for_timeout(500)
   assert page.locator('.ops-v7-clock').inner_text()=='T+45.0', 'Automatic playback property changes must refresh projection'
   page.locator('[data-ops-inspector]').click()
   assert 'ops-v7-inspector-hidden' in page.locator('#assessment').get_attribute('class')
   page.locator('[data-ops-inspector]').click()
   assert 'ops-v7-inspector-hidden' not in page.locator('#assessment').get_attribute('class')
   page.locator('#focus-target').focus()

   page.keyboard.press('End')

   assert float(page.locator('#desk-slider').input_value())==110
   assert page.evaluate('window.fetchCount')==1, 'Only one run fetch, not one per playback tick'
   assert not errors, errors

   browser.close()
