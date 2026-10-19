# 凌航 AETHER · 无人投送仿真决策平台

**完整的、可运行的前后端项目。** 面向虚拟城市物流、应急物资配送和无人运输平台协同实验，覆盖资源台账、规则管理、方案规划、行动推演、可视化态势、统计评估和操作审计。

> **重要边界**：项目使用**虚拟路网、虚拟平台和合成概率模型**；不控制真实车辆、无人机或其他设备，也不保证实际道路、空域及人员安全。不能用于真实环境的安全关键决策。

## 1. 一分钟启动

需要 Python 3.11+。前端采用**零 npm 依赖的 ES Module 单页应用**，可直接由 FastAPI 静态托管；无需 Node 构建，适合离线部署。

```bash
# 从项目根目录运行
python -m venv .venv
source .venv/bin/activate                  # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
DEMO_MODE=true PYTHONPATH=backend uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

浏览器访问：**http://127.0.0.1:8000/** ；接口文档：**http://127.0.0.1:8000/docs**。

演示环境会初始化 3 个仿真场景、12 个节点、22 条边、8 台平台、21 项任务，并自动生成基线方案和 80 轮仿真样本。演示凭证：`admin / demo123456`，前端仅在 DEMO_MODE 启用时自动登录。

Docker 启动：

```bash
docker compose up --build -d
# http://localhost:8000
```

Compose 默认**仅绑定主机的 127.0.0.1**，不会把演示密码暴露给公网。

## 2. 产品模块与手写需求对照

| 手写需求（结合字迹作工程化理解） | 实现功能 |
| --- | --- |
| 无人投送/接运系统（仿真实验） | AETHER 仿真工作台；完全虚拟、不连接实际装备 |
| 基础数据 | 节点、设施健康度、路段拓扑/风险、平台配置、任务资源 |
| 规定/规则管理 | 天气、风速、能见度、平台可用状态、道路通行限制 |
| 投送方案 | A*、Dijkstra、三种策略、多平台任务调度、版本快照 |
| 行动推演 | 基于固定种子的 Monte Carlo；节点位置回放、事件时间轴 |
| 评估分析 | 成功率、准点率、P90、延迟、风险事件、利用率、评分与方案对比 |
| 图层、环境条件、关键基础设施状态 | 双层矢量网络沙盘、节点/道路图例、环境控制面板 |
| 力量编组、可视化部署 | 运输平台目录、容量与续航约束、虚拟位置及分配关系 |
| 甘特图、时序回放、结果统计 | Gantt、回放滑块、事件日志、趋势图、综合评分 |
| 平台类型、任务参数 | UGV/UAV 类型、载荷、截止时间、优先级与节点位置 |

**解读假设**：原图中标题和个别字迹较模糊，本项目将其定义为“面向应急物流的无人投送仿真决策系统”；未将图中的“仿真”误认为已经接入真实设备。细化的业务假设和模型限制见 `docs/requirements.md`。

## 3. 技术架构

```text
┌───────────────────────────────────────────────────────────┐
│                AETHER Responsive SPA                      │
│    HTML + CSS + ES Modules + SVG / no build tooling      │
│    Dashboards / Resource CRUD / Playback / Analytics      │
└──────────────────────────────┬────────────────────────────┘
                               │ HTTP / JSON / Bearer token
