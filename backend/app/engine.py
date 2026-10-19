"""Deterministic graph planning and Monte Carlo execution for civilian logistics.

A* uses a consistent, admissible geometric lower bound. Simulation is explicitly
synthetic; its risk model is not validated for real-world safety decisions.
"""
from __future__ import annotations
import heapq
import math
import random
from collections import defaultdict
from statistics import mean
from typing import Any

WEATHER_MULTIPLIER = {'clear': 1.0, 'rain': 1.18, 'wind': 1.28, 'fog': 1.22}


def build_graph(nodes: list[dict], edges: list[dict]) -> dict:
    node_by_id = {n['id']: n for n in nodes if n.get('status','online') == 'online' and n.get('health',100) > 0}
    adjacency = defaultdict(list)
    valid = [e for e in edges if e['status'] != 'closed' and e['source'] in node_by_id and e['target'] in node_by_id]
    ratio = min((e['distance_km'] / max(math.dist((node_by_id[e['source']]['x'], node_by_id[e['source']]['y']), (node_by_id[e['target']]['x'], node_by_id[e['target']]['y'])), 1e-9) for e in valid), default=0)
    for e in valid:
        adjacency[e['source']].append((e['target'], e))
        adjacency[e['target']].append((e['source'], e))
    return {'nodes': node_by_id, 'adj': adjacency, 'ratio': ratio}


def edge_cost(edge: dict, strategy: str, weather: str) -> float:
    d = edge['distance_km'] * WEATHER_MULTIPLIER[weather]
    restriction = 1.45 if edge['status'] == 'restricted' else 1.0
    risk_weight = {'fastest':0.0, 'balanced':3.0, 'safest':9.0}[strategy]
    return d * restriction * (1 + edge['risk'] * risk_weight)


def find_path(graph: dict, start: str, goal: str, *, strategy: str = 'balanced',
              weather: str = 'clear', algorithm: str = 'astar') -> dict | None:
    if start not in graph['nodes'] or goal not in graph['nodes']:
        return None
    if start == goal:
        return {'nodes':[start], 'edges':[], 'distance_km':0., 'cost':0.,'risk':0.}
    if strategy not in {'fastest','balanced','safest'} or weather not in WEATHER_MULTIPLIER or algorithm not in {'astar','dijkstra'}:
        raise ValueError('unsupported planner option')
    dest = graph['nodes'][goal]
    def heuristic(node):
        if algorithm == 'dijkstra': return 0.
        p = graph['nodes'][node]
        return math.hypot(p['x'] - dest['x'], p['y'] - dest['y']) * graph['ratio']
    frontier = [(heuristic(start), 0., start)]
    best = {start: 0.}
    back = {}
    while frontier:
        _, cost, node = heapq.heappop(frontier)
        if cost > best[node] + 1e-9: continue
        if node == goal: break
        for target, edge in graph['adj'][node]:
            candidate = cost + edge_cost(edge, strategy, weather)
            if candidate < best.get(target, float('inf')) - 1e-9:
                best[target] = candidate
                back[target] = (node, edge)
                heapq.heappush(frontier, (candidate + heuristic(target), candidate, target))
    if goal not in back: return None
    path, edges, node = [goal], [], goal
    while node != start:
        previous, edge = back[node]
        path.append(previous)
        edges.append(edge)
        node = previous
    path.reverse(); edges.reverse()
    length = sum(e['distance_km'] for e in edges)
    survival = math.prod(1-e['risk'] for e in edges)
    return {'nodes':path,'edges':[e['id'] for e in edges], 'distance_km':round(length, 2),
            'cost':round(best[goal], 3),'risk':round(1-survival, 4)}


