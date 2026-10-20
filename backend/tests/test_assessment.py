from copy import deepcopy

from app.replay import assessment_projection, telemetry_at

BASE = '/api/v1'


def sources(client, headers):
    run = client.get(BASE+'/simulations', headers=headers, params={'scenario_id': 'SCN-001'}).json()[0]
    plan = client.get(BASE+'/plans/'+run['plan_id'], headers=headers).json()
    return run, plan


def test_legacy_snapshots_replay_without_inventing_geolocation(client, admin_headers):
    run, plan = sources(client, admin_headers)
    legacy = deepcopy(plan)
    for node in legacy['snapshot_data']['nodes']:
        node.pop('lat', None)
        node.pop('lon', None)
    original = deepcopy(legacy)
    dispatch = next(e for e in run['events'] if e['kind'] == 'dispatch')
    result = telemetry_at(run, legacy, dispatch['at_min']+.1)
    assert result['active_count'] > 0
    for vehicle in result['vehicles']:
        assert vehicle['lat'] is None and vehicle['lon'] is None
        assert vehicle['coordinate_system'] == 'synthetic_xy'
        assert vehicle['x'] is not None and vehicle['y'] is not None
    assert legacy == original


def test_completed_vehicle_has_no_stale_cargo_speed_or_eta(client, admin_headers):
    run, plan = sources(client, admin_headers)
    end = max(e['at_min'] for e in run['events']) + 1
    result = telemetry_at(run, plan, end)
    assert result['active_count'] == 0
    for vehicle in result['vehicles']:
        assert vehicle['current_load_kg'] == 0
        assert vehicle['current_speed_kmh'] == 0
        assert vehicle['cargo'] == '' and vehicle['eta_min'] is None
        assert 0 <= vehicle['range_remaining_pct'] <= 100


def test_migrated_placeholder_coordinates_and_missing_weights_are_unknown(client, admin_headers):
    run, plan = sources(client, admin_headers)
    snapshot = plan['snapshot_data']
    for node in snapshot['nodes']:
        node['lat'], node['lon'] = 30.58, 114.3
    snapshot['tasks'] = []
    for assignment in plan['assignment_data']:
        assignment.pop('weight_kg', None)
    result = telemetry_at(run, plan, .1)
    active = [v for v in result['vehicles'] if v['status'] == 'in_transit']
    assert active
    assert all(v['coordinate_system'] == 'synthetic_xy' for v in active)
    assert all(v['lat'] is None and v['current_load_kg'] is None for v in active)
    assessment = assessment_projection(run, plan)
    assert assessment['report']['totals']['weight_kg'] is None
    assert assessment['report']['totals']['unknown_weight_count'] > 0


def test_assessment_trend_reconciles_persisted_events(client, admin_headers):
    run, plan = sources(client, admin_headers)
    result = assessment_projection(run, plan)
    last = result['trend'][-1]
    assert last['delivered'] == result['report']['totals']['delivered']
    assert last['failed'] == result['report']['totals']['failed']
    assert last['on_time'] == result['report']['totals']['on_time']
    assert result['total_tasks'] == len(plan['snapshot_data']['tasks'])
    assert len(result['timeline']) == len(plan['assignment_data'])
    for previous, current in zip(result['trend'], result['trend'][1:]):
        assert previous['minute'] <= current['minute']
        assert previous['delivered'] <= current['delivered']
        assert previous['failed'] <= current['failed']
    assert all(0 <= row['completion_pct'] <= 100 for row in result['trend'])
    assert result['trend'][0]['success_pct'] is None
    assert last['success_pct'] == round(last['delivered']/max(1,last['delivered']+last['failed'])*100,2)
    assert result['network']['nodes'] == plan['snapshot_data']['nodes']
    assert any(row['segments'] for row in result['timeline'])
    for row in result['timeline']:
        assert all(s['start_min'] < s['end_min'] for s in row['segments'])


def test_assessment_endpoint_auth_validation_and_time(client, admin_headers):
    run, plan = sources(client, admin_headers)
    path = BASE+'/simulations/'+run['id']+'/assessment'
    assert client.get(path).status_code == 401
    assert client.get(path, headers=admin_headers, params={'minute': -1}).status_code == 422
    assert client.get(BASE+'/simulations/missing/assessment', headers=admin_headers).status_code == 404
    result = client.get(path, headers=admin_headers, params={'minute': 12.5})
    assert result.status_code == 200, result.text
    assert result.json()['telemetry']['minute'] == 12.5
    assert result.json()['plan_id'] == plan['id']


def test_zero_capacity_has_finite_empty_trend_and_no_fabricated_success(client, admin_headers):
    h = admin_headers
    client.patch(BASE+'/scenarios/SCN-001/configuration', headers=h, json={'units': []})
    plan = client.post(BASE+'/plans', headers=h, json={'scenario_id': 'SCN-001'}).json()
    run = client.post(BASE+'/simulations', headers=h, json={'plan_id': plan['id'], 'iterations': 3, 'seed': 9}).json()
    result = assessment_projection(run, plan)
    assert result['timeline'] == []
    assert result['duration_min'] >= 1
    assert result['report']['totals']['unassigned'] == result['total_tasks']
    assert all(row['completion_pct'] == 0 and row['delivered'] == 0 for row in result['trend'])
