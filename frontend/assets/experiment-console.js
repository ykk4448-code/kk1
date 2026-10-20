import {esc} from './charts.js';

export const VARIABLES={
 weather:{label:'天气类型',group:'weather',options:[['clear','晴朗'],['rain','降雨'],['wind','有风'],['fog','低能见度']]},
 wind_kmh:{label:'风速等级',group:'weather',options:[['8','微风 · 8'],['15','和风 · 15'],['25','较强风 · 25'],['40','强风 · 40'],['55','极端风 · 55']]},
 rain:{label:'降雨条件',group:'weather',options:[['none','无降雨'],['light','小雨'],['moderate','中雨']]},
 cloud_base:{label:'云底条件',group:'environment',options:[['high','较高'],['medium','中等'],['low','较低']]},
 sea_state:{label:'海面环境',group:'environment',options:[['calm','平稳'],['moderate','中等'],['rough','较大涌浪']]},
 payload_profile:{label:'物资类型',group:'environment',options:[['light','轻载物资'],['standard','标准物资'],['medical','医疗物资']]},
 battery_reserve_pct:{label:'电量预留',group:'environment',options:[['20','20%'],['30','30%'],['40','40%']]},
 altitude_profile:{label:'任务剖面',group:'environment',options:[['conservative','保守'],['standard','标准'],['high','较高']]},
 fleet_profile:{label:'机群资源',group:'forces',options:[['compact','精简机群 · 每区 1 架'],['standard','标准机群 · 每区 3 架'],['reinforced','增强机群 · 每区 4 架']]},
};
export const DEFAULT_VARIABLES={weather:'clear',wind_kmh:'8',rain:'none',cloud_base:'high',sea_state:'calm',payload_profile:'standard',altitude_profile:'standard',battery_reserve_pct:'30',fleet_profile:'standard'};
export function parametersFrom(values){return {...values,wind_kmh:Number(values.wind_kmh),battery_reserve_pct:Number(values.battery_reserve_pct)};}
export function comparisonMarkup(records){
 const names={compact:'精简机群',standard:'标准机群',reinforced:'增强机群'};
 return `<div class="lab-comparison"><table><thead><tr><th>资源方案</th><th>投入无人机</th><th>任务分配</th><th>空投成功率</th><th>准点率</th><th>综合评分</th></tr></thead><tbody>${records.map(r=>{const s=r.results.plan_summary,m=r.results.metrics;return `<tr><td>${esc(names[r.parameters.fleet_profile]||'标准机群')}</td><td>${s.available_vehicles} 架</td><td>${s.assigned_count}/${s.task_count}</td><td>${m.success_pct.toFixed(1)}%</td><td>${m.on_time_pct.toFixed(1)}%</td><td>${m.score.toFixed(1)}</td></tr>`;}).join('')}</tbody></table><small>对照组使用相同任务、环境、随机种子和轮次，仅改变机群资源。每组结果均独立存档。</small></div>`;
}
export function consoleMarkup(values,seed=2026,iterations=80){
 const control=(key)=>{const v=VARIABLES[key];return `<label class="lab-field"><span>${v.label}</span><select data-exp-var="${key}" aria-label="${v.label}">${v.options.map(([id,label])=>`<option value="${id}" ${String(values[key])===id?'selected':''}>${label}</option>`).join('')}</select></label>`;};
 const group=key=>Object.keys(VARIABLES).filter(k=>VARIABLES[k].group===key).map(control).join('');
 return `<section class="experiment-console" aria-label="空投实验控制台"><header><div class="lab-tabs" role="tablist" aria-label="实验变量分组">${[['weather','天气因素'],['environment','环境与载荷'],['forces','力量对比'],['experiment','实验设置']].map(([id,label],i)=>`<button role="tab" id="lab-tab-${id}" aria-controls="lab-pane-${id}" aria-selected="${i===0}" data-lab-tab="${id}">${label}</button>`).join('')}</div><div class="lab-actions"><span id="desk-experiment-status" role="status">调整变量后运行，结果自动存档</span><button data-desk="toggle-lab" class="button button-light" aria-expanded="true">收起变量</button><button data-desk="apply-experiment" class="button button-light">保存预设</button><button data-desk="run-experiment" class="button button-primary">运行实验</button></div></header>
 <div role="tabpanel" id="lab-pane-weather" aria-labelledby="lab-tab-weather" class="lab-pane">${group('weather')}<div class="lab-context"><b>天气对照</b><small>天气、风速和降雨参与时长与随机扰动计算</small></div></div>
 <div role="tabpanel" id="lab-pane-environment" aria-labelledby="lab-tab-environment" class="lab-pane" hidden>${group('environment')}</div>
 <div role="tabpanel" id="lab-pane-forces" aria-labelledby="lab-tab-forces" class="lab-pane" hidden>${group('forces')}<button data-desk="compare-fleet" class="button button-primary">运行三组资源对比</button><div id="lab-comparison-results"><small>比较精简、标准、增强机群的任务覆盖与交付表现</small></div></div>
 <div role="tabpanel" id="lab-pane-experiment" aria-labelledby="lab-tab-experiment" class="lab-pane" hidden><label class="lab-field"><span>随机种子</span><input id="lab-seed" type="number" min="0" max="2147483647" value="${seed}"></label><label class="lab-field"><span>实验轮数</span><input id="lab-iterations" type="number" min="1" max="500" value="${iterations}"></label><button data-desk="records" class="button button-light">实验记录与导出</button><div class="lab-observer">动态投送控制位于地图上方，可随时播放或暂停。</div></div></section>`;
}
