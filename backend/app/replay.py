"""Evidence-based replay projections, including legacy synthetic XY snapshots."""
from __future__ import annotations

from collections import defaultdict
from math import isfinite
from .transport import shipment_projection


def _number(value):
    return isinstance(value, (int, float)) and isfinite(value)


def _coordinates(node):
    result = {}
    for key in ('lat', 'lon', 'x', 'y'):
        value = node.get(key)
        result[key] = float(value) if _number(value) else None
    return result


def _mission_records(plan, events):
    by_code = defaultdict(list)
    for event in sorted(events, key=lambda e: e['at_min']):
        by_code[event.get('code')].append(event)
    records = []
    for assignment in plan.get('assignment_data') or []:
        evidence = by_code[assignment['code']]
        dispatch = next((e for e in evidence if e['kind'] == 'dispatch'), None)
        outcome = next((e for e in evidence if e['kind'] in ('arrived', 'failed')), None)
        start = dispatch['at_min'] if dispatch else assignment['start_min']
        end = outcome['at_min'] if outcome else assignment['end_min']
        records.append({**assignment, 'distance_km':0 if outcome and outcome.get('blocked') else assignment['distance_km'], 'actual_start_min': start,
                        'actual_end_min': outcome['at_min'] if outcome else None,
                        'replay_end_min': max(start, end),
                        'outcome': outcome['kind'] if outcome else 'unknown',
                        'evidence': evidence})
    return sorted(records, key=lambda a: (a['actual_start_min'], a['code']))


def telemetry_at(run: dict, plan: dict, minute: float) -> dict:
    """Interpolate persisted first-iteration evidence, never invent geolocation."""
    if not _number(minute) or not 0 <= minute <= 100000:
        raise ValueError('invalid replay time')
    snapshot = plan.get('snapshot_data') or {}
    nodes = {n['id']: dict(n) for n in snapshot.get('nodes', [])}
    geo_points = {(n.get('lat'), n.get('lon')) for n in nodes.values() if _number(n.get('lat')) and _number(n.get('lon'))}
    if len(geo_points) < 2:
        for node in nodes.values():
            node['lat'] = node['lon'] = None
    tasks = {t['id']: t for t in snapshot.get('tasks', [])}
    grouped = defaultdict(list)
    for mission in _mission_records(plan, run.get('events') or []):
        grouped[mission['vehicle_id']].append(mission)
    vehicles = []
    for vehicle in snapshot.get('vehicles', []):
        missions = grouped[vehicle['id']]
        pos_id = vehicle['home_node']
        coordinates = _coordinates(nodes.get(pos_id, {}))
        status = 'standby' if vehicle['status'] == 'available' else 'unavailable'
        consumed = speed = load = progress = 0.
        code = cargo = task_id = ''
        eta = None
        completed = failed = 0
        for mission in missions:
            start, end = mission['actual_start_min'], mission['replay_end_min']
            if minute < start:
                if status != 'unavailable':
                    status = 'standby'
                break
            code, task_id = mission['code'], mission['task_id']
            if minute >= end and mission['actual_end_min'] is not None:
                arrived = mission['outcome'] == 'arrived'
                completed += int(arrived)
                failed += int(not arrived)
                consumed += mission['distance_km']
                points = [e for e in mission['evidence'] if e.get('node') in nodes]
                pos_id = mission['destination'] if arrived else (points[-1]['node'] if points else mission['origin'])
                coordinates = _coordinates(nodes.get(pos_id, {}))
                status = 'delivered' if arrived else 'failed'
                progress = 100.
                continue
            # An incomplete evidence trace has no invented arrival event.
            progress = min(1., max(0., (minute-start) / max(end-start, .001)))
            consumed += mission['distance_km'] * progress
            weight = tasks.get(task_id, {}).get('weight_kg', mission.get('weight_kg'))
            load = float(weight) if _number(weight) else None
            cargo = mission['cargo']
            speed = mission['distance_km'] / max(end-start, .001) * 60
            eta = max(0., end-minute)
            status = 'in_transit'
            points = [{'at_min': start, 'node': mission['origin']}]
            points += [e for e in mission['evidence'] if e.get('kind') == 'position' and e.get('node') in nodes]
            points.sort(key=lambda e: e['at_min'])
            left = max((e for e in points if e['at_min'] <= minute), key=lambda e: e['at_min'], default=points[0])
            right = next((e for e in points if e['at_min'] > minute), left)
            pos_id = left['node']
            a, b = _coordinates(nodes.get(left['node'], {})), _coordinates(nodes.get(right['node'], {}))
            ratio = min(1., max(0., (minute-left['at_min']) / max(right['at_min']-left['at_min'], .001)))
            coordinates = {k: (a[k]+(b[k]-a[k])*ratio if a[k] is not None and b[k] is not None else a[k]) for k in a}
            progress *= 100
            break
        remaining = max(0., vehicle['range_km']-consumed)
        vehicles.append({
            'vehicle_id': vehicle['id'], 'code': vehicle['code'], 'name': vehicle['name'],
            'category': vehicle['category'], 'capacity_kg': vehicle['capacity_kg'],
            'status': status, 'mission_code': code, 'task_id': task_id, 'cargo': cargo,
            'current_speed_kmh': round(speed, 1), 'current_load_kg': round(load, 1) if load is not None else None,
            'remaining_range_km': round(remaining, 2),
            'range_remaining_pct': round(remaining / max(vehicle['range_km'], .001) * 100, 1),
            'eta_min': round(eta, 1) if eta is not None else None,
            **{k: round(v, 6) if v is not None else None for k, v in coordinates.items()},
            'coordinate_system': 'wgs84' if coordinates['lat'] is not None and coordinates['lon'] is not None else 'synthetic_xy',
            'node_id': pos_id, 'completed_tasks': completed, 'failed_tasks': failed,
            'task_count': len(missions), 'progress_pct': round(progress, 1),
        })
    return {'run_id': run['id'], 'minute': round(minute, 2),
            'source': 'first_iteration_synthetic_events', 'vehicles': vehicles,
            'active_count': sum(v['status'] == 'in_transit' for v in vehicles),
            'position_note': '来自方案快照与首次迭代事件；缺少经纬度的旧快照使用相对坐标。速度、载荷及剩余航程均为模型推算。'}


