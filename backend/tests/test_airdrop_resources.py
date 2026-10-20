BASE='/api/v1'
SCENARIO='SCN-CIVIL-AIRDROP'

def test_direct_single_wave_uses_one_drone_per_task(client,admin_headers):
    plan=client.get(BASE+'/plans/PLN-CIVIL-AIRDROP-BASELINE',headers=admin_headers).json()
    assignments=plan['assignment_data']
    assert len(assignments)==18
    assert len({a['vehicle_id'] for a in assignments})==18
    assert all(len(a['path_nodes'])==2 and len(a['path_edges'])==1 for a in assignments)
    assert all(a['origin'].startswith('AIR-MAIN-') and a['destination'].startswith('AIR-ISLE-') for a in assignments)
    assert all(a['reposition_nodes']==[a['origin']] for a in assignments)

def test_resource_comparison_changes_fleet_without_changing_environment(client,admin_headers):
    records=[]
    for profile,count,assigned in [('compact',6,6),('standard',18,18),('reinforced',24,18)]:
        response=client.post(BASE+'/experiments',headers=admin_headers,json={
          'scenario_id':SCENARIO,'name':'资源对照 '+profile,'seed':71,'iterations':5,
          'parameters':{'fleet_profile':profile}})
        assert response.status_code==201
        record=response.json();summary=record['results']['plan_summary'];records.append(record)
        assert summary['available_vehicles']==count and summary['assigned_count']==assigned
        assert record['parameters']['fleet_profile']==profile
        assert record['results']['seed']==71 and record['results']['iterations']==5
        assert summary['task_count']==18
    assert len({r['run_id'] for r in records})==3
    assert len({r['plan_id'] for r in records})==3
    assert len({r['parameters']['wind_kmh'] for r in records})==1
    assert records[0]['results']['metrics']['success_pct']<records[1]['results']['metrics']['success_pct']

def test_unknown_resource_profile_rejected(client,admin_headers):
    response=client.post(BASE+'/experiments',headers=admin_headers,json={
      'scenario_id':SCENARIO,'parameters':{'fleet_profile':'unknown'}})
    assert response.status_code==422
