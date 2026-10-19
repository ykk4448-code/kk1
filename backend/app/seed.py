"""Fictional network and deterministic demonstrator scenarios."""
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models as m
from .security import hash_password

NODES = [
 ('N01','北岸综合枢纽','hub',19,20,98),('N02','云港调度中心','command',47,15,100),
 ('N03','临海补给站','depot',75,22,91),('N04','西河集散点','depot',12,50,96),
 ('N05','中央转运港','hub',43,45,100),('N06','东区配送点','delivery',79,49,87),
 ('N07','城市应急中心','critical',32,74,94),('N08','南山接驳站','depot',62,80,88),
 ('N09','海堤观测站','critical',92,72,79),('N10','工业园服务点','delivery',6,81,95),
 ('N11','生态监测点','critical',55,60,90),('N12','机场物流基地','hub',87,8,99),
]
EDGES = [
 ('N01','N02',16,.04,'urban'),('N02','N03',18,.07,'urban'),('N03','N12',11,.03,'urban'),
 ('N01','N04',18,.06,'urban'),('N01','N05',27,.07,'urban'),('N02','N05',16,.03,'urban'),
 ('N03','N06',22,.09,'coastal'),('N04','N05',19,.04,'urban'),('N04','N07',23,.05,'urban'),
 ('N04','N10',17,.06,'mountain'),('N05','N06',22,.03,'urban'),('N05','N07',20,.05,'urban'),
 ('N05','N11',13,.04,'urban'),('N06','N09',17,.13,'coastal'),('N06','N11',20,.05,'urban'),
 ('N07','N08',19,.04,'mountain'),('N07','N10',16,.06,'urban'),('N07','N11',19,.04,'urban'),
 ('N08','N09',23,.08,'coastal'),('N08','N11',15,.07,'urban'),('N09','N11',28,.09,'coastal'),
 ('N06','N12',29,.05,'urban'),
]
VEHICLES = [
 ('V01','UGV-201','陆行无人运载车 A','ugv',420,52,175,.97,'N01'),
 ('V02','UGV-202','陆行无人运载车 B','ugv',360,48,160,.95,'N05'),
 ('V03','UAV-301','多旋翼配送无人机 A','drone',36,85,108,.94,'N02'),
 ('V04','UAV-302','多旋翼配送无人机 B','drone',28,91,90,.91,'N12'),
 ('V05','UGV-203','高机动运输平台','ugv',650,45,210,.98,'N07'),
 ('V06','UAV-303','长航时巡航无人机','drone',20,105,148,.96,'N03'),
 ('V07','UGV-204','区域接驳车','ugv',280,58,185,.96,'N08'),
 ('V08','UGV-205','重载运送平台','ugv',900,38,225,.98,'N04'),
]
TASKS = [
 ('传感器备件',18,'N02','N09',52,1),('应急通信器材',120,'N01','N07',66,1),
 ('医疗补给箱',25,'N03','N08',65,1),('通用器件箱',240,'N04','N06',82,2),
 ('检修工具包',90,'N05','N10',61,2),('观测标定组件',12,'N12','N11',50,2),
 ('临时能源模块',410,'N07','N03',110,3),('高精度仪器',30,'N08','N02',65,3),
]

