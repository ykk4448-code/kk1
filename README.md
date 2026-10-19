## 9.0 冰蓝业务工作台主题

根据反馈，将上一版卡其米黄/红色主视觉改为**浅蓝色系**：雾蓝背景、冰蓝辅助层、白色内容面板、深蓝正文和中蓝重点操作。一级首页依旧只有五个入口；行动推演、地图和评估工作台的任务时序、平台详情、统计曲线和播放时间轴采用统一色板。地图高亮路线为蓝色，红色仅用于中断等异常语义。

主题文件为 `frontend/assets/lightblue-v9.css`，在 v8 后加载并覆盖旧配色；移除其样式链接即可回滚。设计与对比度检查见 [lightblue-theme-v9.md](docs/lightblue-theme-v9.md) 和 `pytest frontend/tests/test_lightblue_theme.py -q`。演示地图及任务使用合成数据，不适用于真实导航。

## 8.0 海图式沙盘主题

根据海图式行动推演参考图，统一采用卡其米黄、海水青蓝、石墨灰和关键航线红。五个一级业务入口不变；行动推演的甘特图、城市底图、平台详情、回放器和结果曲线使用统一的语义色。城市底图仍来自 OpenStreetMap（需联网），地图位置与通道为演示仿真数据，不用于真实导航。完整说明参见 [设计文档](docs/cartographic-theme-v8.md)。主题由 `frontend/assets/cartographic-v8.css` 最后覆盖加载，移除该链接即可回滚颜色。

## AETHER 7 · 行动推演可用性与事件同步改进

在保持**一级首页仅五个入口**和原有仿真引擎不变的前提下，升级二级工作台中的任务事件导航：支持事件检索、类别筛选、48 条分批显示、首个异常定位、自动播放时刻投影，以及地图平台详情隐藏/显示。所有事件来自已保存的**合成仿真数据**，并非实时设备遥测。

完整说明：[行动推演 v7 交互文档](docs/mission-v7.md)。对应测试：`pytest frontend/tests/test_mission_v7_contract.py -q`；独立 Playwright DOM 回归：`pytest frontend/tests/test_mission_v7_browser.py -q`（需 Playwright/Chromium）。

---

# 凌航 AETHER 4.0 · 联动评估与城市投送仿真工作台

> **演示系统 / 非真实作业软件。** 以中国城市真实地理坐标为底图参照，采用**近似示例地标位置和合成路网**完成民用应急物流仿真。**仿真路段不是实测道路；路线不能用于真实车辆导航、航线规划或安全关键调度。**


## 4.0 联动评估工作台

保留五个一级业务入口，统一为浅色数据工作台。**评估分析 → 综合评估**和**行动推演 → 推演控制**共享任务时序、空间态势、平台详情、结果曲线与播放控制。

- 点击任务或平台，联动高亮路线、运行位置、载荷、剩余模拟航程与任务阶段。
- 支持拖动时间轴、逐事件定位、1× / 4× / 16× 播放、任务搜索和异常筛选、图层开关、地图缩放与全屏分析。
- 投送曲线来自首次迭代事件，综合指标来自全部随机迭代。未结束任务的成功率不填 0；未分配任务纳入完成率分母。
- 旧快照缺少经纬度时使用明确标注的 XY 相对坐标，不修改历史快照。缺失载荷显示未知，不作为零重量统计。
- CSV 导出包括已分配与未分配任务；弹窗保存、重复提交保护、刷新后的城市/想定保持与键盘操作已完善。

完整口径、兼容规则和验收说明见 [评估工作台说明](docs/assessment.md)。

## 五大一级业务入口

**严格两层页面结构**：

1. **一级首页** (`/#/home`) 只显示五个可点击业务按钮：基础数据、想定管理、联合投送方案、行动推演、评估分析。不显示侧边业务菜单、城市选择或额外快捷按钮。
2. **二级工作台**：点击某个一级入口后进入该模块的独立工作台。侧边栏只展示该模块的二级功能；手机端采用页内标签。顶部提供“← 返回一级首页”。
3. **独立地址与浏览器历史**：如 `/#/scenario/tasks`、`/#/simulation/telemetry`，支持直接打开、刷新、后退、前进。

