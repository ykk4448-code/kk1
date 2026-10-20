"""Four Chinese city examples with approximate landmark geolocation and synthetic links."""
from sqlalchemy import select
from sqlalchemy.orm import Session
from . import models as m
from .cities import CITIES, LANDMARKS, LINKS, distance_km
from .security import hash_password

TASK_CATALOG = [
    ('应急医疗物资',26,1,4,95,1),
    ('应急通信设备',85,0,6,105,1),
    ('移动能源单元',245,2,7,140,2),
    ('环境感知终端',18,8,10,90,2),
    ('保障工具组件',145,1,3,120,2),
    ('精密仪器箱',14,5,9,155,3),
]

def seed_database(db: Session):
    """Add missing demos without replacing any existing city or historical record."""
    added_scenarios = []
    for city in CITIES:
        cid = city['id']
        if db.scalar(select(m.Node.id).where(m.Node.city_id == cid).limit(1)) is not None:
            continue
        prefix=city['code']
        landmarks=LANDMARKS[cid]
        lats=[l[2] for l in landmarks]; lons=[l[3] for l in landmarks]
        def node_id(i):return f'N{i+1:02}' if cid=='wuhan' else f'{prefix}{i+1:02}'
        for i,(name,cat,lat,lon) in enumerate(landmarks):
            # Synthetic x/y retained for backward compatibility of engine event format.
            x=round(8+(lon-min(lons))/max(.01,max(lons)-min(lons))*84,2)
            y=round(8+(max(lats)-lat)/max(.01,max(lats)-min(lats))*84,2)
            db.add(m.Node(id=node_id(i),city_id=cid,name=name,category=cat,x=x,y=y,
                          lat=lat,lon=lon,health=95-(i%5)*3,status='online'))
        db.flush()
        for i,(a,b) in enumerate(LINKS,1):
            if a>=len(landmarks) or b>=len(landmarks):continue
            distance=round(max(.5,distance_km((landmarks[a][2],landmarks[a][3]),(landmarks[b][2],landmarks[b][3]))*1.30),2)
            db.add(m.Edge(id=f'E{i:02}' if cid=='wuhan' else f'{prefix}E{i:02}',source=node_id(a),target=node_id(b),distance_km=distance,
                          risk=round(.018+(i%7)*.012,3),terrain='urban',status='restricted' if i in (7,18) else 'open'))
        for i in range(6 if cid!='wuhan' else 8):
            aerial=(i%3==2)
            db.add(m.Vehicle(id=f'{prefix}V{i+1:02}' if cid!='wuhan' else f'V{i+1:02}',
                code=f'{prefix}-{("UAV" if aerial else "UGV")}-{201+i}',name=f'{city["name"]}协同运输平台 {i+1:02}',
                category='drone' if aerial else 'ugv',capacity_kg=45 if aerial else 420+i*40,
                speed_kmh=83 if aerial else 48+i*2,range_km=155 if aerial else 210,
                reliability=.93+(i%4)*.012,home_node=node_id((i*2)%len(landmarks)),status='available'))
        sid={'wuhan':'SCN-001','shanghai':'SCN-003','chengdu':'SCN-004','shenzhen':'SCN-005'}[cid]
        if db.get(m.Scenario, sid) is not None:
            sid = f'SCN-BASE-{prefix}'
        db.add(m.Scenario(id=sid,city_id=cid,name=f'{city["name"]}城市联合投送基线',
            description=f'{city["name"]}示例地标与抽象规划通道下的应急物资配送想定。所有路线与风险值为教学仿真数据。',weather='clear',wind_kmh=12,visibility_km=15))
        added_scenarios.append(sid)
        if cid=='wuhan':
            db.add(m.Scenario(id='SCN-002',city_id=cid,name='武汉强风约束对照想定',
                description='相同城市通道条件下研究强风对配送策略的影响。',weather='wind',wind_kmh=45,visibility_km=5))
            added_scenarios.append('SCN-002')
        db.flush()
        for i,(cargo,weight,origin,destination,deadline,priority) in enumerate(TASK_CATALOG,1):
            if origin>=len(landmarks) or destination>=len(landmarks):continue
            db.add(m.DeliveryTask(id=f'{prefix}T{i:02}',scenario_id=sid,code=f'{prefix}-T{i:03}',cargo=cargo,
                weight_kg=weight,origin=node_id(origin),destination=node_id(destination),deadline_min=deadline,priority=priority))
            if cid=='wuhan' and i<=5:
                db.add(m.DeliveryTask(id=f'{prefix}W{i:02}',scenario_id='SCN-002',code=f'{prefix}-W{i:03}',cargo=cargo,
                    weight_kg=weight,origin=node_id(origin),destination=node_id(destination),deadline_min=deadline*1.2,priority=priority))
    for username, role in [('admin', 'admin'), ('analyst', 'viewer')]:
        if db.scalar(select(m.User).where(m.User.username == username)) is None:
            db.add(m.User(username=username,password_hash=hash_password('demo123456'),role=role))
    db.flush()
    from .engine import generate_plan, simulate
    from .schemas import NodeOut, EdgeOut, VehicleOut, TaskOut, ScenarioOut
    for sid in added_scenarios:
        scen = db.get(m.Scenario, sid)
        idx = {'SCN-001':1, 'SCN-002':2, 'SCN-003':3, 'SCN-004':4, 'SCN-005':5}.get(sid, 6)
        ns=db.scalars(select(m.Node).where(m.Node.city_id==scen.city_id)).all()
        ids={n.id for n in ns}
        es=[e for e in db.scalars(select(m.Edge)).all() if e.source in ids and e.target in ids]
        vs=[v for v in db.scalars(select(m.Vehicle)).all() if v.home_node in ids]
        nodes=[NodeOut.model_validate(n).model_dump() for n in ns]
        edges=[EdgeOut.model_validate(e).model_dump() for e in es]
        vehicles=[VehicleOut.model_validate(v).model_dump() for v in vs]
        tasks=[TaskOut.model_validate(t).model_dump() for t in scen.tasks]
        sd=ScenarioOut.model_validate(scen).model_dump(mode='json')
        plan_data=generate_plan(nodes,edges,vehicles,tasks,sd,'balanced','astar')
        pid = f'PLN-DEMO-{idx:03}'
        if db.get(m.Plan, pid) is not None:
            pid = f'PLN-BASE-{scen.id}'
        plan=m.Plan(id=pid,scenario_id=scen.id,name=f'{scen.name} · 初始基线',
            strategy='balanced',algorithm='astar',assignment_data=plan_data['assignments'],summary_data=plan_data['summary'],
            snapshot_data={'scenario':sd,'nodes':nodes,'edges':edges,'vehicles':vehicles,'tasks':tasks,
                           'configuration':{'objective':'城市应急保障基线方案','units':[{'vehicle_id':v['id'],'deploy_node':v['home_node']} for v in vehicles], 'layers':{}}})
        db.add(plan);db.flush()
        result=simulate(plan_data,sd,vehicles,nodes,edges,seed=2026+idx,iterations=80)
        rid = f'RUN-DEMO-{idx:03}'
        if db.get(m.SimulationRun, rid) is not None:
            rid = f'RUN-BASE-{scen.id}'
        db.add(m.SimulationRun(id=rid,plan_id=plan.id,scenario_id=scen.id,
                               seed=2026+idx,iterations=80,**result))
        db.flush()
    from .demo_network import seed_dense_network
    seed_dense_network(db)
    from .geographic_demo import seed_geographic_demo
    seed_geographic_demo(db)
    from .regional_demo import seed_regional_demo
    seed_regional_demo(db)
    db.commit()
