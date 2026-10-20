"""Seed a fully synthetic civilian emergency-aid airdrop workspace.

All nodes share a dummy coordinate so the UI deliberately renders a relative XY
diagram. Edge distances are abstract model units, not geographic distances.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models as m, schemas as s
from .airdrop import EXPERIMENT_MODEL_VERSION, normalize_parameters, parameter_summary
from .engine import generate_plan, simulate

SCENARIO_ID = 'SCN-CIVIL-AIRDROP'
NETWORK_ID = 'civil-airdrop'
BASELINE_PLAN_ID = 'PLN-CIVIL-AIRDROP-BASELINE'
BASELINE_RUN_ID = 'RUN-CIVIL-AIRDROP-BASELINE'
BASELINE_EXPERIMENT_ID = 'EXP-CIVIL-AIRDROP-BASELINE'

# key, label, category, relative x/y, shore label. Coordinates are deliberately
# identical placeholders: the diagram must never be interpreted as geography.
NODES = [
    ('MAIN-A', '大陆侧·合成应急仓 A', 'hub', 14, 24, 'mainland'),
    ('MAIN-B', '大陆侧·合成应急仓 B', 'hub', 14, 50, 'mainland'),
    ('MAIN-C', '大陆侧·合成应急仓 C', 'hub', 14, 76, 'mainland'),
    ('ISLE-A', '台湾侧·合成救援接收点 A', 'delivery', 86, 24, 'island'),
    ('ISLE-B', '台湾侧·合成救援接收点 B', 'delivery', 86, 50, 'island'),
    ('ISLE-C', '台湾侧·合成救援接收点 C', 'delivery', 86, 76, 'island'),
]
# Only direct synthetic cross-sea air corridors. Values are abstract model units.
AIR_CORRIDORS = [
    ('MAIN-A','ISLE-A',42,.025),('MAIN-A','ISLE-B',51,.032),
    ('MAIN-B','ISLE-B',45,.028),('MAIN-B','ISLE-C',54,.036),
    ('MAIN-C','ISLE-A',49,.034),('MAIN-C','ISLE-C',43,.026),
]
DRONES = [
    ('UAV-A1','民用应急无人机 A1','MAIN-A',34,74,145,.97),
    ('UAV-A2','民用应急无人机 A2','MAIN-A',30,70,138,.95),
    ('UAV-B1','民用应急无人机 B1','MAIN-B',36,72,148,.97),
    ('UAV-B2','民用应急无人机 B2','MAIN-B',32,68,140,.96),
    ('UAV-C1','民用应急无人机 C1','MAIN-C',35,73,146,.98),
    ('UAV-C2','民用应急无人机 C2','MAIN-C',28,66,136,.95),
]
TASKS = [
    ('AID-001','急救包与常用药品',18,'MAIN-A','ISLE-A',115,1),
    ('AID-002','便携净水物资',24,'MAIN-A','ISLE-B',145,1),
    ('AID-003','灾后通信保障包',22,'MAIN-B','ISLE-B',130,1),
    ('AID-004','应急照明与电源',16,'MAIN-B','ISLE-C',155,2),
    ('AID-005','常温食品补给包',25,'MAIN-C','ISLE-A',150,2),
    ('AID-006','医疗耗材补给包',20,'MAIN-C','ISLE-C',125,1),
]

def seed_civil_airdrop_demo(db: Session):
    # Preserve historical scenarios/runs for audit, but take legacy land/sea
    # networks out of the active civilian product surface.
    for old in db.scalars(select(m.Scenario)).all():
        # Archive legacy networks once, but never archive user-created civil-airdrop scenarios.
        if old.network_id != NETWORK_ID:
            old.status = 'archived'
    scene = db.get(m.Scenario, SCENARIO_ID)
    if scene is not None:
        db.flush()
        return

    for key, name, category, x, y, _side in NODES:
        db.add(m.Node(
            id='AIR-'+key, name=name, category=category, city_id='national',
            network_id=NETWORK_ID, x=float(x), y=float(y), lon=120.0, lat=30.0,
            health=98, status='online'))
    db.flush()
    for index, (source, target, distance, risk) in enumerate(AIR_CORRIDORS, 1):
        db.add(m.Edge(
            id=f'AIR-E{index:02}', source='AIR-'+source, target='AIR-'+target,
            distance_km=float(distance), risk=risk, transport_mode='airdrop',
            terrain='coastal', status='open'))
    for code, name, home, capacity, speed, endurance, reliability in DRONES:
        db.add(m.Vehicle(
            id=code, code=code, name=name, category='drone',
            capacity_kg=float(capacity), speed_kmh=float(speed), range_km=float(endurance),
            reliability=reliability, home_node='AIR-'+home, status='available'))
    scene = m.Scenario(
        id=SCENARIO_ID, city_id='national', network_id=NETWORK_ID,
        name='民用应急空投 · 合成跨海示意',
        description='民生救援物资无人机空投教学场景。仅含大陆侧合成补给区到台湾侧合成接收区的直接示意通道；坐标为占位值、距离为抽象模型单位，不表示真实地理位置或可执行航线。',
        weather='clear', wind_kmh=8, visibility_km=15, status='ready',
        configuration_data={'objective':'比较民用应急物资空投在不同环境假设下的交付表现。','layers':{}})
    db.add(scene)
    db.flush()

    for code, cargo, weight, origin, destination, deadline, priority in TASKS:
        db.add(m.DeliveryTask(
            id='AIR-'+code, scenario_id=SCENARIO_ID, code=code, cargo=cargo,
            weight_kg=float(weight), origin='AIR-'+origin, destination='AIR-'+destination,
            deadline_min=float(deadline), priority=priority, transport_mode='airdrop'))
    db.flush()

    nodes = [s.NodeOut.model_validate(n).model_dump(mode='json') for n in db.scalars(
        select(m.Node).where(m.Node.network_id==NETWORK_ID).order_by(m.Node.id)).all()]
    node_ids = {n['id'] for n in nodes}
    edges = [s.EdgeOut.model_validate(e).model_dump(mode='json') for e in db.scalars(select(m.Edge)).all()
             if e.source in node_ids and e.target in node_ids]
    vehicles = [s.VehicleOut.model_validate(v).model_dump(mode='json') for v in db.scalars(select(m.Vehicle)).all()
                if v.home_node in node_ids]
    tasks = [s.TaskOut.model_validate(t).model_dump(mode='json') for t in db.scalars(
        select(m.DeliveryTask).where(m.DeliveryTask.scenario_id==SCENARIO_ID).order_by(m.DeliveryTask.code)).all()]
    scenario_data = s.ScenarioOut.model_validate(scene).model_dump(mode='json')
    configuration = {'objective':scene.configuration_data['objective'],
                     'units':[{'vehicle_id':v['id'],'deploy_node':v['home_node']} for v in vehicles],
                     'layers':{}}
    scene.configuration_data = configuration
    params = normalize_parameters()
    params_snapshot = parameter_summary(params)
    scenario_data.update({'weather':params['weather'],'wind_kmh':params['wind_kmh'],
                          'visibility_km':params['visibility_km']})
    planned = generate_plan(nodes, edges, vehicles, tasks, scenario_data, 'balanced', 'astar', experiment=params)
    plan = m.Plan(
        id=BASELINE_PLAN_ID, scenario_id=SCENARIO_ID, name='民用应急空投 · 基线方案',
        strategy='balanced', algorithm='astar', assignment_data=planned['assignments'],
        summary_data=planned['summary'],
        snapshot_data={'scenario':scenario_data,'nodes':nodes,'edges':edges,'vehicles':vehicles,
                       'tasks':tasks,'configuration':configuration,'experiment_data':params_snapshot})
    db.add(plan)
    db.flush()
    execution = simulate(planned, scenario_data, vehicles, nodes, edges,
                         seed=20261020, iterations=80, experiment=params)
    run = m.SimulationRun(
        id=BASELINE_RUN_ID, plan_id=plan.id, scenario_id=SCENARIO_ID,
        seed=20261020, iterations=80, experiment_data=params_snapshot, **execution)
    db.add(run)
    db.flush()
    db.add(m.ExperimentRecord(
        id=BASELINE_EXPERIMENT_ID, scenario_id=SCENARIO_ID, plan_id=plan.id, run_id=run.id,
        name='基线实验 · 默认环境', notes='系统预置的可复现实验记录。参数为教学假设，结果仅用于软件验证。',
        parameters=params_snapshot,
        results={'metrics':execution['metrics'],'plan_summary':planned['summary'],
                 'strategy':'balanced','algorithm':'astar','model_version':EXPERIMENT_MODEL_VERSION,
                 'seed':20261020,'iterations':80,'sample_count':len(execution['samples']),
                 'run_id':run.id,'plan_id':plan.id},
        model_version=EXPERIMENT_MODEL_VERSION, created_by='system'))
    db.flush()
