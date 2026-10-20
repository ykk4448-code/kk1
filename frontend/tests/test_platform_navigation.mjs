import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_MODULES} from '../assets/navigation.js';

test('agreed module vocabulary retains existing deep links and reference functions',()=>{
 assert.deepEqual(WORKSPACE_MODULES.map(m=>[m.id,m.name]),[
  ['data','基础数据'],['scenario','想定管理'],['planning','联合投送方案'],['simulation','行动推演'],['analytics','评估分析']]);
 const tabs=Object.fromEntries(WORKSPACE_MODULES.map(m=>[m.id,new Map(m.tabs)]));
 for(const [page,id,name] of [['data','vehicles','实体基本信息'],['scenario','formations','力量编组'],['scenario','deployment','可视化部署'],['scenario','conditions','环境条件设置'],['scenario','facilities','关键基础设施状态'],['simulation','events','事件日志'],['analytics','transport','运输投送统计'],['analytics','delivery','投送结果统计']])assert.equal(tabs[page].get(id),name);
 for(const m of WORKSPACE_MODULES)assert.equal(new Set(m.tabs.map(t=>t[0])).size,m.tabs.length);
});
