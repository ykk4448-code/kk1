BASE='/api/v1'

def test_auth_required_and_login(client):
    assert client.get(BASE+'/scenarios').status_code==401
    assert client.post(BASE+'/auth/login',json={'username':'admin','password':'wrong'}).status_code==401
    assert client.get(BASE+'/health').json()['status']=='ok'

def test_demo_data_integrity(client,admin_headers):
    scenarios=client.get(BASE+'/scenarios',headers=admin_headers).json()
    assert len(scenarios)==7
    network=client.get(BASE+'/network',headers=admin_headers).json()
    assert len(network['nodes'])==96 and len(network['edges'])>=161 and len(network['vehicles'])==67
    runs=client.get(BASE+'/simulations',headers=admin_headers).json()
    assert len(runs)==11
    assert all(len(r['samples'])==80 for r in runs)

def test_end_to_end_plan_and_simulation(client,admin_headers):
    input_body={'name':'全天候物流测试场景','description':'验证完整规划流程','weather':'rain','wind_kmh':24,'visibility_km':4}
    new=client.post(BASE+'/scenarios',headers=admin_headers,json=input_body)
    assert new.status_code==201
    sid=new.json()['id']
    task=client.post(BASE+f'/scenarios/{sid}/tasks',headers=admin_headers,json={
        'cargo':'环境数据采集设备','weight_kg':25,'origin':'N01','destination':'N09','deadline_min':170,'priority':1})
    assert task.status_code==201
    plan=client.post(BASE+'/plans',headers=admin_headers,json={'scenario_id':sid,'strategy':'fastest','algorithm':'astar'})
    assert plan.status_code==201
    pid=plan.json()['id']
    assert plan.json()['summary_data']['assigned_count']==1
    run=client.post(BASE+'/simulations',headers=admin_headers,json={'plan_id':pid,'seed':17,'iterations':32})
    assert run.status_code==201,run.text
    assert run.json()['iterations']==32
    assert run.json()['metrics']['assigned_count']==1
    assert client.get(BASE+'/analytics/compare?ids='+run.json()['id'],headers=admin_headers).status_code==200
    assert client.delete(BASE+f'/scenarios/{sid}',headers=admin_headers).status_code==409
    assert len(client.get(BASE+'/audit',headers=admin_headers).json())>=3

def test_role_based_protection(client,viewer_headers):
    assert client.get(BASE+'/network',headers=viewer_headers).status_code==200
    assert client.post(BASE+'/plans',headers=viewer_headers,json={'scenario_id':'SCN-001'}).status_code==403
    assert client.patch(BASE+'/network/edges/E01',headers=viewer_headers,json={'status':'closed'}).status_code==403
    assert client.get(BASE+'/audit',headers=viewer_headers).status_code==403

def test_validation_and_edge_closure(client,admin_headers):
    err=client.post(BASE+'/scenarios/SCN-001/tasks',headers=admin_headers,json={
        'cargo':'随车备件','weight_kg':50,'origin':'N01','destination':'N01','deadline_min':50,'priority':1})
    assert err.status_code==422
    assert client.post(BASE+'/simulations',headers=admin_headers,json={'plan_id':'PLN-DEMO-001','iterations':501}).status_code==422
    e=client.patch(BASE+'/network/edges/E01',headers=admin_headers,json={'status':'closed'})
    assert e.status_code==200 and e.json()['status']=='closed'
    assert client.patch(BASE+'/network/edges/E01',headers=admin_headers,json={'status':'delete'}).status_code==422
    assert client.get(BASE+'/network',headers=admin_headers).json()['edges'][0]['status']=='closed'

def test_scenario_environment_edit(client,admin_headers):
    r=client.patch(BASE+'/scenarios/SCN-002',headers=admin_headers,json={'weather':'rain','wind_kmh':18,'visibility_km':4})
    assert r.status_code==200 and r.json()['weather']=='rain'
    assert client.patch(BASE+'/scenarios/SCN-002',headers=admin_headers,json={'wind_kmh':400}).status_code==422

def test_catalog_create_and_conflict_detection(client,admin_headers):
    node=client.post(BASE+'/network/nodes',headers=admin_headers,json={
        'id':'TEST_HUB','name':'新增实验枢纽','category':'hub','x':50,'y':93,'lon':114.33,'lat':30.61,'city_id':'wuhan','health':91})
    assert node.status_code==201,node.text
    assert client.post(BASE+'/network/nodes',headers=admin_headers,json={
        'id':'TEST_HUB','name':'重复实验枢纽','category':'hub','x':50,'y':93,'lon':114.33,'lat':30.61}).status_code==409
    edge=client.post(BASE+'/network/edges',headers=admin_headers,json={
        'source':'TEST_HUB','target':'N08','distance_km':9.5,'risk':.03,'terrain':'mountain'})
    assert edge.status_code==201,edge.text
    assert client.post(BASE+'/network/edges',headers=admin_headers,json={
        'source':'N08','target':'TEST_HUB','distance_km':9.5}).status_code==409
    vehicle=client.post(BASE+'/vehicles',headers=admin_headers,json={
        'code':'UGV-999','name':'新增实验运输车','category':'ugv','capacity_kg':600,'speed_kmh':55,
        'range_km':210,'reliability':.97,'home_node':'TEST_HUB'})
    assert vehicle.status_code==201,vehicle.text
    assert len(client.get(BASE+'/network',headers=admin_headers).json()['vehicles'])==68

def test_plan_snapshot_reproducibility(client,admin_headers):
    plan=client.post(BASE+'/plans',headers=admin_headers,json={'scenario_id':'SCN-001'}).json()
    body={'plan_id':plan['id'],'seed':123,'iterations':15}
    baseline=client.post(BASE+'/simulations',headers=admin_headers,json=body).json()
    assert client.patch(BASE+'/network/edges/E01',headers=admin_headers,json={'status':'closed'}).status_code==200
    assert client.patch(BASE+'/scenarios/SCN-001',headers=admin_headers,json={'weather':'wind','wind_kmh':60}).status_code==200
    after=client.post(BASE+'/simulations',headers=admin_headers,json=body).json()
    assert baseline['metrics']==after['metrics']
    assert baseline['events']==after['events']
    assert baseline['samples']==after['samples']

def test_offline_infrastructure(client,admin_headers):
    updated=client.patch(BASE+'/network/nodes/N11',headers=admin_headers,json={'status':'offline','health':70})
    assert updated.status_code==200 and updated.json()['status']=='offline'
    assert client.patch(BASE+'/network/nodes/N11',headers=admin_headers,json={'health':101}).status_code==422
    plan=client.post(BASE+'/plans',headers=admin_headers,json={'scenario_id':'SCN-001'})
    assert plan.status_code==201
    assert all('N11' not in a['path_nodes'] for a in plan.json()['assignment_data'])
