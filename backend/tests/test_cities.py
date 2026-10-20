BASE='/api/v1'
SCENARIO='SCN-CIVIL-AIRDROP'


def test_active_catalog_is_single_synthetic_civilian_workspace(client,admin_headers):
    h=admin_headers
    cities=client.get(BASE+'/cities',headers=h).json()
    assert len(cities)==1 and cities[0]['id']=='national'
    net=client.get(BASE+'/network',params={'city_id':'national'},headers=h).json()
    assert net['network_id']=='civil-airdrop'
    assert len(net['nodes'])==6 and len(net['edges'])==6 and len(net['vehicles'])==6
    assert all(n['city_id']=='national' and n['lon']==120 and n['lat']==30 for n in net['nodes'])
    ids={n['id'] for n in net['nodes']}
    assert all(e['source'] in ids and e['target'] in ids for e in net['edges'])
    assert all(e['transport_mode']=='airdrop' for e in net['edges'])
    assert all(v['home_node'] in ids and v['category']=='drone' for v in net['vehicles'])
    scenarios=client.get(BASE+'/scenarios',params={'city_id':'national'},headers=h).json()
    assert len(scenarios)==1 and scenarios[0]['id']==SCENARIO


def test_cross_network_task_edge_and_route_are_rejected(client,admin_headers):
    h=admin_headers
    assert client.post(BASE+f'/scenarios/{SCENARIO}/tasks',headers=h,json={
      'cargo':'跨网络不允许','weight_kg':5,'origin':'AIR-MAIN-A','destination':'N01',
      'transport_mode':'airdrop','deadline_min':100,'priority':1}).status_code==422
    assert client.post(BASE+'/network/edges',headers=h,json={
      'source':'AIR-MAIN-A','target':'N01','distance_km':100,'risk':0.02,'transport_mode':'airdrop'}).status_code==422
    assert client.get(BASE+'/routes/preview',headers=h,params={
      'city_id':'national','origin':'AIR-MAIN-A','destination':'N01','transport_mode':'airdrop'}).status_code==422
    reverse_task=client.post(BASE+f'/scenarios/{SCENARIO}/tasks',headers=h,json={
      'cargo':'反向任务不允许','weight_kg':5,'origin':'AIR-ISLE-A','destination':'AIR-MAIN-A',
      'transport_mode':'airdrop','deadline_min':100,'priority':1})
    assert reverse_task.status_code==422
    reverse_route=client.get(BASE+'/routes/preview',headers=h,params={
      'city_id':'national','origin':'AIR-ISLE-A','destination':'AIR-MAIN-A','transport_mode':'airdrop'})
    assert reverse_route.status_code==422


def test_direct_airdrop_route_preview_and_task_edit(client,admin_headers):
    h=admin_headers
    route=client.get(BASE+'/routes/preview',headers=h,params={
        'city_id':'national','origin':'AIR-MAIN-A','destination':'AIR-ISLE-A',
        'strategy':'balanced','algorithm':'astar','transport_mode':'airdrop'})
    assert route.status_code==200,route.text
    assert route.json()['nodes']==['AIR-MAIN-A','AIR-ISLE-A']
    assert len(route.json()['edges'])==1 and route.json()['distance_km']==42
    tasks=client.get(BASE+f'/scenarios/{SCENARIO}/tasks',headers=h).json()
    task=tasks[0]
    patched=client.patch(BASE+f'/scenarios/{SCENARIO}/tasks/{task["id"]}',headers=h,json={'weight_kg':27.5,'priority':3})
    assert patched.status_code==200 and patched.json()['weight_kg']==27.5
    assert client.patch(BASE+'/scenarios/SCN-001/tasks/'+task['id'],headers=h,json={'priority':2}).status_code==409
    assert client.patch(BASE+f'/scenarios/{SCENARIO}/tasks/{task["id"]}',headers=h,json={'priority':7}).status_code==422


def test_plan_snapshot_uses_only_civil_airdrop_data(client,admin_headers):
    p=client.post(BASE+'/plans',headers=admin_headers,json={'scenario_id':SCENARIO})
    assert p.status_code==201,p.text
    body=p.json();snapshot=body['snapshot_data']
    assert snapshot['scenario']['network_id']=='civil-airdrop'
    assert all(x['network_id']=='civil-airdrop' for x in snapshot['nodes'])
    assert all(e['transport_mode']=='airdrop' for e in snapshot['edges'])
    assert all(v['category']=='drone' for v in snapshot['vehicles'])
    assert all(a['origin'].startswith('AIR-MAIN-') and a['destination'].startswith('AIR-ISLE-') for a in body['assignment_data'])


def test_node_edge_vehicle_parameter_edits_respect_synthetic_contract(client,admin_headers):
    h=admin_headers
    n=client.patch(BASE+'/network/nodes/AIR-MAIN-A',headers=h,json={'health':81})
    assert n.status_code==200 and n.json()['health']==81
    assert client.patch(BASE+'/network/nodes/AIR-MAIN-A',headers=h,json={'lat':31.0}).status_code==422
    e=client.patch(BASE+'/network/edges/AIR-E01',headers=h,json={'distance_km':18.2,'risk':0.15})
    assert e.status_code==200 and e.json()['risk']==0.15
    v=client.patch(BASE+'/vehicles/UAV-A1',headers=h,json={'speed_kmh':45,'reliability':0.88})
    assert v.status_code==200 and v.json()['speed_kmh']==45
    assert client.patch(BASE+'/vehicles/UAV-A1',headers=h,json={'speed_kmh':-1}).status_code==422
    assert client.patch(BASE+'/network/nodes/N01',headers=h,json={'health':81}).status_code==409
