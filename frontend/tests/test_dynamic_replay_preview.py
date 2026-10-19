"""Regression: the offline preview must change vehicle locations with time.

All positions are generated from persisted *synthetic* simulation events by the
real backend. The preview may interpolate samples; it may not reuse T+0.
"""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / 'preview.html'


def test_preview_contains_time_varying_telemetry():
    html = PREVIEW.read_text(encoding='utf-8')
    match = re.search(r'const MOCK_FRAMES=(\{.*?\});\s*// Preview-only', html, re.S)
    assert match, 'preview must embed time-indexed telemetry frames'
    runs = json.loads(match.group(1))
    assert runs, 'demo preview must contain simulated runs'
    assert any(len(samples) > 10 for samples in runs.values())

    # At least one vehicle must change geolocation or mission state in a run.
    moving = False
    for frames in runs.values():
        assert all(a['minute'] <= b['minute'] for a, b in zip(frames, frames[1:]))
        first = {v['vehicle_id']: v for v in frames[0]['vehicles']}
        for snapshot in frames[1:]:
            for vehicle in snapshot['vehicles']:
                base = first.get(vehicle['vehicle_id'])
                if base is None:
                    continue
                if (base.get('lat'), base.get('lon'), base.get('status')) != (
                    vehicle.get('lat'), vehicle.get('lon'), vehicle.get('status')
                ):
                    moving = True
                    break
            if moving:
                break
        if moving:
            break
    assert moving, 'T+0 and later frames must not be identical'

    assert 'previewTelemetry(path)' in html
    assert "data=previewTelemetry(path)" in html
    assert "离线预览：基于后端生成的仿真时刻样本插值" in html


def test_live_playback_does_not_starve_slow_responses():
    assessment = (ROOT / 'frontend/assets/assessment.js').read_text(encoding='utf-8')
    assert 'telemetryBusy=true' in assessment
    assert 'telemetryQueued=true' in assessment
    assert 'telemetryQueued=false' in assessment
    assert 'if(!playing&&Math.abs(minute-at)>.05)' in assessment


def test_preview_scripts_have_compatible_global_scope():
    html = PREVIEW.read_text(encoding='utf-8')
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.S)
    result = subprocess.run(['node', '--check'], input='\n'.join(scripts),
                            capture_output=True, text=True, encoding='utf-8', timeout=10)
    assert result.returncode == 0, result.stderr
