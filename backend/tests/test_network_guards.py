from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.main import ensure_active_scenario


def test_active_civilian_scenario_is_mutable():
    ensure_active_scenario(SimpleNamespace(status='active', network_id='civil-airdrop'))


def test_active_legacy_network_is_read_only():
    with pytest.raises(HTTPException) as exc:
        ensure_active_scenario(SimpleNamespace(status='active', network_id='regional'))
    assert exc.value.status_code == 409
    assert '历史网络只读' in exc.value.detail


def test_archived_civilian_scenario_is_read_only():
    with pytest.raises(HTTPException) as exc:
        ensure_active_scenario(SimpleNamespace(status='archived', network_id='civil-airdrop'))
    assert exc.value.status_code == 409
    assert '归档数据只读' in exc.value.detail