def assessment_projection(run: dict, plan: dict, minute: float = 0) -> dict:
    """Shared task schedule and chronological statistics for an assessment desk."""
    from .operations import delivery_report
    snapshot = plan.get('snapshot_data') or {}
    events = sorted(run.get('events') or [], key=lambda e: e['at_min'])
    records = _mission_records(plan, events)
    duration = max([a['replay_end_min'] for a in records] + [e['at_min'] for e in events] + [1.])
    total = max(len(snapshot.get('tasks', [])), plan.get('summary_data', {}).get('task_count', 0), len(records))
    timeline = [{k: v for k, v in a.items() if k != 'evidence'} | {
        'incidents': [e['at_min'] for e in a['evidence'] if e['kind'] == 'warning'],
        'segments': [{'source': left['node'], 'target': right['node'], 'start_min': left['at_min'], 'end_min': right['at_min']}
                     for left, right in zip([e for e in a['evidence'] if e.get('kind') == 'position' and e.get('node')],
                                            [e for e in a['evidence'] if e.get('kind') == 'position' and e.get('node')][1:])
                     if right['at_min'] > left['at_min']],
        'weight_kg': next((t['weight_kg'] for t in snapshot.get('tasks', []) if t['id'] == a['task_id']), a.get('weight_kg')),
    } for a in records]
    # Include event timestamps as well as regular samples to preserve short events.
    times = sorted({round(duration*i/60, 4) for i in range(61)} | {float(e['at_min']) for e in events if e['kind'] in ('arrived', 'failed', 'dispatch')})
    trend = []
    for at in times:
        finished = [a for a in records if a['actual_end_min'] is not None and a['actual_end_min'] <= at]
        delivered = sum(a['outcome'] == 'arrived' for a in finished)
        failed = sum(a['outcome'] == 'failed' for a in finished)
        trend.append({'minute': round(at, 4), 'delivered': delivered, 'failed': failed,
                      'completion_pct': round(delivered/max(total, 1)*100, 2),
                      'success_pct': round(delivered/(delivered+failed)*100, 2) if delivered+failed else None,
                      'on_time': sum(a['outcome'] == 'arrived' and a['actual_end_min'] <= a['deadline_min'] for a in finished),
                      'planned_completed': sum(a['end_min'] <= at for a in records)})
    return {'run_id': run['id'], 'plan_id': plan['id'], 'duration_min': round(duration, 4),
            'total_tasks': total, 'timeline': timeline, 'trend': trend, 'events': events,
            'network': {k: snapshot.get(k, []) for k in ('nodes', 'edges', 'vehicles')},
            'tasks': snapshot.get('tasks', []),
            'shipments': shipment_projection(snapshot.get('tasks',[]),timeline,minute),
            'telemetry': telemetry_at(run, plan, minute),
            'report': delivery_report(run, plan), 'metrics': run.get('metrics', {}),
            'iterations': run.get('iterations', 1), 'seed': run.get('seed'),
            'statistics_note': '时序与曲线仅反映首次迭代；综合指标来自所有随机迭代。完成率分母包含未分配任务。'}