def seed_database(db: Session) -> None:
    if db.scalar(select(m.Node.id).limit(1)) is not None:
        return
    for id,name,cat,x,y,health in NODES:
        db.add(m.Node(id=id,name=name,category=cat,x=x,y=y,health=health,status='online'))
    db.flush()  # Persist node FKs before dependent records.
    for i,(src,dst,distance,risk,terrain) in enumerate(EDGES,1):
        db.add(m.Edge(id=f'E{i:02}',source=src,target=dst,distance_km=distance,risk=risk,terrain=terrain,status='restricted' if i in (7,19) else 'open'))
    for id,code,name,category,capacity,speed,radius,reliability,home in VEHICLES:
        db.add(m.Vehicle(id=id,code=code,name=name,category=category,capacity_kg=capacity,speed_kmh=speed,range_km=radius,reliability=reliability,home_node=home,status='available'))
    for scenario_id,name,desc,weather,wind,vis in [
        ('SCN-001','滨海城市应急物资投送','基于城市路网的多平台联合配送与时效评估','clear',12,16),
        ('SCN-002','海岸强风保障预案','模拟沿海大风对运输效率和任务准点率的影响','wind',48,6),
        ('SCN-003','低能见度交通扰动','评估雨雾条件与道路受限后的替代方案','fog',24,1.5)]:
        db.add(m.Scenario(id=scenario_id,name=name,description=desc,weather=weather,wind_kmh=wind,visibility_km=vis))
    db.flush()  # Persist scenario FKs before tasks.
    for idx,(cargo,weight,origin,destination,deadline,priority) in enumerate(TASKS,1):
        db.add(m.DeliveryTask(id=f'TSK-{idx:03}',scenario_id='SCN-001',code=f'T-{idx:03}',cargo=cargo,
                              weight_kg=weight,origin=origin,destination=destination,deadline_min=deadline,priority=priority))
    for idx,(cargo,weight,origin,destination,deadline,priority) in enumerate(TASKS[:6],1):
        db.add(m.DeliveryTask(id=f'TSK-W{idx:03}',scenario_id='SCN-002',code=f'W-{idx:03}',cargo=cargo,
                              weight_kg=weight,origin=origin,destination=destination,deadline_min=deadline*1.16,priority=priority))
    for idx,(cargo,weight,origin,destination,deadline,priority) in enumerate(TASKS[:7],1):
        db.add(m.DeliveryTask(id=f'TSK-F{idx:03}',scenario_id='SCN-003',code=f'F-{idx:03}',cargo=cargo,
                              weight_kg=weight,origin=origin,destination=destination,deadline_min=deadline*1.1,priority=priority))
    db.add(m.User(username='admin',password_hash=hash_password('demo123456'),role='admin'))
    db.add(m.User(username='analyst',password_hash=hash_password('demo123456'),role='viewer'))
    db.commit()
    # Precompute three reproducible demonstrations, so charts work immediately.
    from .engine import generate_plan, simulate
    from .schemas import NodeOut, EdgeOut, VehicleOut, TaskOut, ScenarioOut
    nodes = [NodeOut.model_validate(n).model_dump() for n in db.scalars(select(m.Node)).all()]
    edges = [EdgeOut.model_validate(e).model_dump() for e in db.scalars(select(m.Edge)).all()]
    vehicles = [VehicleOut.model_validate(v).model_dump() for v in db.scalars(select(m.Vehicle)).all()]
    for idx, sid in enumerate(('SCN-001','SCN-002','SCN-003'), 1):
        scenario = db.get(m.Scenario,sid)
        sdata = ScenarioOut.model_validate(scenario).model_dump(mode='json')
        tasks = [TaskOut.model_validate(t).model_dump() for t in scenario.tasks]
        result = generate_plan(nodes,edges,vehicles,tasks,sdata,
                               'balanced' if idx != 3 else 'safest','astar')
        plan = m.Plan(id=f'PLN-DEMO-00{idx}', scenario_id=sid,
                      name=f'{scenario.name} · 基线方案',strategy='balanced' if idx != 3 else 'safest',
                      algorithm='astar',assignment_data=result['assignments'],summary_data=result['summary'],
                      snapshot_data={'scenario':sdata,'nodes':nodes,'edges':edges,'vehicles':vehicles})
        db.add(plan)
        db.flush()  # Persist plan before dependent run.
        run_result = simulate(result,sdata,vehicles,nodes,edges,seed=2026+idx,iterations=80)
        db.add(m.SimulationRun(id=f'RUN-DEMO-00{idx}',plan_id=plan.id,scenario_id=sid,
                               seed=2026+idx,iterations=80,**run_result))
    db.commit()