def generate_plan(nodes: list[dict], edges: list[dict], vehicles: list[dict], tasks: list[dict],
                  scenario: dict, strategy: str = 'balanced', algorithm: str = 'astar') -> dict:
    graph = build_graph(nodes, edges)
    weather = scenario['weather']
    state = {v['id']: {'node':v['home_node'], 'free':0.} for v in vehicles if v['status']=='available'}
    assignments = []
    unassigned = []
    ordered_tasks = sorted(tasks, key=lambda t: (t['priority'], t['deadline_min'], t['code']))
    for task in ordered_tasks:
        choices = []
        for vehicle in vehicles:
            if vehicle['id'] not in state or vehicle['capacity_kg'] < task['weight_kg']: continue
            if weather == 'wind' and scenario['wind_kmh'] >= 65 and vehicle['category'] == 'drone': continue
            current = state[vehicle['id']]
            reposition = find_path(graph, current['node'], task['origin'], strategy=strategy,weather=weather,algorithm=algorithm)
            delivery = find_path(graph, task['origin'], task['destination'],strategy=strategy,weather=weather,algorithm=algorithm)
            if not reposition or not delivery: continue
            distance = reposition['distance_km'] + delivery['distance_km']
            if distance > vehicle['range_km']: continue
            minutes = distance / vehicle['speed_kmh'] * 60 * WEATHER_MULTIPLIER[weather]
            minutes *= 1.45 if scenario['visibility_km'] < 2 and vehicle['category']=='drone' else 1.0
            minutes += 5 + task['weight_kg'] / max(vehicle['capacity_kg'], 1) * 5
            arrival = current['free'] + minutes
            lateness = max(0., arrival - task['deadline_min'])
            risk = 1 - (1-reposition['risk'])*(1-delivery['risk'])
            rank = arrival + lateness * 4 + (distance * 0.3 if strategy == 'balanced' else 0) + (risk * 70 if strategy == 'safest' else 0)
            choices.append((rank, arrival, vehicle['id'], vehicle, reposition, delivery, distance, minutes, risk))
        if not choices:
            unassigned.append({'task_id':task['id'], 'code':task['code'], 'reason':'无可行运力、通路或续航不足'})
            continue
        _, arrival, _, vehicle, reposition, delivery, distance, minutes, risk = min(choices, key=lambda item: (item[0],item[2]))
        start_min = state[vehicle['id']]['free']
        path_nodes = reposition['nodes'] + delivery['nodes'][1:]
        path_edges = reposition['edges'] + delivery['edges']
        record = {'task_id':task['id'],'code':task['code'],'cargo':task['cargo'],'vehicle_id':vehicle['id'],
                  'vehicle_code':vehicle['code'],'weight_kg':task['weight_kg'],'origin':task['origin'],'destination':task['destination'],
                  'path_nodes':path_nodes,'path_edges':path_edges,'reposition_nodes':reposition['nodes'],
                  'start_min':round(start_min,2),'end_min':round(arrival,2),
                  'duration_min':round(minutes,2),'distance_km':round(distance,2),
                  'risk':round(risk,4),'deadline_min':task['deadline_min'],'priority':task['priority'],
                  'on_time_expected':arrival <= task['deadline_min']}
        assignments.append(record)
        state[vehicle['id']] = {'node':task['destination'],'free':arrival + 8}
    total_distance = sum(a['distance_km'] for a in assignments)
    max_end = max((a['end_min'] for a in assignments), default=0)
    used = len({a['vehicle_id'] for a in assignments})
    available = len(state)
    return {'assignments':assignments,'summary':{
        'assigned_count':len(assignments),'unassigned_count':len(unassigned), 'unassigned':unassigned,
        'vehicle_count':used, 'available_vehicles':available,
        'distance_km':round(total_distance,1),'makespan_min':round(max_end,1),
        'estimated_on_time_pct':round(sum(a['on_time_expected'] for a in assignments)/max(len(tasks),1)*100,1),
        'task_count':len(tasks), 'strategy':strategy, 'algorithm':algorithm}}


def _percentile(values: list[float], p: float) -> float:
    if not values: return 0.
    sorted_vals = sorted(values)
    idx = (len(sorted_vals)-1)*p
    lo, hi = math.floor(idx), math.ceil(idx)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo])*(idx-lo)


