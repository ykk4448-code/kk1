"""Civilian direct airdrop experiments with region-level map references.

All planning distances and performance factors use synthetic model units.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models as m, schemas as s
from .airdrop import EXPERIMENT_MODEL_VERSION, normalize_parameters, parameter_summary, experiment_fleet
from .engine import generate_plan, simulate

SCENARIO_ID = 'SCN-CIVIL-AIRDROP'
NETWORK_ID = 'civil-airdrop'
BASELINE_PLAN_ID = 'PLN-CIVIL-AIRDROP-BASELINE'
BASELINE_RUN_ID = 'RUN-CIVIL-AIRDROP-BASELINE'
BASELINE_EXPERIMENT_ID = 'EXP-CIVIL-AIRDROP-BASELINE'

# Region reference points are for display; experiment distances remain model units.
REGIONS=[
 ('A','浙南应急空投区',28.1,120.6,25.3,121.4,'台湾北部接收区'),
 ('B','闽北应急空投区',26.8,119.8,24.8,121.0,'台湾西北接收区'),
 ('C','闽中应急空投区',25.8,119.3,24.2,120.7,'台湾中部接收区'),
 ('D','闽南应急空投区',24.7,118.5,23.6,120.6,'台湾中南接收区'),
 ('E','粤东应急空投区',23.6,117.3,23.0,120.5,'台湾南部接收区'),
 ('F','粤南应急空投区',22.6,116.5,22.5,120.8,'台湾东南接收区'),
]
NODES=[]
REFERENCES={}
for i,(key,label,lat,lon,dlat,dlon,dlabel) in enumerate(REGIONS):
    NODES.extend([(f'MAIN-{key}','大陆·'+label,'hub',14+i*3,12+i*14,'mainland'),
                  (f'ISLE-{key}',dlabel,'delivery',78+i*2,12+i*14,'island')])
    REFERENCES[f'MAIN-{key}']=(lat,lon);REFERENCES[f'ISLE-{key}']=(dlat,dlon)
AIR_CORRIDORS=[]
TASKS=[]
CARGO=['急救药品包','便携净水物资','应急通信物资','照明电源包','食品保障包','医疗耗材包']
for i,(key,*_) in enumerate(REGIONS):
    for j in range(3):
        dest=REGIONS[(i+j)%6][0];index=i*3+j+1
        AIR_CORRIDORS.append((f'MAIN-{key}',f'ISLE-{dest}',42+j*5+i, .018+j*.004))
        TASKS.append((f'AID-{index:03}',CARGO[(i+j)%6],18+(index%5)*2,f'MAIN-{key}',f'ISLE-{dest}',130+j*15,1 if j==0 else 2))
DRONES=[(f'UAV-{key}{j}',f'空投无人机 {key}{j}',f'MAIN-{key}',34+(j%2)*4,70+j,155+j*5,.97)
        for key,*_ in REGIONS for j in range(1,5)]

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
            network_id=NETWORK_ID, x=float(x), y=float(y), lon=REFERENCES[key][1], lat=REFERENCES[key][0],
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
        name='两岸无人机直达空投 · 标准实验',
        description='6 个大陆空投区、6 个台湾接收区、18 项直达空投任务与 24 架无人机资源。地图显示区域参考位置，实验使用独立模型距离。',
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
    vehicles = experiment_fleet(vehicles, params)
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
