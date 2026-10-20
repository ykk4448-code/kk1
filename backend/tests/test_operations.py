"""Civilian airdrop configuration, telemetry and report contract tests."""
BASE='/api/v1'
SCENARIO='SCN-CIVIL-AIRDROP'


def test_configuration_defaults_and_permissions(client,admin_headers,viewer_headers):
    h=admin_headers
    url=f'{BASE}/scenarios/{SCENARIO}/configuration'
    default=client.get(url,headers=h)
    assert default.status_code==200
    assert default.json()['units']
    assert set(default.json()['layers'])=={'facilities','links','formations','routes','labels'}
    assert client.patch(url,json={'objective':'unauthorized'},headers=viewer_headers).status_code==403
    assert client.get(url).status_code==401


def test_scenario_formation_must_remain_in_active_network_and_unique(client,admin_headers):
    url=f'{BASE}/scenarios/{SCENARIO}/configuration';h=admin_headers
    invalid=[
      [{'vehicle_id':'UAV-A1','deploy_node':'N01'}],
      [{'vehicle_id':'UGV-OLD','deploy_node':'AIR-MAIN-A'}],
      [{'vehicle_id':'UAV-A1','deploy_node':'AIR-MAIN-A'}, {'vehicle_id':'UAV-A1','deploy_node':'AIR-MAIN-B'}],
    ]
    before=client.get(url,headers=h).json()
    for units in invalid:
        r=client.patch(url,headers=h,json={'units':units})
        assert r.status_code==422,r.text
    assert client.get(url,headers=h).json()==before
    assert client.patch(url,headers=h,json={'layers':{'extra':True}}).status_code==422
    assert client.patch(url,headers=h,json={'objective':'x'*1001}).status_code==422


def test_formation_saved_affects_planning_and_snapshot(client,admin_headers):
    url=f'{BASE}/scenarios/{SCENARIO}/configuration';h=admin_headers
    cfg={'objective':'仅使用指定无人机开展合成救援空投',
         'units':[{'vehicle_id':'UAV-A1','deploy_node':'AIR-MAIN-B'}],
         'layers':{'facilities':True,'links':False,'formations':True,'routes':False,'labels':False}}
    r=client.patch(url,json=cfg,headers=h)
    assert r.status_code==200,r.text
    assert r.json()==cfg
    assert client.get(url,headers=h).json()==cfg
    plan=client.post(BASE+'/plans',headers=h,json={'scenario_id':SCENARIO})
    assert plan.status_code==201,plan.text
    body=plan.json()
    assert len(body['snapshot_data']['vehicles'])==1
    assert body['snapshot_data']['vehicles'][0]['id']=='UAV-A1'
    assert body['snapshot_data']['vehicles'][0]['home_node']=='AIR-MAIN-B'
    assert body['snapshot_data']['configuration']==cfg
    assert set(a['vehicle_id'] for a in body['assignment_data']) <= {'UAV-A1'}
    assert all(t['weight_kg']>0 for t in body['snapshot_data']['tasks'])
    assert client.patch(url,json={'units':[]},headers=h).status_code==200
    zero=client.post(BASE+'/plans',headers=h,json={'scenario_id':SCENARIO})
    assert zero.status_code==201
    assert zero.json()['summary_data']['assigned_count']==0


def test_replay_telemetry_progress_and_delivery_evidence(client,admin_headers):
    h=admin_headers
    run=client.get(BASE+'/simulations',headers=h,params={'scenario_id':SCENARIO}).json()[0]
    rid=run['id']
    first=client.get(f'{BASE}/simulations/{rid}/telemetry',headers=h,params={'minute':0})
    assert first.status_code==200,first.text
    initial=first.json()
    assert initial['source']=='first_iteration_synthetic_events'
    assert len(initial['vehicles'])==6
    assert all(v['coordinate_system']=='synthetic_xy' and v['lat'] is None and v['lon'] is None for v in initial['vehicles'])
    for v in initial['vehicles']:
        assert v['current_speed_kmh']>=0
        assert v['current_load_kg'] is None or v['current_load_kg']>=0
        assert v['remaining_range_km']>=0
    event=next(e for e in run['events'] if e['kind']=='dispatch')
    active=client.get(f'{BASE}/simulations/{rid}/telemetry',headers=h,
         params={'minute':event['at_min']+0.1}).json()
    assert active['active_count']>0
    assert any(x['status']=='in_transit' and x['cargo'] and x['current_speed_kmh']>0 for x in active['vehicles'])
    assert client.get(f'{BASE}/simulations/{rid}/telemetry',headers=h,params={'minute':-1}).status_code==422
    assert client.get(BASE+'/simulations/missing/telemetry',headers=h).status_code==404


def test_run_report_reconciles_first_iteration_and_task_summary(client,admin_headers):
    h=admin_headers
    run=client.get(BASE+'/simulations',headers=h,params={'scenario_id':SCENARIO}).json()[0]
    rid=run['id']
    report=client.get(f'{BASE}/simulations/{rid}/report',headers=h)
    assert report.status_code==200,report.text
    r=report.json()
    assert r['run_id']==rid
    assert r['totals']['assigned']==len(r['deliveries'])
    assert r['totals']['delivered']+r['totals']['failed']<=r['totals']['assigned']
    assert r['totals']['on_time']<=r['totals']['delivered']
    assert r['totals']['distance_km']>=0
    assert all('weight_kg' in d and 'actual_end_min' in d for d in r['deliveries'])
    assert any(v['task_count']>0 for v in r['transport'])
    assert r['metrics']==run['metrics']
    assert client.get(f'{BASE}/simulations/{rid}/report',headers={}).status_code==401


def test_zero_capacity_has_finite_empty_trend_and_no_fabricated_success(client, admin_headers):
    h=admin_headers
    client.patch(BASE+f'/scenarios/{SCENARIO}/configuration',headers=h,json={'units':[]})
    plan=client.post(BASE+'/plans',headers=h,json={'scenario_id':SCENARIO}).json()
    run=client.post(BASE+'/simulations',headers=h,json={'plan_id':plan['id'],'iterations':3,'seed':9}).json()
    result=client.get(BASE+f"/simulations/{run['id']}/assessment",headers=h).json()
    assert result['timeline']==[]
    assert result['duration_min']>=1
    assert result['report']['totals']['unassigned']==result['total_tasks']
    assert all(row['completion_pct']==0 and row['delivered']==0 for row in result['trend'])
