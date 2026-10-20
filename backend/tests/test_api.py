BASE='/api/v1'
SCENARIO='SCN-CIVIL-AIRDROP'
MAIN='AIR-MAIN-A'
ISLAND='AIR-ISLE-A'


def test_auth_required_and_login(client):
    assert client.get(BASE+'/scenarios').status_code==401
    assert client.post(BASE+'/auth/login',json={'username':'admin','password':'wrong'}).status_code==401
    health=client.get(BASE+'/health').json()
    assert health['status']=='ok' and health['version']=='5.0.0'


def test_demo_data_integrity(client,admin_headers):
    scenarios=client.get(BASE+'/scenarios',headers=admin_headers).json()
    assert len(scenarios)==1
    assert scenarios[0]['id']==SCENARIO and scenarios[0]['network_id']=='civil-airdrop'
    network=client.get(BASE+'/network',headers=admin_headers).json()
    assert network['network_id']=='civil-airdrop'
    assert len(network['nodes'])==6 and len(network['edges'])==6 and len(network['vehicles'])==6
    assert all(e['transport_mode']=='airdrop' for e in network['edges'])
    assert all(v['category']=='drone' for v in network['vehicles'])
    tasks=client.get(BASE+f'/scenarios/{SCENARIO}/tasks',headers=admin_headers).json()
    assert len(tasks)==6 and all(t['transport_mode']=='airdrop' for t in tasks)
    runs=client.get(BASE+'/simulations',headers=admin_headers).json()
    assert len(runs)==1 and runs[0]['scenario_id']==SCENARIO
    assert len(runs[0]['samples'])==80
    experiments=client.get(BASE+'/experiments',headers=admin_headers).json()
    assert len(experiments)==1 and experiments[0]['id']=='EXP-CIVIL-AIRDROP-BASELINE'
    assert experiments[0]['results']['sample_count']==80


def test_end_to_end_civil_airdrop_plan_and_simulation(client,admin_headers):
    body={'city_id':'national','network_id':'civil-airdrop','name':'民用急救物资对照场景',
          'description':'验证单条直接空投示意任务','weather':'rain','wind_kmh':24,'visibility_km':4}
    new=client.post(BASE+'/scenarios',headers=admin_headers,json=body)
    assert new.status_code==201,new.text
    sid=new.json()['id']
    task=client.post(BASE+f'/scenarios/{sid}/tasks',headers=admin_headers,json={
        'cargo':'急救包与常用药品','weight_kg':18,'origin':MAIN,'destination':ISLAND,
        'transport_mode':'airdrop','deadline_min':170,'priority':1})
    assert task.status_code==201,task.text
    plan=client.post(BASE+'/plans',headers=admin_headers,json={'scenario_id':sid,'strategy':'fastest','algorithm':'astar'})
    assert plan.status_code==201,plan.text
    pid=plan.json()['id']
    assert plan.json()['summary_data']['assigned_count']==1
    assert all(eid.startswith('AIR-E') for eid in plan.json()['assignment_data'][0]['path_edges'])
    run=client.post(BASE+'/simulations',headers=admin_headers,json={'plan_id':pid,'seed':17,'iterations':8})
    assert run.status_code==201,run.text
    assert run.json()['iterations']==8
    assert run.json()['metrics']['assigned_count']==1
    assert client.get(BASE+'/analytics/compare?ids='+run.json()['id'],headers=admin_headers).status_code==200


def test_role_based_protection(client,viewer_headers):
    assert client.get(BASE+'/network',headers=viewer_headers).status_code==200
    assert client.post(BASE+'/plans',headers=viewer_headers,json={'scenario_id':SCENARIO}).status_code==403
    assert client.patch(BASE+'/network/edges/AIR-E01',headers=viewer_headers,json={'status':'closed'}).status_code==403
    assert client.post(BASE+'/experiments',headers=viewer_headers,json={'scenario_id':SCENARIO}).status_code==403
    assert client.get(BASE+'/audit',headers=viewer_headers).status_code==403


def test_validation_and_edge_closure(client,admin_headers):
    h=admin_headers
    err=client.post(BASE+f'/scenarios/{SCENARIO}/tasks',headers=h,json={
        'cargo':'常用备件','weight_kg':5,'origin':MAIN,'destination':MAIN,
        'transport_mode':'airdrop','deadline_min':50,'priority':1})
    assert err.status_code==422
    assert client.post(BASE+'/simulations',headers=h,json={'plan_id':'PLN-CIVIL-AIRDROP-BASELINE','iterations':501}).status_code==422
    e=client.patch(BASE+'/network/edges/AIR-E01',headers=h,json={'status':'closed'})
    assert e.status_code==200 and e.json()['status']=='closed'
    assert client.patch(BASE+'/network/edges/AIR-E01',headers=h,json={'status':'delete'}).status_code==422
    network=client.get(BASE+'/network',headers=h).json()
    assert next(edge for edge in network['edges'] if edge['id']=='AIR-E01')['status']=='closed'


