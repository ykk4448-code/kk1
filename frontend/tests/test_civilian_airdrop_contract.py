"""Regression contracts for the civilian emergency-aid airdrop product."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = (ROOT / "frontend/assets/app.js").read_text(encoding="utf-8")
ASSESSMENT = (ROOT / "frontend/assets/assessment.js").read_text(encoding="utf-8")
MAP = (ROOT / "frontend/assets/map.js").read_text(encoding="utf-8")
CSS = (ROOT / "frontend/assets/airdrop-lab.css").read_text(encoding="utf-8")
SCHEMAS = (ROOT / "backend/app/schemas.py").read_text(encoding="utf-8")
MAIN = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
SEED = (ROOT / "backend/app/airdrop_demo.py").read_text(encoding="utf-8")
PREVIEW = (ROOT / "scripts/build_preview.py").read_text(encoding="utf-8")
DOC = (ROOT / "docs/civilian-airdrop-experiments.md").read_text(encoding="utf-8")


def test_navigation_and_task_forms_use_civilian_airdrop_language():
    for label in ("空投资源", "应急场景", "空投方案", "空投仿真", "实验评估"):
        assert label in APP
    assert "function newTask(task)" in APP
    task_form = APP[APP.index("function newTask(task)"):APP.index("function hideDialog()")]
    assert "AIR-MAIN-" in task_form and "AIR-ISLE-" in task_form
    assert "前置空投任务" not in task_form
    assert "task?.deadline_min||150" in task_form
    assert "03 / 结果复盘" in APP and "安全返航" not in APP


def test_experiment_controls_create_and_export_server_records():
    assert 'id="experiment-form"' in APP
    assert "createExperimentWithParameters" in APP
    assert "post('/experiments'" in APP
    assert "view-experiment" in APP and "export-experiment" in APP
    assert "模型因子：时长" in APP and "duration_factor" in APP
    assert 'data-desk="run-experiment"' in ASSESSMENT
    assert "context.onExperiment(params)" in ASSESSMENT
    assert "model_factors" in SEED or "parameter_summary" in SEED
    assert "f'/experiments?scenario_id={sid}&limit=100'" in PREVIEW


def test_api_contract_enforces_direct_airdrop_and_read_only_archives():
    assert "Literal['road', 'sea', 'airdrop'] = 'airdrop'" in SCHEMAS
    assert "历史网络只读" in MAIN
    assert "ensure_active_scenario(scenario)" in MAIN
    assert "body.terrain!='coastal'" in MAIN
    assert "if old.network_id != NETWORK_ID" in SEED
    assert "model_factors" in DOC and "随机种子" in DOC


def test_civilian_map_is_relative_xy_not_geographic():
    assert "civilAirdrop=network?.network_id==='civil-airdrop'" in MAP
    assert "geographic=!civilAirdrop" in MAP
    assert ".geo-map.synthetic-map .geo-basemap" in CSS
    assert ".geo-map.synthetic-map .geo-controls" in CSS
    assert "不代表真实地理位置" in APP