┌──────────────────────────────▼────────────────────────────┐
│                  FastAPI  /api/v1                         │
│   Pydantic contracts  · RBAC  · HMAC-signed access tokens │
│   Scenarios / Network / Plans / Simulations / Audits       │
├───────────────────────┬───────────────────────────────────┤
│     A*-Sim Engine     │       Persistence Layer           │
│  A* / Dijkstra        │ SQLAlchemy 2 + SQLite / Postgres  │
│  Constrained dispatch │ immutable plan input snapshots   │
│  Monte Carlo trials   │ saved samples, events, audit log │
└───────────────────────┴───────────────────────────────────┘
```

- **前端**：原生 JS 模块与现代 CSS；SVG 数字孪生图、甘特图、统计曲线、时间轴回放、7 个完整工作模块。无需第三方地图服务，免密钥、离线可用。
- **后端**：FastAPI、Pydantic v2、SQLAlchemy 2；单一 API 前缀 `/api/v1`；OpenAPI 自动生成；提供独立认证、角色授权、服务异常处理和输入校验。
- **数据层**：演示使用 SQLite、外键约束与持久化卷；可通过 `DATABASE_URL` 替换 PostgreSQL（需安装 `psycopg[binary]`）。**生产部署须自行建立迁移/备份策略**，当前不是多租户 SaaS。
- **规划引擎**：启发式 A*、Dijkstra、禁行路径过滤、路网风险系数、载重/续航/天气约束、车辆复用、预计完成时间与任务时限考核。
- **仿真引擎**：固定伪随机种子，路段风险触发扰动、行驶时间噪声、个别失败事件、按平台延迟传递，保存每轮指标与一条基线事件轨迹。
- **可复现性**：每份方案保存其场景、路段、节点和平台的**输入快照**；后续网络修改不会悄悄改变历史方案仿真输入。

## 4. 业务使用流程

1. 从**态势总览**选择示例场景，了解任务、路网、平台与历史结果。
2. 进入**基础数据**：维护平台可用性，调整道路为畅通/受限/关闭，添加或删除任务。
3. 在**规则管理**调整风速、能见度和天气，保存场景环境参数。
4. 在**方案规划**选择 `综合均衡 / 时效优先 / 风险优先` 和 `A* / Dijkstra`，生成可审计的方案版本。
5. 在**行动推演**以固定种子执行 80 轮虚拟实验；拖动时间轴以观察移动位置和任务事件。
6. 在**评估分析**查看统计曲线、P90 时间、综合评分，横向比较历史运行；导出 JSON 报告。
7. 在**审计日志**查看场景更改、方案生成、推演运行等写操作记录。

## 5. 常用 API

```bash
# 1) 登录
curl -s http://127.0.0.1:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"demo123456"}'

# 2) 获取令牌后
TOKEN='填入上面的access_token'
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/network

# 3) 生成计划
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"scenario_id":"SCN-001","strategy":"balanced","algorithm":"astar"}' \
  http://127.0.0.1:8000/api/v1/plans

# 4) 运行仿真（plan_id 改成上一步返回值）
curl -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"plan_id":"PLN-DEMO-001","iterations":80,"seed":2026}' \
  http://127.0.0.1:8000/api/v1/simulations
```

全部接口、数据结构和 401/403/404/409/422 等错误详见 `/docs`。

## 6. 本地测试

```bash
pip install -r backend/requirements-dev.txt
PYTHONPATH=backend pytest backend/tests -q
node --check frontend/assets/api.js
node --check frontend/assets/charts.js
node --check frontend/assets/app.js
```

包含算法正确性、线路封闭、运力承载、天气限制、可复现性、角色权限、数据校验、业务端到端测试。持续集成配置见 `.github/workflows/ci.yml`。

## 7. 发布、生产配置与安全

演示模式**只能用于本机试验**。将服务暴露到内网/公网之前，必须：

1. 设置 `DEMO_MODE=false`，并配置随机生成的 `SECRET_KEY`（至少 32 字符）；
2. 通过 `scripts/create_admin.py` 创建正式管理员，不得使用演示密码；
3. 使用 HTTPS / 反向代理、限流与 IP 策略；部署 PostgreSQL，备份和迁移；审计流外部归档；
4. 进一步进行负载、安全与故障测试。当前演示系统尚未完成真实设备集成和安全认证。

项目内 `scripts/publish_github.sh` 支持在本机 GitHub CLI (`gh`) 登录后创建**私有仓库并推送**，例如：

```bash
bash scripts/publish_github.sh aether-route-sim
```

需要 GitHub CLI 具有创建仓库的权限。**打包源码不等于已经发布到 GitHub。**

## 8. 项目结构

```text
backend/app/        REST 接口、权限、SQLAlchemy、路网算法、仿真内核、演示数据
backend/tests/      引擎与 API 自动化测试
frontend/           真正连接后端的响应式前端 / 无第三方依赖
frontend/assets/    模块化 JS、交互式 SVG 图表、界面样式
scripts/            管理员初始化、GitHub 发布与预览测试
.github/workflows/  GitHub Actions CI
Dockerfile           单镜像前后端一体部署
docker-compose.yml   本机安全绑定、持久化数据卷
docs/                需求、架构、模型局限性与首页截图
```

**LICENSE：MIT。**

### 前端独立视觉预览

运行 `make preview` 会生成 `preview.html`。该文件嵌入合成测试数据，可用于设计走查；**其提交按钮不写入真实数据库**。完整的可写业务功能请使用上述 FastAPI 启动方式。界面截图单独保存在原始交付 ZIP 的 `docs/` 目录中；本仓库主要托管可运行源码与文档。
