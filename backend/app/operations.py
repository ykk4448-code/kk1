"""Scenario-level formation, replay telemetry, and delivery outcome projections.

This module ONLY interprets synthetic, persisted simulation data. No live vehicle
signals, physical movement commands, or real-world route claims are involved.
"""
from __future__ import annotations
from collections import defaultdict

LAYER_DEFAULTS = {'facilities': True, 'links': True, 'formations': True, 'routes': True, 'labels': True}


def normalize_configuration(raw: dict | None, vehicles: list[dict]) -> dict:
    """An absent formation means all available city vehicles; [] means no units."""
    raw = raw or {}
    if raw.get('units') is None:
        units = [{'vehicle_id': v['id'], 'deploy_node': v['home_node']}
                 for v in vehicles if v['status'] == 'available']
    else:
        units = raw['units']
    return {'objective': raw.get('objective', ''), 'units': units,
            'layers': {**LAYER_DEFAULTS, **raw.get('layers', {})}}


def scenario_vehicles(config: dict, vehicles: list[dict]) -> list[dict]:
    by_id = {v['id']: v for v in vehicles}
    return [{**by_id[u['vehicle_id']], 'home_node': u['deploy_node']}
            for u in config['units'] if u['vehicle_id'] in by_id]


def _get_source(run: dict, plan: dict):
    snapshot = plan.get('snapshot_data') or {}
    return snapshot, plan.get('assignment_data') or [], run.get('events') or []


from .replay import telemetry_at  # Public compatibility import.


def delivery_report(run: dict, plan: dict) -> dict:
    """Per-task outcomes from the *first* replay iteration; metric means are separate."""
    snapshot, assignments, events = _get_source(run, plan)
    tasks={t['id']:t for t in snapshot.get('tasks', [])}
    final_by_code={e['code']:e for e in events if e.get('kind') in ('arrived','failed') and e.get('code')}
    deliveries=[]
    for a in assignments:
        end=final_by_code.get(a['code'])
        status='failed' if end and end['kind']=='failed' else 'delivered' if end else 'unknown'
        actual_end=end['at_min'] if end else None
        deliveries.append({'task_id':a['task_id'],'shipment_id':a.get('shipment_id',''),'leg_index':a.get('leg_index',1),'transport_mode':a.get('transport_mode','road'),'code':a['code'],'cargo':a['cargo'],'vehicle_code':a['vehicle_code'],
          'origin':a['origin'],'destination':a['destination'],
          'weight_kg':tasks.get(a['task_id'],{}).get('weight_kg',a.get('weight_kg')),
          'planned_end_min':a['end_min'],'actual_end_min':actual_end,
          'deadline_min':a['deadline_min'],'status':status,
          'on_time':status=='delivered' and actual_end is not None and actual_end<=a['deadline_min'],
          'delay_min':round(max(0.,actual_end-a['deadline_min']),2) if actual_end is not None else None,
          'distance_km':0 if end and end.get('blocked') else a['distance_km']})
    unassigned=plan.get('summary_data',{}).get('unassigned',[])
    transport=[]
    for v in snapshot.get('vehicles',[]):
        assigned=[a for a in assignments if a['vehicle_id']==v['id']]
        transport.append({'vehicle_id':v['id'],'code':v['code'],'category':v['category'],
          'task_count':len(assigned), 'distance_km':round(sum(a['distance_km'] for a in assigned),2),
          'planned_work_min':round(sum(a['duration_min'] for a in assigned),2),
          'payload_capacity_kg':v['capacity_kg']})
    report={'run_id':run['id'],'plan_id':plan['id'],'iterations':run['iterations'],
       'sampling_note':'交付记录来自首次随机迭代，成功率/准点率为全轮次均值。',
       'totals':{'assigned':len(assignments),'unassigned':len(unassigned),
         'delivered':sum(d['status']=='delivered' for d in deliveries),
         'failed':sum(d['status']=='failed' for d in deliveries),
         'on_time':sum(d['on_time'] for d in deliveries),
         'weight_kg': (None if any(d['weight_kg'] is None for d in deliveries if d['status']=='delivered') else round(sum(d['weight_kg'] for d in deliveries if d['status']=='delivered'),2)),
         'unknown_weight_count':sum(d['weight_kg'] is None for d in deliveries if d['status']=='delivered'),
         'distance_km':round(sum(d['distance_km'] for d in deliveries),2)},
       'transport':transport,'deliveries':deliveries,'unassigned':unassigned,
       'metrics':run.get('metrics',{})}

    if any(t.get('shipment_id') for t in tasks.values()):
        from .replay import _mission_records
        from .transport import shipment_projection
        groups=shipment_projection(list(tasks.values()),_mission_records(plan,events),100000)
        completed=[g for g in groups if g['status']=='delivered']
        report['shipments']=groups
        report['consignment_totals']={'count':len(groups),'delivered':len(completed),'failed':sum(g['status']=='failed' for g in groups),'on_time':sum(g['legs'][-1]['actual_end_min']<=g['legs'][-1]['deadline_min'] for g in completed),'weight_kg':sum(g['weight_kg'] for g in completed)}
    return report
