"""Contract tests for the engineering UI theme and five-entry navigation."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
STYLE = (ROOT / "frontend/assets/engineering-v10.css").read_text(encoding="utf-8")
INDEX = (ROOT / "frontend/index.html").read_text(encoding="utf-8")
PREVIEW = (ROOT / "scripts/build_preview.py").read_text(encoding="utf-8")
APP = (ROOT / "frontend/assets/app.js").read_text(encoding="utf-8")


def luminance(value):
    numbers = [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    channels = [n / 12.92 if n <= 0.04045 else ((n + 0.055) / 1.055) ** 2.4 for n in numbers]
    return sum(a * b for a, b in zip(channels, (0.2126, 0.7152, 0.0722)))


def ratio(a, b):
    light, dark = sorted((luminance(a), luminance(b)), reverse=True)
    return (light + .05) / (dark + .05)


def test_engineering_style_last_in_stylesheet_cascade():
    assert 'href="/assets/engineering-v10.css"' in INDEX
    assert INDEX.index("lightblue-v9.css") < INDEX.index("engineering-v10.css")
    assert "engineering-v10.css" in PREVIEW


def test_text_and_primary_button_contrast():
    for fg, bg in [
        ("#243140", "#ffffff"), ("#586777", "#ffffff"),
        ("#586777", "#f3f5f7"), ("#ffffff", "#285f94"),
        ("#b9c7d2", "#243447")
    ]:
        assert ratio(fg, bg) >= 4.5, (fg, bg)


def test_not_a_promotional_gradient_theme():
    assert "--eng-canvas:#f3f5f7" in STYLE
    assert "--eng-navigation:#243447" in STYLE
    assert "box-shadow:none!important" in STYLE
    assert ".landing-glow" in STYLE
    assert ".geo-map .geo-tile{filter:none!important" in STYLE


def test_five_entries_remain_separate_from_secondary_tabs():
    assert "function home()" in APP
    assert 'class="landing-modules"' in APP
    assert "current.tabs.map" in APP
    for title in ("基础数据", "想定管理", "联合投送方案", "行动推演", "评估分析"):
        assert title in APP


def test_no_fake_online_telemetry_label_in_current_shell():
    assert "SIMULATION ONLINE" not in INDEX
    assert "DIGITAL TWIN ENGINE" not in INDEX
    assert "仿真工作环境" in INDEX
