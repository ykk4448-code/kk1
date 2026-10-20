"""Additive, versioned multi-hub example; no historical snapshots are rewritten."""
from math import atan2, dist
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models as m
from .cities import distance_km

DENSE_SCENARIO = 'SCN-DENSE-WH'
# Deliberately synthetic facilities. Geographic mode interpolates within the
# existing example extent; these names do not claim to identify real depots.
FACILITIES = [
    ('北郊储备库','depot',10,8), ('北部接驳站','depot',33,5),
    ('航空保障点','hub',65,6), ('东北分拨站','depot',92,27),
    ('东部应急仓','depot',95,44), ('东南服务点','delivery',96,90),
    ('南部物流园','hub',75,95), ('南郊储备库','depot',50,93),
    ('西南服务点','delivery',22,95), ('西部医疗点','critical',3,67),
    ('西北接驳站','depot',3,32), ('城西分拨中心','hub',25,38),
    ('城东分拨中心','hub',65,36), ('滨湖保障点','critical',68,64),
    ('社区补给点','delivery',22,61), ('南城医疗点','critical',44,82),
    ('北城能源站','depot',45,7), ('西南应急仓','depot',15,91),
    ('东岸通信点','critical',86,57), ('中心备件库','depot',55,31),
]


def seed_dense_network(db: Session, *, network_id='baseline', scenario_id=DENSE_SCENARIO, prefix='WHX', archive='NET2'):
    # Scenario identity is the version marker. Subsequent starts preserve edits,
    # disabled links, task changes and user-created plans, rather than reseeding.
    if db.get(m.Scenario, scenario_id) is not None:
        return
    original = db.scalars(select(m.Node).where(m.Node.city_id == 'wuhan', m.Node.network_id == network_id).order_by(m.Node.id)).all()
    if not original:
        return
    reserved = [f'{prefix}{i+1:02}' for i in range(len(FACILITIES))]
    if any(db.get(m.Node, node_id) is not None for node_id in reserved):
        raise RuntimeError('Dense demo node IDs already exist; preserve them and resolve the collision before importing')
    geographic = len({(n.lat, n.lon) for n in original}) > 1
    lats, lons = [n.lat for n in original], [n.lon for n in original]
    added = []
    for i, (name, category, x, y) in enumerate(FACILITIES):
        node = m.Node(id=reserved[i], city_id='wuhan', network_id=network_id, name=f'示例·{name}', category=category,
                      x=x, y=y, health=96-i%4, status='online',
                      lat=max(lats)-(max(lats)-min(lats))*y/100,
                      lon=min(lons)+(max(lons)-min(lons))*x/100)
        db.add(node)
        added.append(node)
    db.flush()
    nodes = original + added
    ids = {n.id for n in nodes}
    edges = [e for e in db.scalars(select(m.Edge)).all() if e.source in ids and e.target in ids]
    pairs = {tuple(sorted((e.source, e.target))) for e in edges}
    new_pairs = set()
    # At least three local branches per added facility, plus an outer ring.
    # All original channels, distances, risks and statuses remain untouched.
    for node in added:
        nearby = sorted((n for n in nodes if n.id != node.id), key=lambda n: (dist((node.x,node.y),(n.x,n.y)),n.id))[:3]
        new_pairs.update(tuple(sorted((node.id, n.id))) for n in nearby)
    ring = sorted(added, key=lambda n: atan2(n.y-50, n.x-50))
    new_pairs.update(tuple(sorted((a.id,b.id))) for a,b in zip(ring,ring[1:]+ring[:1]))
    lookup = {n.id:n for n in nodes}
    for i, (source, target) in enumerate(sorted(new_pairs-pairs), 1):
        a, b = lookup[source], lookup[target]
        km = distance_km((a.lat,a.lon),(b.lat,b.lon))*1.28 if geographic else dist((a.x,a.y),(b.x,b.y))*.43
        edge = m.Edge(id=f'{prefix}-E{i:03}', source=source, target=target, distance_km=round(max(.5,km),2),
                      risk=round(.012+(i%6)*.008,3), terrain='urban', status='restricted' if i%13==0 else 'open')
        db.add(edge)
        edges.append(edge)
    vehicles = db.scalars(select(m.Vehicle).where(m.Vehicle.home_node.in_(ids))).all()
    for i in range(8):
        aerial = i%3 == 2
        vehicle = m.Vehicle(id=f'{prefix}V{i+1:02}', code=f'{"WH" if archive=="NET2" else "GEO"}-{ "UAV" if aerial else "UGV" }-{401+i}',
                            name=f'协同演示运输平台 {i+1:02}', category='drone' if aerial else 'ugv',
                            capacity_kg=60 if aerial else 600, speed_kmh=92 if aerial else 58,
                            range_km=480, reliability=.98, home_node=added[i*2].id, status='available')
        db.add(vehicle)
        vehicles.append(vehicle)
    configuration = {'objective':'多枢纽、多任务并行与替代通道对照',
                     'units':[{'vehicle_id':v.id,'deploy_node':v.home_node} for v in vehicles if v.status=='available'],
                     'layers':{'facilities':True,'links':True,'routes':True,'labels':True,'formations':True}}
    scene = m.Scenario(id=scenario_id, city_id='wuhan', network_id=network_id, name=f'{"武汉地理协同投送" if network_id=="geographic" else "多枢纽协同投送"} · {len(nodes)} 节点路网',
                       description='独立的合成扩展演示：环线、支线与跨区通道，24 项并行/接续任务；与旧想定、旧方案及历史推演分开保存。',
                       weather='clear', wind_kmh=10, visibility_km=18, configuration_data=configuration)
    db.add(scene)
    db.flush()
    cargoes = [('医疗应急包',24),('通信中继设备',42),('移动电源',180),('保障工具箱',260),('饮用水补给',320),('检测试剂',18)]
    # Cross-quadrant deliveries plus original hubs create distinct overlapping
    # missions and actual route choices, rather than decorative extra lines.
    task_pairs = [(added[i], added[(i+9)%20]) for i in range(20)]
    task_pairs += [(original[i%len(original)], added[(i*5+3)%20]) for i in range(4)]
    tasks = []
    for i, (origin, destination) in enumerate(task_pairs):
        cargo, weight = cargoes[i%len(cargoes)]
        task = m.DeliveryTask(id=f'{prefix}-T{i+1:02}', scenario_id=scene.id, code=f'{"GEO" if network_id=="geographic" else "NET"}-{i+1:03}',
                              cargo=cargo, weight_kg=weight, origin=origin.id, destination=destination.id,
                              deadline_min=180+(i%6)*20, priority=1+i%3)
        db.add(task)
        tasks.append(task)
    db.flush()
    from .schemas import NodeOut, EdgeOut, VehicleOut, TaskOut, ScenarioOut
    from .engine import generate_plan, simulate
    ns=[NodeOut.model_validate(n).model_dump() for n in nodes]
    es=[EdgeOut.model_validate(e).model_dump() for e in edges]
    vs=[VehicleOut.model_validate(v).model_dump() for v in vehicles if v.status=='available']
    ts=[TaskOut.model_validate(t).model_dump() for t in tasks]
    sc=ScenarioOut.model_validate(scene).model_dump(mode='json')
    for i, (strategy, label) in enumerate([('balanced','综合均衡'),('fastest','时效优先'),('safest','风险优先')]):
        result=generate_plan(ns,es,vs,ts,sc,strategy,'astar')
        plan=m.Plan(id=f'PLN-{archive}-{strategy}', scenario_id=scene.id, name=f'{"武汉地理路网" if network_id=="geographic" else "密集路网"} · {label}', strategy=strategy, algorithm='astar',
                    assignment_data=result['assignments'], summary_data=result['summary'],
                    snapshot_data={'scenario':sc,'nodes':ns,'edges':es,'vehicles':vs,'tasks':ts,'configuration':configuration})
        db.add(plan)
        db.flush()
        evidence=simulate(result,sc,vs,ns,es,seed=20261020+i,iterations=80)
        db.add(m.SimulationRun(id=f'RUN-{archive}-{strategy}',plan_id=plan.id,scenario_id=scene.id,seed=20261020+i,iterations=80,**evidence))
    db.flush()
