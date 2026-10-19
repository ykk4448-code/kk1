BASE='/api/v1'

def test_city_catalog_and_isolated_network(client,admin_headers):
    cities=client.get(BASE+'/cities',headers=admin_headers).json()
    assert {c['id'] for c in cities}=={'wuhan','shanghai','chengdu','shenzhen'}
    for city in cities:
        cid=city['id']
        net=client.get(BASE+'/network',params={'city_id':cid},headers=admin_headers).json()
        assert len(net['nodes'])>=9
        assert all(n['city_id']==cid and 18<=n['lat']<=54 for n in net['nodes'])
        ids={n['id'] for n in net['nodes']}
        assert all(e['source'] in ids and e['target'] in ids for e in net['edges'])
        assert all(v['home_node'] in ids for v in net['vehicles'])
        scenarios=client.get(BASE+'/scenarios',params={'city_id':cid},headers=admin_headers).json()
        assert scenarios and all(s['city_id']==cid for s in scenarios)

def test_reject_city_mismatch_tasks_edges_and_route(client,admin_headers):
    headers=admin_headers
    assert client.post(BASE+'/scenarios/SCN-001/tasks',headers=headers,json={
      'cargo':'跨城市不允许','weight_kg':5,'origin':'N01','destination':'SH01','deadline_min':100,'priority':1}).status_code==422
    assert client.post(BASE+'/network/edges',headers=headers,json={
      'source':'N01','target':'SH01','distance_km':100,'risk':0.02}).status_code==422
    assert client.get(BASE+'/routes/preview',headers=headers,params={
      'city_id':'wuhan','origin':'N01','destination':'SH01'}).status_code==422

def test_route_preview_and_edit_task(client,admin_headers):
    headers=admin_headers
    route=client.get(BASE+'/routes/preview',headers=headers,params={
        'city_id':'wuhan','origin':'N01','destination':'N08','strategy':'balanced','algorithm':'astar'})
    assert route.status_code==200 and route.json()['nodes'][0]=='N01'
    routes_alt=client.get(BASE+'/routes/preview',headers=headers,params={
        'city_id':'wuhan','origin':'N01','destination':'N08','algorithm':'dijkstra'})
    assert routes_alt.status_code==200
    t=client.get(BASE+'/scenarios/SCN-001/tasks',headers=headers).json()[0]
    p=client.patch(BASE+f'/scenarios/SCN-001/tasks/{t["id"]}',headers=headers,json={'weight_kg':27.5,'priority':3})
    assert p.status_code==200 and p.json()['weight_kg']==27.5
    assert client.patch(BASE+f'/scenarios/SCN-002/tasks/{t["id"]}',headers=headers,json={'priority':2}).status_code==404
    assert client.patch(BASE+f'/scenarios/SCN-001/tasks/{t["id"]}',headers=headers,json={'priority':7}).status_code==422

def test_plan_single_city_snapshot(client,admin_headers):
    p=client.post(BASE+'/plans',headers=admin_headers,json={'scenario_id':'SCN-003'})
    assert p.status_code==201,p.text
    snapshot=p.json()['snapshot_data']
    assert snapshot['scenario']['city_id']=='shanghai'
    assert all(x['city_id']=='shanghai' for x in snapshot['nodes'])
    assert all(a['origin'].startswith('SH') for a in p.json()['assignment_data'])

def test_node_edge_vehicle_parameter_edits(client,admin_headers):
    h=admin_headers
    n=client.patch(BASE+'/network/nodes/N01',headers=h,json={'health':81,'lon':114.431,'lat':30.612})
    assert n.status_code==200 and n.json()['lon']==114.431
    assert client.patch(BASE+'/network/nodes/N01',headers=h,json={'lat':44.0}).status_code==422
    e=client.patch(BASE+'/network/edges/E01',headers=h,json={'distance_km':18.2,'risk':0.15})
    assert e.status_code==200 and e.json()['risk']==0.15
    v=client.patch(BASE+'/vehicles/V01',headers=h,json={'speed_kmh':45,'reliability':0.88})
    assert v.status_code==200 and v.json()['speed_kmh']==45
    assert client.patch(BASE+'/vehicles/V01',headers=h,json={'speed_kmh':-1}).status_code==422
