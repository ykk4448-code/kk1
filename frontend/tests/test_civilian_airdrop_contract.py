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
    for label in ("基础数据", "想定管理", "联合投送方案", "行动推演", "评估分析"):
        assert label in (ROOT/"frontend/assets/navigation.js").read_text(encoding="utf-8")
    assert "function newTask(task)" in APP
    task_form = APP[APP.index("function newTask(task)"):APP.index("function hideDialog()")]
    assert "AIR-MAIN-" in task_form and "AIR-ISLE-" in task_form
    assert "前置空投任务" not in task_form
    assert "task?.deadline_min||150" in task_form
    assert "03 / 结果复盘" in APP and "安全返航" not in APP
    assert "names[t.transport_mode]||'未指定投送方式'" in APP
    assert "联合投送地理沙盘" not in APP


def test_experiment_controls_create_and_export_server_records():
    assert 'id="experiment-form"' in APP
    assert "createExperimentWithParameters" in APP
    assert "post('/experiments'" in APP
    assert "view-experiment" in APP and "export-experiment" in APP
    assert "模型因子：时长" in APP and "duration_factor" in APP
    assert 'data-desk="run-experiment"' in (ROOT/'frontend/assets/experiment-console.js').read_text(encoding='utf-8')
    assert "context.onExperiment(params,labOptions())" in ASSESSMENT
    assert "model_factors" in SEED or "parameter_summary" in SEED
    assert "f'/experiments?scenario_id={sid}&limit=100'" in PREVIEW


def test_api_contract_enforces_direct_airdrop_and_read_only_archives():
    assert "Literal['road', 'sea', 'airdrop'] = 'airdrop'" in SCHEMAS
    assert "历史网络只读" in MAIN
    assert "ensure_active_scenario(scenario)" in MAIN
    assert "body.terrain!='coastal'" in MAIN
    assert "if old.network_id != NETWORK_ID" in SEED
    assert "model_factors" in DOC and "随机种子" in DOC


def test_airdrop_map_and_control_console_are_separate_from_model_units():
    console=(ROOT / "frontend/assets/experiment-console.js").read_text(encoding="utf-8")
    assert "中国及城市行政区划地理底图" in MAP
    assert "consoleMarkup" in ASSESSMENT
    assert "type=\"range\"" not in ASSESSMENT
    assert "力量对比" in console and "compare-fleet" in console
    assert "fleet_profile" in SCHEMAS
    assert "model_factors" in DOC