二级页面及对应业务操作：

| 一级入口 | 二级功能 | 可进行的操作 |
|---|---|---|
| **01 基础数据** | 设施节点 / 投送通道 / 力量编组 | 按城市查看地理坐标、新建设施、编辑/停用节点、创建/调整/关闭通道、管理平台性能与状态 |
| **02 想定管理** | 想定库 / 任务编排 / 环境约束 | 创建/切换想定，新增/编辑/删除配送任务，配置天气、风速、能见度等环境规则 |
| **03 联合投送方案** | 智能编排 / 路径比选 / 方案档案 | A* 与 Dijkstra，均衡/时效/风险三策略；路线即时查询、运力分配、甘特图、历史方案快照 |
| **04 行动推演** | 推演控制 / 事件时间线 / 历史运行 | 指定随机种子与轮次，Monte Carlo 仿真，地理沙盘回放、进度与事件检索 |
| **05 评估分析** | 综合评估 / 运输任务 / 投送结果 / 综合效能 / 方案对比 / 报告中心 | 任务成功率、准点率、平均延误、P90 时长、利用率、综合评分、运行对比、JSON/CSV/打印导出 |

## 中国城市地图

- **武汉**：武汉站、汉口站、武昌站、光谷广场、武汉大学、武汉天河机场等 12 个地理示例点。
- **上海**：虹桥火车站、上海火车站、人民广场、陆家嘴、张江高科、浦东国际机场等 9 个点。
- **成都**：成都东站、天府广场、双流机场、成都西站等 9 个点。
- **深圳**：深圳北站、福田站、深圳湾、宝安机场、前海湾等 9 个点。

内置 **39 个设施节点、63 条合成双向通道、26 台运载平台、5 套想定**。城市之间的设施、运力与任务隔离，非法跨城市任务由 API 拒绝。每个城市具备至少一套基线方案和 80 轮示例仿真数据。坐标属于近似 WGS84 参考点，不代表准确设施入口、真实停靠点、实时交通流或真实航路。

