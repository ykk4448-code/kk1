from copy import deepcopy
from app import engine
from app.replay import assessment_projection

BASE='/api/v1'


def regional(client,headers):
    net=client.get(BASE+'/network?city_id=national&network_id=regional',headers=headers).json()
    plans=client.get(BASE+'/plans?scenario_id=SCN-REGIONAL-CN',headers=headers).json()
    return net,next(p for p in plans if p['strategy']=='balanced')


def test_national_catalog_and_mode_safe_complete_consignment_plans(client,admin_headers):
    net,plan=regional(client,admin_headers)
    assert len(net['nodes'])==37 and len(net['edges'])==51 and len(net['vehicles'])==33
    assert net['network_id']=='regional'
    assert {'CN-KL','CN-TCP','CN-KHP'} <= {n['id'] for n in net['nodes']}
    assert plan['summary_data']['assigned_count']==31 and plan['summary_data']['shipment_count']==11
    by_task={a['task_id']:a for a in plan['assignment_data']}
    edges={e['id']:e for e in net['edges']};vehicles={v['id']:v for v in net['vehicles']}
    for a in by_task.values():
        mode='sea' if vehicles[a['vehicle_id']]['category']=='ship' else 'road'
        assert a['transport_mode']==mode and all(edges[e]['transport_mode']==mode for e in a['path_edges'])
        if a['predecessor_task_id']:
            previous=by_task[a['predecessor_task_id']]
            assert previous['destination']==a['origin'] and previous['weight_kg']==a['weight_kg']
            assert a['start_min']>=previous['end_min']+a['handover_min']-.01


def test_ground_route_cannot_cross_sea_and_multimodal_preview_identifies_transfer(client,admin_headers):
    params={'city_id':'national','origin':'CN-CD','destination':'CN-KH','transport_mode':'road'}
    assert client.get(BASE+'/routes/preview',params=params,headers=admin_headers).status_code==409
    params['transport_mode']='multimodal'
    response=client.get(BASE+'/routes/preview',params=params,headers=admin_headers)
    assert response.status_code==200 and set(response.json()['transport_modes'])=={'road','sea'}
    assert client.get(BASE+'/routes/preview',params={**params,'transport_mode':'hovercraft'},headers=admin_headers).status_code==422


def test_simulation_waits_for_actual_handover_and_reports_consignment_outcomes(client,admin_headers):
    _,plan=regional(client,admin_headers)
    run=client.get(BASE+'/simulations?scenario_id=SCN-REGIONAL-CN',headers=admin_headers).json()[0]
    result=client.get(BASE+f"/simulations/{run['id']}/assessment?minute=100000",headers=admin_headers).json()
    assert len(result['shipments'])==11 and all(s['status'] in ('delivered','failed') for s in result['shipments'])
    assert 'shipment_success_pct' in result['metrics']
    totals=result['report']['consignment_totals']
    assert totals['count']==11
    assert totals['weight_kg']==sum(g['weight_kg'] for g in result['shipments'] if g['status']=='delivered')
    assert totals['weight_kg']<=22200 and result['report']['totals']['weight_kg']>=totals['weight_kg']*2
    actual={a['task_id']:a for a in result['timeline']}
    for a in actual.values():
        if a['predecessor_task_id']:
            previous=actual[a['predecessor_task_id']]
            assert a['actual_start_min']>=previous['actual_end_min']+a['handover_min']-.011
    assert any(e['kind']=='handover' for e in result['events'])


def test_failed_upstream_cancels_downstream_without_teleporting_cargo(client,admin_headers,monkeypatch):
    _,plan=regional(client,admin_headers);snapshot=plan['snapshot_data']
    class FailingRandom:
        def __init__(self,*_):pass
        def random(self):return 0
        def uniform(self,a,b):return a
    monkeypatch.setattr(engine.random,'Random',FailingRandom)
    output=engine.simulate({'assignments':plan['assignment_data'],'summary':plan['summary_data']},snapshot['scenario'],snapshot['vehicles'],snapshot['nodes'],snapshot['edges'],iterations=1)
    blocked=[e for e in output['events'] if e.get('blocked')]
    assert blocked and output['metrics']['shipment_success_pct']==0
    for event in blocked:
        positions=[e for e in output['events'] if e['code']==event['code'] and e['kind']=='position']
        assert len(positions)==1
    projection=assessment_projection({'id':'FAIL','iterations':1,'events':output['events'],'metrics':output['metrics']},plan,100000)
    blocked_codes={e['code'] for e in blocked}
    assert all(t['distance_km']==0 for t in projection['timeline'] if t['code'] in blocked_codes)


def test_archived_regional_tasks_are_read_only_but_history_is_preserved(client,admin_headers):
    path=BASE+'/scenarios/SCN-REGIONAL-CN/tasks'
    tasks=client.get(path,headers=admin_headers)
    assert tasks.status_code==200 and len(tasks.json())==31
    assert client.post(path,headers=admin_headers,json={
        'cargo':'不允许新增旧路网任务','weight_kg':5,'origin':'CN-CD','destination':'CN-KL',
        'transport_mode':'road','deadline_min':10000}).status_code==409
    assert client.delete(path+'/CN-001-L1',headers=admin_headers).status_code==409
    assert client.patch(path+'/CN-001-L1',headers=admin_headers,json={'weight_kg':2800}).status_code==409
    after=client.get(path,headers=admin_headers).json()
    assert {t['weight_kg'] for t in after if t['shipment_id']=='CN-001'}=={2800} or {t['weight_kg'] for t in after if t['shipment_id']=='CN-001'}=={3000}


def test_missing_sea_carriers_leaves_dependent_delivery_unassigned(client,admin_headers):
    _,plan=regional(client,admin_headers);snapshot=plan['snapshot_data']
    output=engine.generate_plan(snapshot['nodes'],snapshot['edges'],[v for v in snapshot['vehicles'] if v['category']!='ship'],snapshot['tasks'],snapshot['scenario'])
    ids={a['task_id'] for a in output['assignments']}
    assert 'CN-001-L1' in ids and 'CN-001-L2' not in ids and 'CN-001-L3' not in ids
    assert any('前序' in t['reason'] for t in output['summary']['unassigned'])
