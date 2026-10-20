/** Product vocabulary follows the agreed five-module information architecture. */
export const WORKSPACE_MODULES=[
 {id:'data',name:'基础数据',en:'BASIC DATA',desc:'统一维护实体基本信息、设施、通道与无人机资源。',icon:'database',tabs:[['nodes','基础设施'],['edges','投送通道'],['vehicles','实体基本信息'],['audit','操作审计']]},
 {id:'scenario',name:'想定管理',en:'SCENARIO MANAGEMENT',desc:'配置当前想定、力量编组、部署及环境条件。',icon:'rules',tabs:[['list','当前想定'],['tasks','投送任务'],['formations','力量编组'],['deployment','可视化部署'],['conditions','环境条件设置'],['facilities','关键基础设施状态']]},
 {id:'planning',name:'联合投送方案',en:'JOINT DELIVERY PLANNING',desc:'统筹任务与平台，生成投送方案并保留方案快照。',icon:'route',tabs:[['workspace','方案编排'],['route','路线分析'],['archive','方案档案']]},
 {id:'simulation',name:'行动推演',en:'ACTION SIMULATION',desc:'动态展示投送过程，联动平台状态与事件日志。',icon:'play',tabs:[['control','推演控制'],['telemetry','运行状态'],['events','事件日志'],['history','历史运行'],['experiments','实验记录']]},
 {id:'analytics',name:'评估分析',en:'EVALUATION ANALYSIS',desc:'汇总运输投送统计与投送结果，支持对比和导出。',icon:'chart',tabs:[['overview','综合评估'],['transport','运输投送统计'],['delivery','投送结果统计'],['metrics','效能指标'],['compare','方案对比'],['reports','评估报告']]},
];
