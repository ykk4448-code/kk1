# 航空主题首页

首页采用提亮后的渐变海军蓝（页面 `#4d7e9f → #3f7093 → #386587`，主视觉与卡片使用协调渐变），结合银灰无人机、细线框、编号和五模块任务工作链。参考图只用于航空题材和视觉语言，未引入图中的装备性能或作战功能。

- 品牌名称：联合投送仿真平台。
- 五个入口：基础数据、想定管理、联合投送方案、行动推演、评估分析。沿用原有路由和二级功能名称。
- 主视觉：三架不同外形的无人机，缩小为组合展示；首页图片使用独立的航空概念视觉资产。
- 桌面：主视觉与说明分区，五入口横排。手机：说明与机群上下排列，入口双列，末项独占一行。
- 交互：入口整卡可点击，支持键盘焦点和减少动态效果偏好。首页被覆盖的底图从辅助技术和键盘导航中移除；进入业务工作台后，地图正常使用。

代码位于 `frontend/assets/aviation-home.css` 与 `app.js` 的 `home()`。样式仅作用于首页。离线预览内嵌样式和图片，可独立打开。

## 主视觉资产

使用内置 imagegen 生成，输出为 `frontend/assets/aviation-hero.webp`（1672 × 941，约 126 KB）。完整提示词见 `aviation-hero-prompt.txt`。原始生成图保留在本地生成目录；交付资源使用 WebP 编码，减少首页加载量。图片没有文字，界面上的文字和标记均由 HTML/CSS 绘制。

生成提示词：

> Premium aerospace website hero background, wide landscape 16:9. Exactly three distinct small unarmed silver-gray cargo unmanned aircraft on an open apron, rendered from a gently elevated three-quarter perspective. A well-spaced triangular formation confined to the right side, comparable moderate sizes, no dominant aircraft, complete wings and tails, no overlap. Long-wing pusher UAV, twin-boom high-wing cargo UAV, compact V-tail UAV. Calm empty blue space on the left for typography. Medium steel-blue scene, neither dark navy nor pale blue, soft cool daytime lighting, distant mountains, subtle apron reflections, premium aviation editorial composition. No people, weapons, logos, lettering, UI, frames or watermark.

界面移除主视觉角标、页脚场景标注，以及地图、运行状态、表单和报告中重复的解释性提示。计算单位、字段含义、保存行为与地图来源仍由对应字段或技术说明提供。

## 验证

前端模块语法、既有功能与主题约定、独立预览构建和动态回放约定均应通过。视觉检查覆盖宽屏、窄桌面和手机，确认五入口可进入对应工作台、返回首页正常、无横向溢出且三架飞机完整呈现。