def test_scenario_environment_edit(client,admin_headers):
    r=client.patch(BASE+f'/scenarios/{SCENARIO}',headers=admin_headers,json={'weather':'rain','wind_kmh':18,'visibility_km':4})
    assert r.status_code==200 and r.json()['weather']=='rain'
    assert client.patch(BASE+f'/scenarios/{SCENARIO}',headers=admin_headers,json={'wind_kmh':400}).status_code==422


def test_catalog_create_and_conflict_detection(client,admin_headers):
    h=admin_headers
    node_body={'id':'AIR-MAIN-TEST','name':'新增合成补给点','category':'hub','x':12,'y':88,
               'lon':120,'lat':30,'city_id':'national','network_id':'civil-airdrop','health':91}
    node=client.post(BASE+'/network/nodes',headers=h,json=node_body)
    assert node.status_code==201,node.text
    assert client.post(BASE+'/network/nodes',headers=h,json={**node_body,'name':'重复节点'}).status_code==409
    edge_body={'source':'AIR-MAIN-TEST','target':'AIR-ISLE-A','distance_km':44,'risk':.03,
               'terrain':'coastal','transport_mode':'airdrop'}
    edge=client.post(BASE+'/network/edges',headers=h,json=edge_body)
    assert edge.status_code==201,edge.text
    assert client.post(BASE+'/network/edges',headers=h,json={**edge_body,'source':'AIR-ISLE-A','target':'AIR-MAIN-TEST'}).status_code==409
    vehicle=client.post(BASE+'/vehicles',headers=h,json={
        'code':'UAV-TEST-1','name':'新增民用应急无人机','category':'drone','capacity_kg':30,
        'speed_kmh':70,'range_km':140,'reliability':.96,'home_node':'AIR-MAIN-TEST'})
    assert vehicle.status_code==201,vehicle.text
    bad_home=client.post(BASE+'/vehicles',headers=h,json={
        'code':'UAV-TEST-2','name':'错误部署位置无人机','category':'drone','capacity_kg':30,
        'speed_kmh':70,'range_km':140,'reliability':.96,'home_node':'AIR-ISLE-A'})
    assert bad_home.status_code==422
    network=client.get(BASE+'/network',headers=h).json()
    assert len(network['nodes'])==7 and len(network['edges'])==7 and len(network['vehicles'])==7
    bad_node=client.post(BASE+'/network/nodes',headers=h,json={**node_body,'id':'REAL-GEO-1','lon':121.5})
    assert bad_node.status_code==422


def test_plan_snapshot_reproducibility(client,admin_headers):
    h=admin_headers
    plan=client.post(BASE+'/plans',headers=h,json={'scenario_id':SCENARIO}).json()
    body={'plan_id':plan['id'],'seed':123,'iterations':8}
    baseline=client.post(BASE+'/simulations',headers=h,json=body).json()
    assert client.patch(BASE+'/network/edges/AIR-E01',headers=h,json={'status':'closed'}).status_code==200
    assert client.patch(BASE+f'/scenarios/{SCENARIO}',headers=h,json={'weather':'wind','wind_kmh':55}).status_code==200
    after=client.post(BASE+'/simulations',headers=h,json=body).json()
    assert baseline['metrics']==after['metrics']
    assert baseline['events']==after['events']
    assert baseline['samples']==after['samples']


def test_offline_receiver_is_excluded_from_new_plans(client,admin_headers):
    updated=client.patch(BASE+'/network/nodes/AIR-ISLE-C',headers=admin_headers,json={'status':'offline','health':70})
    assert updated.status_code==200 and updated.json()['status']=='offline'
    assert client.patch(BASE+'/network/nodes/AIR-ISLE-C',headers=admin_headers,json={'health':101}).status_code==422
    plan=client.post(BASE+'/plans',headers=admin_headers,json={'scenario_id':SCENARIO})
    assert plan.status_code==201,plan.text
    assert all('AIR-ISLE-C' not in a['path_nodes'] for a in plan.json()['assignment_data'])


