import test from 'node:test';
import assert from 'node:assert/strict';
import {consoleMarkup,comparisonMarkup,parametersFrom,DEFAULT_VARIABLES} from '../assets/experiment-console.js';

test('grouped controls have no timeline slider and all required variables',()=>{
 const html=consoleMarkup(DEFAULT_VARIABLES,7,80);
 assert.ok(!html.includes('type="range"'));
 for(const label of ['天气因素','环境与载荷','力量对比','实验设置'])assert.ok(html.includes(label));
 for(const name of ['weather','wind_kmh','rain','cloud_base','sea_state','payload_profile','battery_reserve_pct','fleet_profile'])assert.ok(html.includes(`data-exp-var="${name}"`));
 assert.ok(html.includes('data-desk="compare-fleet"'));
 const params=parametersFrom(DEFAULT_VARIABLES);assert.equal(params.wind_kmh,8);assert.equal(params.battery_reserve_pct,30);
});
test('resource table displays persisted observed results for each group',()=>{
 const records=['compact','standard','reinforced'].map((fleet_profile,i)=>({parameters:{fleet_profile},results:{plan_summary:{available_vehicles:[6,18,24][i],assigned_count:[6,18,18][i],task_count:18},metrics:{success_pct:[33,98,99][i],on_time_pct:97,score:95}}}));
 const html=comparisonMarkup(records);assert.ok(html.includes('33.0%'));assert.ok(html.includes('24 架'));assert.ok(html.includes('6/18'));
});