def simulate(plan: dict, scenario: dict, vehicles: list[dict], nodes: list[dict], edges: list[dict],
             *, seed: int = 2026, iterations: int = 60) -> dict:
    """Seeded simulation, sorted by scheduled start for each vehicle; no real-world forecasting."""
    if not 1 <= iterations <= 500: raise ValueError('iterations out of range')
    rng = random.Random(seed)
    vehicle_lookup = {v['id']:v for v in vehicles}
    node_lookup = {n['id']:n for n in nodes}
    edge_lookup = {e['id']:e for e in edges}
    assignments = sorted(plan['assignments'],key=lambda a:(a['start_min'],a['code']))
    weather = scenario['weather']
    stress = {'clear': 0.6, 'rain': 1.4, 'wind': 1.7, 'fog': 1.5}[weather] * (1 + max(0, scenario['wind_kmh']-25)/100)
    samples = []
    canonical_events = []
    for iteration in range(iterations):
        free_at = defaultdict(float)
        delivered, on_time, incidents, total_delay = 0,0,0,0.
        events = []
        for a in assignments:
            v = vehicle_lookup[a['vehicle_id']]
            actual_start = max(a['start_min'],free_at[a['vehicle_id']])
            incident_delay = 0.
            failed = False
            for eid in a['path_edges']:
                edge = edge_lookup[eid]
                prob = min(.55, edge['risk'] * stress * (1.25-v['reliability']*.35))
                if rng.random() < prob:
                    incidents += 1
                    incident_delay += rng.uniform(3, 13) * stress
                    if rng.random() < 0.012 * stress:
                        failed = True
            noise = rng.uniform(-0.055,0.11) * a['duration_min']
            actual_end = actual_start + max(0.2,a['duration_min'] + incident_delay + noise)
            free_at[a['vehicle_id']] = actual_end + 8
            total_delay += max(0,actual_end - a['end_min'])
            if not failed:
                delivered += 1
                on_time += actual_end <= a['deadline_min']
            if iteration == 0:
                events.append({'at_min':round(actual_start,2),'kind':'dispatch','level':'info','code':a['code'],
                               'vehicle':a['vehicle_code'],'message':f"{a['vehicle_code']} 已派遣执行 {a['code']}"})
                duration = max(.1, actual_end-actual_start)
                for i, node_id in enumerate(a['path_nodes']):
                    node = node_lookup[node_id]
                    events.append({'at_min':round(actual_start + duration*i/max(1,len(a['path_nodes'])-1),2),
                                   'kind':'position','level':'info','code':a['code'],'vehicle':a['vehicle_code'],
                                   'node':node_id,'x':node['x'],'y':node['y'], 'message':f"经过 {node.get('name',node_id)}"})
                if incident_delay > 0:
                    events.append({'at_min':round(actual_start + duration*.55,2),'kind':'warning','level':'warning',
                                   'code':a['code'],'vehicle':a['vehicle_code'],'message':f'环境扰动导致额外延迟 {incident_delay:.1f} 分钟'})
                events.append({'at_min':round(actual_end,2),'kind':'failed' if failed else 'arrived',
                               'level':'danger' if failed else 'success','code':a['code'], 'vehicle':a['vehicle_code'],
                               'message':'任务中断' if failed else ('准点交付' if actual_end <= a['deadline_min'] else '延迟交付')})
        total_tasks = plan['summary']['task_count']
        completion = max(free_at.values(),default=0)
        score = (delivered/max(1,total_tasks) * 48 + on_time/max(1,total_tasks) * 35
                 + max(0,1-incidents/max(1,len(assignments)*4)) * 17) if assignments else 0
        samples.append({'iteration':iteration+1, 'success_pct':round(delivered/max(1,total_tasks)*100,2),
                        'on_time_pct':round(on_time/max(1,total_tasks)*100,2),
                        'duration_min':round(completion,2),'incidents':incidents,
                        'avg_delay_min':round(total_delay/max(1,len(assignments)),2),'score':round(score,2)})
        if iteration == 0:
            canonical_events = sorted(events,key=lambda item:(item['at_min'],item['kind']))
    used_vehicles = len({a['vehicle_id'] for a in assignments})
    duration = mean(s['duration_min'] for s in samples)
    busy_minutes = sum(a['duration_min'] for a in assignments)
    utilization = min(100.,busy_minutes / max(1.,duration * used_vehicles)*100)
    metrics = {'success_pct':round(mean(s['success_pct'] for s in samples),1),
               'on_time_pct':round(mean(s['on_time_pct'] for s in samples),1),
               'avg_duration_min':round(duration,1),
               'p90_duration_min':round(_percentile([s['duration_min'] for s in samples],.9),1),
               'avg_delay_min':round(mean(s['avg_delay_min'] for s in samples),1),
               'avg_incidents':round(mean(s['incidents'] for s in samples),2),
               'fleet_utilization_pct':round(utilization,1),
               'score':round(mean(s['score'] for s in samples),1),
               'distance_km':plan['summary']['distance_km'],
               'assigned_count':len(assignments),
               'unassigned_count':plan['summary']['unassigned_count'],
               'iterations':iterations,'model':'Synthetic A*-Sim / v1'}
    return {'metrics':metrics,'events':canonical_events,'samples':samples}