def test_experiment_records_are_reproducible_and_linked(client,admin_headers):
    h=admin_headers
    payload={'scenario_id':SCENARIO,'name':'晴朗基线重复试验','notes':'固定参数和随机种子用于复现。',
             'strategy':'balanced','algorithm':'astar','seed':714,'iterations':8,
             'parameters':{'weather':'clear','wind_kmh':8,'rain':'none','cloud_base':'high',
                           'sea_state':'calm','payload_profile':'standard','altitude_profile':'standard',
                           'battery_reserve_pct':30}}
    first=client.post(BASE+'/experiments',headers=h,json=payload)
    second=client.post(BASE+'/experiments',headers=h,json={**payload,'name':'晴朗基线复验'})
    assert first.status_code==201,first.text
    assert second.status_code==201,second.text
    a,b=first.json(),second.json()
    assert a['id']!=b['id'] and a['run_id']!=b['run_id'] and a['plan_id']!=b['plan_id']
    assert a['parameters']==b['parameters']
    assert a['results']['strategy']=='balanced' and a['results']['algorithm']=='astar'
    assert a['results']['model_version']==a['model_version']
    assert a['results']['metrics']==b['results']['metrics']
    assert a['results']['plan_summary']==b['results']['plan_summary']
    run_a=client.get(BASE+f"/simulations/{a['run_id']}",headers=h).json()
    run_b=client.get(BASE+f"/simulations/{b['run_id']}",headers=h).json()
    assert run_a['events']==run_b['events'] and run_a['samples']==run_b['samples']
    assert run_a['experiment_data']==a['parameters']
    listed=client.get(BASE+'/experiments',headers=h,params={'scenario_id':SCENARIO}).json()
    assert {a['id'],b['id']} <= {x['id'] for x in listed}
    annotated=client.patch(BASE+f"/experiments/{a['id']}",headers=h,json={'notes':'已完成复核'})
    assert annotated.status_code==200 and annotated.json()['notes']=='已完成复核'
    assert annotated.json()['parameters']==a['parameters']
    assert client.patch(BASE+f"/experiments/{a['id']}",headers=h,json={'parameters':{}}).status_code==422


def test_environment_parameters_change_model_and_are_snapshotted(client,admin_headers):
    h=admin_headers
    response=client.post(BASE+'/experiments',headers=h,json={
        'scenario_id':SCENARIO,'name':'高风边界对照','seed':12,'iterations':4,
        'parameters':{'weather':'wind','wind_kmh':55,'rain':'moderate','cloud_base':'low',
                      'sea_state':'rough','payload_profile':'medical','altitude_profile':'high',
                      'battery_reserve_pct':40}})
    assert response.status_code==201,response.text
    record=response.json()
    assert record['parameters']['wind_kmh']==55
    assert record['parameters']['battery_reserve_pct']==40
    assert record['parameters']['model_version']==record['model_version']
    assert record['parameters']['disclaimer']
    assert record['parameters']['model_factors']['range_factor']<1
    assert record['results']['strategy']=='balanced' and record['results']['algorithm']=='astar'
    assert record['results']['plan_summary']['assigned_count']==0
    assert record['results']['plan_summary']['unassigned_count']==6
    assert record['results']['iterations']==4 and record['results']['seed']==12


def test_archived_networks_are_read_only_but_historical_records_remain_queryable(client,admin_headers):
    h=admin_headers
    assert client.get(BASE+'/scenarios/SCN-001',headers=h).status_code==200
    assert client.get(BASE+'/plans',headers=h,params={'scenario_id':'SCN-001'}).status_code==200
    assert client.patch(BASE+'/scenarios/SCN-001',headers=h,json={'weather':'rain'}).status_code==409
    assert client.patch(BASE+'/network/edges/E01',headers=h,json={'status':'closed'}).status_code==409
    old_plan=client.get(BASE+'/plans',headers=h,params={'scenario_id':'SCN-001'}).json()[0]
    assert client.post(BASE+'/simulations',headers=h,json={'plan_id':old_plan['id'],'iterations':2}).status_code==409
    assert client.get(BASE+'/network?city_id=wuhan',headers=h).status_code==200


def test_user_civil_scenarios_survive_seed_reentry(client,admin_headers):
    from app.database import SessionLocal
    from app.seed import seed_database
    h=admin_headers
    created=client.post(BASE+'/scenarios',headers=h,json={
        'city_id':'national','network_id':'civil-airdrop','name':'用户自定义空投对照',
        'description':'重启持久化回归测试','weather':'clear','wind_kmh':8,'visibility_km':15})
    assert created.status_code==201,created.text
    with SessionLocal() as db:
        seed_database(db)
    ids={x['id'] for x in client.get(BASE+'/scenarios',headers=h).json()}
    assert created.json()['id'] in ids
