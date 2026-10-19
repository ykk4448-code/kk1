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


def telemetry_at(run: dict, plan: dict, minute: float) -> dict:
    """Interpolated synthetic position and mission state at a replay timestamp.

    Uses first iteration's immutable event trace; other Monte Carlo iterations are
    statistics, not independent position histories. Speed/load are inferred from
    planned segments, and are not real sensor readings.
    """
    if minute < 0 or minute > 100000:
        raise ValueError('invalid replay time')
    snapshot, assignments, events = _get_source(run, plan)
    nodes = {n['id']: n for n in snapshot.get('nodes', [])}
    vehicles = snapshot.get('vehicles', [])
    tasks = {t['id']: t for t in snapshot.get('tasks', [])}
    by_vehicle = defaultdict(list)
    events_by_task = defaultdict(list)
    for a in assignments:
        by_vehicle[a['vehicle_id']].append(a)
    for ev in events:
        events_by_task[ev.get('code')].append(ev)
    for items in by_vehicle.values():
        items.sort(key=lambda a: (a['start_min'], a['code']))
    result = []
    for vehicle in vehicles:
        vid = vehicle['id']
        missions = by_vehicle.get(vid, [])
        pos_id = vehicle['home_node']
        status = 'standby' if vehicle['status'] == 'available' else 'unavailable'
        cargo, code, speed, loaded, remaining, eta, completed = '', '', 0., 0., vehicle['range_km'], None, 0
        for a in missions:
            ev = events_by_task.get(a['code'], [])
            starts = [e['at_min'] for e in ev if e.get('kind') == 'dispatch']
            ends = [e for e in ev if e.get('kind') in ('arrived', 'failed')]
            start = starts[0] if starts else a['start_min']
            end = ends[0]['at_min'] if ends else a['end_min']
            if minute < start:
                break
            if minute >= end:
                pos_id = a['destination'] if not ends or ends[0]['kind'] == 'arrived' else (a['path_nodes'][-2] if len(a['path_nodes'])>1 else a['origin'])
                status = 'delivered' if not ends or ends[0]['kind'] == 'arrived' else 'failed'
                completed += status == 'delivered'
                remaining = max(0., remaining - a['distance_km'])
                code = a['code']; cargo = ''
                continue
            status = 'in_transit'; code = a['code']; cargo = a['cargo']
            loaded = float(tasks.get(a['task_id'], {}).get('weight_kg', a.get('weight_kg', 0)))
            speed = round(a['distance_km'] / max(end-start, .1) * 60, 1)
            p = min(1., max(0., (minute-start)/max(end-start,.1)))
            remaining = round(max(0., remaining-a['distance_km']*p), 2)
            eta = round(max(0.,end-minute),1)
            points = sorted((e for e in ev if e.get('kind') == 'position' and e.get('node') in nodes), key=lambda e: e['at_min'])
            if points:
                earlier = max((i for i,e in enumerate(points) if e['at_min']<=minute),default=0)
                left = points[earlier]
                right = points[min(earlier+1,len(points)-1)]
                loc_a = nodes[left['node']];loc_b=nodes[right['node']]
                ratio = min(1,max(0,(minute-left['at_min'])/max(right['at_min']-left['at_min'],.001)))
                lat = loc_a['lat']+(loc_b['lat']-loc_a['lat'])*ratio
                lon = loc_a['lon']+(loc_b['lon']-loc_a['lon'])*ratio
                pos_id=left['node']
            else:
                pos_id = a['origin']
                lat = nodes.get(pos_id, {}).get('lat')
                lon = nodes.get(pos_id, {}).get('lon')
            break
        else:
            lat=lon=None
        # If replay time is before the first active mission, or after completion,
        # position equals the last confirmed synthetic facility.
        if status != 'in_transit':
            lat = nodes.get(pos_id, {}).get('lat')
            lon = nodes.get(pos_id, {}).get('lon')
        result.append({'vehicle_id':vid,'code':vehicle['code'],'name':vehicle['name'],
            'status':status,'mission_code':code,'cargo':cargo,
            'current_speed_kmh':speed,'current_load_kg':loaded,
            'remaining_range_km':round(remaining,2),'eta_min':eta,
            'lat':round(lat,6) if lat is not None else None,
            'lon':round(lon,6) if lon is not None else None,
            'node_id':pos_id,'completed_tasks':completed})
    return {'run_id':run['id'],'minute':round(minute,2),'source':'first_iteration_synthetic_events',
            'vehicles':result,'active_count':sum(x['status']=='in_transit' for x in result)}


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
        deliveries.append({'code':a['code'],'cargo':a['cargo'],'vehicle_code':a['vehicle_code'],
          'origin':a['origin'],'destination':a['destination'],
          'weight_kg':tasks.get(a['task_id'],{}).get('weight_kg',a.get('weight_kg')),
          'planned_end_min':a['end_min'],'actual_end_min':actual_end,
          'deadline_min':a['deadline_min'],'status':status,
          'on_time':status=='delivered' and actual_end is not None and actual_end<=a['deadline_min'],
          'delay_min':round(max(0.,actual_end-a['deadline_min']),2) if actual_end is not None else None,
          'distance_km':a['distance_km']})
    unassigned=plan.get('summary_data',{}).get('unassigned',[])
    transport=[]
    for v in snapshot.get('vehicles',[]):
        assigned=[a for a in assignments if a['vehicle_id']==v['id']]
        transport.append({'vehicle_id':v['id'],'code':v['code'],'category':v['category'],
          'task_count':len(assigned), 'distance_km':round(sum(a['distance_km'] for a in assigned),2),
          'planned_work_min':round(sum(a['duration_min'] for a in assigned),2),
          'payload_capacity_kg':v['capacity_kg']})
    return {'run_id':run['id'],'plan_id':plan['id'],'iterations':run['iterations'],
       'sampling_note':'交付记录来自首次随机迭代，成功率/准点率为全轮次均值。',
       'totals':{'assigned':len(assignments),'unassigned':len(unassigned),
         'delivered':sum(d['status']=='delivered' for d in deliveries),
         'failed':sum(d['status']=='failed' for d in deliveries),
         'on_time':sum(d['on_time'] for d in deliveries),
         'weight_kg':round(sum((d['weight_kg'] or 0) for d in deliveries if d['status']=='delivered'),2),
         'distance_km':round(sum(d['distance_km'] for d in deliveries),2)},
       'transport':transport,'deliveries':deliveries,'unassigned':unassigned,
       'metrics':run.get('metrics',{})}