前端实现了**无需地图 SDK 的 Web Mercator 地图**：缩放、拖动、节点选取、方案线路高亮、回放位置。实际道路底图通过 [OpenStreetMap 瓦片服务](https://www.openstreetmap.org/copyright) 在线加载并保留归属署名。**瓦片加载需要浏览器联网**；离线时显示地理网格与业务设施的相对地理位置，仍能编辑数据、规划和推演。请遵守 OSM 瓦片使用政策；高并发、离线和商业部署请改为经许可的本地/商用瓦片服务。

## 快速启动

要求 Python 3.11+；前端不需要 npm。

```bash
python -m venv .venv
source .venv/bin/activate                    # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
DEMO_MODE=true PYTHONPATH=backend uvicorn app.main:app --host 127.0.0.1 --port 8000
```

访问 **http://localhost:8000**，API 文档 **http://localhost:8000/docs**。

演示模式自动使用 `admin / demo123456` 登录。**此账号仅供本地仿真演示，不要暴露到公网。**

Docker：

```bash
docker compose up --build -d
```

Compose 默认只发布到主机 `127.0.0.1:8000`，保留 SQLite 数据卷。

### 从旧版 v1.0 升级

V2 会对已有 **SQLite** 数据库进行增量字段升级（不删除历史数据）；原有虚拟点的经纬度没有真实地理含义，因此**旧演示数据库无法自动变为新版四城市地标数据**。若只想体验 v2 的新示例数据，请先**备份旧数据**，然后在新目录或新 Docker volume 上启动 v2；切勿在保存重要任务数据的卷上执行 `docker compose down -v`。对于 PostgreSQL 等生产数据库需要独立的 DDL 迁移流程，此仓库自带增量迁移仅覆盖 SQLite。

## 技术架构

```text
前端单页应用 (ES Modules / CSS / SVG / Web Mercator)
    ├─ 五入口业务架构、二级标签、表单 CRUD、路线沙盘、甘特与回放
    └─ GET/POST/PATCH/DELETE REST API + Bearer Auth
                             │
FastAPI + Pydantic (HTTP API) │
    ├─ RBAC / 用户鉴权 / 审计追溯
    ├─ 城市/设施/通道/运力/想定/任务管理
    ├─ 联合规划 A* & Dijkstra + 三种加权目标
    ├─ 固定种子 Monte Carlo 与事件模拟
    └─ SQLAlchemy ORM → SQLite (演示) / 可替换持久层
```

### 主要 API

- `GET /api/v1/cities`：四城市信息（需要登录）
- `GET /api/v1/network?city_id=wuhan`：指定城市的节点、通道与运力
- `POST /api/v1/network/nodes`、`PATCH /api/v1/network/nodes/{id}`：设施维护
- `POST /api/v1/network/edges`、`PATCH /api/v1/network/edges/{id}`：通道维护
- `POST /api/v1/vehicles`、`PATCH /api/v1/vehicles/{id}`：运力管理
- `GET/POST /api/v1/scenarios`、`PATCH /api/v1/scenarios/{id}`：想定管理
- `GET/POST /api/v1/scenarios/{id}/tasks`、`PATCH/DELETE /api/v1/scenarios/{id}/tasks/{task}`：任务编排
- `GET /api/v1/routes/preview`：两点路线即时计算（起点、终点、城市、策略、算法）
- `POST/GET /api/v1/plans`：规划方案及输入快照
- `POST/GET /api/v1/simulations`：推演事件、样本及指标
- `GET /api/v1/analytics/compare`：按运行 ID 对比
- `GET /api/v1/audit`：管理员审计

使用 `/api/v1/auth/login` 获取 Bearer token，演示模式客户端自动登录。计划的历史快照独立于之后更改的城市通道与天气。每次推演支持相同种子复现。

## 验证

```bash
pip install -r backend/requirements-dev.txt
PYTHONPATH=backend DEMO_MODE=true pytest backend/tests -q
node --check frontend/assets/api.js
node --check frontend/assets/charts.js
node --check frontend/assets/map.js
node --check frontend/assets/app.js
node --check frontend/assets/assessment.js
```

测试覆盖鉴权、场景 CRUD、设施约束、跨城市隔离、路径 A* / Dijkstra、历史快照、可重复推演、任务修改和审计。GitHub Actions 在每次 push / PR 时自动执行。

## 安全与边界

1. **不含真实驾驶与飞行控制逻辑**。所谓无人运载平台是仿真数据实体。
2. 地标坐标是近似示例点，边缘连线、速度、距离、风险均非实测，不可用于导航或安全决策。
3. 不接入真实气象、交通或 GNSS；算法模型不构成实体装备安全性证明。
4. DEMO_MODE 仅限可信本地环境；生产必须配置安全密钥、安全账号、访问控制、HTTPS、数据备份、观测与压力测试。
5. SQLite 增量迁移兼容旧字段，但大量并发、分布式部署应使用正式迁移与事务型数据库。

详细说明：`docs/requirements.md`、`docs/simulation-model.md`、`docs/city-data.md`。

### 二级页面导航验收

可运行 `python scripts/build_preview.py` 生成不需要后端服务器的只读预览；如安装 Chromium 和 Playwright，运行 `python frontend/tests/test_navigation_browser.py` 可验证五个一级入口及二级菜单、浏览器历史和移动布局。业务接口和写入行为另由 `pytest backend/tests` 验证。


## 行动推演工作台 · 任务时序与空间联动（第六轮 UI 改进）

依据任务回放参考图，行动推演和综合评估统一采用左侧任务甘特、主地图、可选平台检查器、底部统计曲线及播放器布局。新增事件索引（派遣/异常/交付）和首个异常定位、25% 时间快捷跳转、键盘逐事件导航；这些功能使用数据库中保存的仿真回放数据，不是实时无人机遥测。详见 [工作台交互说明](docs/mission-console-v6.md)。

