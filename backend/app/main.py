"""Aether Route API — versioned, authenticated and entirely self-hosted."""
from __future__ import annotations
import json
from hashlib import sha256
from pathlib import Path
from uuid import uuid4
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from .database import engine, Base, SessionLocal, get_db
from . import models as m, schemas as s, engine as sim
from .security import current_user, can_edit, can_admin, verify_password, sign_token
from .seed import seed_database
from .config import DEMO_MODE, CORS_ORIGINS
from .cities import CITIES, REGIONAL_CITY
from .replay import assessment_projection
from .migration import upgrade_schema
from .operations import normalize_configuration, scenario_vehicles, telemetry_at, delivery_report
from .airdrop import EXPERIMENT_MODEL_VERSION, normalize_parameters, parameter_summary

@asynccontextmanager
async def lifespan(_app: FastAPI):
    upgrade_schema()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if DEMO_MODE:
            seed_database(db)
        else:
            seeded = db.scalar(select(m.User).where(m.User.username=='admin'))
            if seeded and verify_password('demo123456', seeded.password_hash):
                raise RuntimeError('Production cannot start while the demo admin password is active')
    yield

app = FastAPI(title='AETHER · 民用应急空投实验平台', version='5.0.0',
              description='Synthetic civilian emergency-aid airdrop experiments with reproducible records',
              lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=CORS_ORIGINS,allow_credentials=False,
                   allow_methods=['GET','POST','PUT','PATCH','DELETE'],allow_headers=['Authorization','Content-Type'])
PREFIX = '/api/v1'


def lookup(db: Session, model, key):
    obj = db.get(model,key)
    if obj is None: raise HTTPException(status_code=404,detail='资源不存在')
    return obj


def rows(db: Session, model) -> list[dict]:
    return [getattr(s,model.__name__+'Out').model_validate(row).model_dump(mode='json')
            for row in db.scalars(select(model)).all()]


def graph_and_fleet(db: Session, city_id: str | None = None, network_id: str | None = None):
    nodes = rows(db,m.Node)
    edges = rows(db,m.Edge)
    vehicles = rows(db,m.Vehicle)
    if city_id:
        nodes = [n for n in nodes if n['city_id'] == city_id]
        if network_id is None:
            if city_id == 'national' and any(n['network_id']=='civil-airdrop' for n in nodes):
                network_id='civil-airdrop'
            else:
                network_id='regional' if any(n['network_id']=='regional' for n in nodes) else 'geographic' if any(n['network_id']=='geographic' for n in nodes) else 'baseline'
    if network_id is not None:
        nodes = [n for n in nodes if n['network_id']==network_id]
    if city_id or network_id is not None:
        ids = {n['id'] for n in nodes}
        edges = [e for e in edges if e['source'] in ids and e['target'] in ids]
        vehicles = [v for v in vehicles if v['home_node'] in ids]
    return nodes,edges,vehicles


def ensure_in_city(city_id:str,lat:float,lon:float):
    if city_id=='national':return
    city=next((c for c in CITIES if c['id']==city_id),None)
    if not city:raise HTTPException(status_code=422,detail='不支持的城市编号')
    clat,clon=city['center']
    if abs(lat-clat)>1.6 or abs(lon-clon)>1.6:
        raise HTTPException(status_code=422,detail='示例设施位置距离目标城市过远，请核对经纬度')


def same_city_nodes(db: Session, city_id: str, *node_ids: str, network_id: str | None = None):
    for node_id in node_ids:
        node = lookup(db,m.Node,node_id)
        if node.city_id != city_id:
            raise HTTPException(status_code=422,detail='节点不属于当前城市，禁止跨城市混合规划')
        if network_id is not None and node.network_id != network_id:
            raise HTTPException(status_code=422,detail='节点不属于当前想定的路网，不能混合历史拓扑与地理路网')

@app.get(f'{PREFIX}/cities')
def cities(_user:m.User=Depends(current_user)):
    # Legacy city networks remain archived for audit; the active product is the synthetic civil airdrop lab.
    return [REGIONAL_CITY]


def note(db:Session, user:m.User, action:str, subject:str, details:dict|None=None):
    db.add(m.AuditLog(actor=user.username,action=action,subject=subject,
                      details=json.dumps(details or {},ensure_ascii=False)))

@app.get(f'{PREFIX}/health')
def health():
    return {'status':'ok','service':'aether-route','version':'4.0.0','demo_mode':DEMO_MODE}

@app.post(f'{PREFIX}/auth/login')
def login(body:s.LoginIn,db:Session=Depends(get_db)):
    user = db.scalar(select(m.User).where(m.User.username == body.username))
    if not user or not verify_password(body.password,user.password_hash):
        raise HTTPException(status_code=401,detail='用户名或密码错误')
    return {'access_token':sign_token(user),'token_type':'bearer','user':{'username':user.username,'role':user.role}}

@app.get(f'{PREFIX}/auth/me')
def me(user:m.User=Depends(current_user)):
    return {'username':user.username,'role':user.role}

@app.get(f'{PREFIX}/overview')
def overview(city_id:str|None=None,db:Session=Depends(get_db), _user:m.User=Depends(current_user)):
    scenarios = db.scalar(select(func.count()).select_from(m.Scenario).where(m.Scenario.status!='archived')) or 0
    tasks = db.scalar(select(func.count()).select_from(m.DeliveryTask).join(m.Scenario).where(m.Scenario.status!='archived')) or 0
    node_data,edge_data,vehicle_data=graph_and_fleet(db,city_id)
    vehicles=vehicle_data
    edges=edge_data
    last_run = db.scalar(select(m.SimulationRun).order_by(m.SimulationRun.created_at.desc(),m.SimulationRun.id.desc()).limit(1))
    if city_id:
        scenarios=db.scalar(select(func.count()).select_from(m.Scenario).where(m.Scenario.city_id==city_id,m.Scenario.status!='archived')) or 0
        tasks=db.scalar(select(func.count()).select_from(m.DeliveryTask).join(m.Scenario).where(m.Scenario.city_id==city_id,m.Scenario.status!='archived')) or 0
    return {'scenario_count':scenarios,'task_count':tasks,'vehicle_count':len(vehicles),
            'available_vehicles':sum(v['status']=='available' for v in vehicles),
            'node_count':len(node_data),
            'edge_count':len(edges),'restricted_edges':sum(e['status'] != 'open' for e in edges),
            'latest_run':s.RunOut.model_validate(last_run).model_dump(mode='json') if last_run else None}

@app.get(f'{PREFIX}/network')
def network(city_id:str|None=None,network_id:str|None=None,db:Session=Depends(get_db), _user:m.User=Depends(current_user)):
    nodes,edges,vehicles = graph_and_fleet(db,city_id,network_id)
    return {'nodes':nodes,'edges':edges,'vehicles':vehicles,'network_id':nodes[0]['network_id'] if nodes else network_id or 'baseline'}

@app.post(f'{PREFIX}/network/nodes',response_model=s.NodeOut,status_code=201)
def create_node(body:s.NodeIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    if db.get(m.Node,body.id):
        raise HTTPException(status_code=409,detail='节点编号已存在')
    payload=body.model_dump()
    if payload['lon'] is None or payload['lat'] is None:
        raise HTTPException(status_code=422,detail='真实城市地图节点必须提供经纬度')
    ensure_in_city(payload['city_id'],payload['lat'],payload['lon'])
    node=m.Node(**payload,status='online')
    db.add(node);note(db,user,'network.node.create',node.id,body.model_dump());db.commit();db.refresh(node)
    return node

@app.patch(f'{PREFIX}/network/nodes/{{node_id}}',response_model=s.NodeOut)
def update_node(node_id:str,body:s.NodePatch,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    node=lookup(db,m.Node,node_id)
    changes=body.model_dump(exclude_unset=True,exclude_none=True)
    if not changes:raise HTTPException(status_code=422,detail='没有提供有效的节点更新内容')
    candidate_lat=changes.get('lat',node.lat);candidate_lon=changes.get('lon',node.lon)
    ensure_in_city(node.city_id,candidate_lat,candidate_lon)
    for name,value in changes.items():setattr(node,name,value)
    note(db,user,'network.node.update',node.id,changes);db.commit();db.refresh(node)
    return node

@app.post(f'{PREFIX}/network/edges',response_model=s.EdgeOut,status_code=201)
def create_edge(body:s.EdgeIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    a=lookup(db,m.Node,body.source);b=lookup(db,m.Node,body.target)
    if a.city_id!=b.city_id:raise HTTPException(status_code=422,detail='禁止跨城市创建路网通道')
    if a.network_id!=b.network_id:raise HTTPException(status_code=422,detail='禁止连接不同路网的节点')
    # Prevent ambiguous parallel edges in the bidirectional model.
    existing=db.scalar(select(m.Edge.id).where(
        ((m.Edge.source==body.source)&(m.Edge.target==body.target)) |
        ((m.Edge.source==body.target)&(m.Edge.target==body.source))).limit(1))
    if existing:raise HTTPException(status_code=409,detail='节点之间已经存在通道')
    edge=m.Edge(id='E-'+uuid4().hex[:8].upper(),status='open',**body.model_dump())
    db.add(edge);note(db,user,'network.edge.create',edge.id,body.model_dump());db.commit();db.refresh(edge)
    return edge

@app.post(f'{PREFIX}/vehicles',response_model=s.VehicleOut,status_code=201)
def create_vehicle(body:s.VehicleIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    lookup(db,m.Node,body.home_node)
    if db.scalar(select(m.Vehicle.id).where(m.Vehicle.code==body.code).limit(1)):
        raise HTTPException(status_code=409,detail='平台编号已存在')
    vehicle=m.Vehicle(id='V-'+uuid4().hex[:8].upper(),status='available',**body.model_dump())
    db.add(vehicle);note(db,user,'vehicle.create',vehicle.id,body.model_dump());db.commit();db.refresh(vehicle)
    return vehicle

@app.get(f'{PREFIX}/scenarios',response_model=list[s.ScenarioOut])
def scenarios(city_id:str|None=None,db:Session=Depends(get_db), _user:m.User=Depends(current_user)):
    q=select(m.Scenario).where(m.Scenario.status!='archived').order_by(m.Scenario.created_at,m.Scenario.id)
    if city_id:q=q.where(m.Scenario.city_id==city_id)
    return db.scalars(q).all()

@app.post(f'{PREFIX}/scenarios',response_model=s.ScenarioOut,status_code=201)
def create_scenario(body:s.ScenarioIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    scenario = m.Scenario(id='SCN-'+uuid4().hex[:8].upper(),**body.model_dump())
    db.add(scenario);note(db,user,'scenario.create',scenario.id,body.model_dump());db.commit();db.refresh(scenario)
    return scenario

@app.get(f'{PREFIX}/scenarios/{{scenario_id}}',response_model=s.ScenarioOut)
def get_scenario(scenario_id:str,db:Session=Depends(get_db), _user:m.User=Depends(current_user)):
    return lookup(db,m.Scenario,scenario_id)

@app.patch(f'{PREFIX}/scenarios/{{scenario_id}}',response_model=s.ScenarioOut)
def update_scenario(scenario_id:str,body:s.ScenarioPatch,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    scenario = lookup(db,m.Scenario,scenario_id)
    changes = body.model_dump(exclude_unset=True,exclude_none=True)
    for key,value in changes.items(): setattr(scenario,key,value)
    note(db,user,'scenario.update',scenario.id,changes);db.commit();db.refresh(scenario)
    return scenario

@app.get(f'{PREFIX}/scenarios/{{scenario_id}}/configuration')
def get_configuration(scenario_id:str,db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    scenario=lookup(db,m.Scenario,scenario_id)
    _,_,vehicles=graph_and_fleet(db,scenario.city_id,scenario.network_id)
    return normalize_configuration(scenario.configuration_data,vehicles)

@app.patch(f'{PREFIX}/scenarios/{{scenario_id}}/configuration')
def set_configuration(scenario_id:str,body:s.ConfigurationPatch,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    scenario=lookup(db,m.Scenario,scenario_id)
    _,_,vehicles=graph_and_fleet(db,scenario.city_id,scenario.network_id)
    current=normalize_configuration(scenario.configuration_data,vehicles)
    patch=body.model_dump(exclude_unset=True,exclude_none=True)
    if not patch:raise HTTPException(status_code=422,detail='没有提供想定配置参数')
    if 'units' in patch:
        known={v['id'] for v in vehicles}
        identifiers=[u['vehicle_id'] for u in patch['units']]
        if len(identifiers)!=len(set(identifiers)):
            raise HTTPException(status_code=422,detail='同一平台不可重复加入力量编组')
        if not set(identifiers).issubset(known):
            raise HTTPException(status_code=422,detail='编组存在不属于当前城市的平台')
        for unit in patch['units']:
            same_city_nodes(db,scenario.city_id,unit['deploy_node'],network_id=scenario.network_id)
    updated={**current,**patch}
    scenario.configuration_data=updated
    note(db,user,'scenario.configuration.update',scenario.id,patch)
    db.commit()
    return updated

@app.delete(f'{PREFIX}/scenarios/{{scenario_id}}')
def delete_scenario(scenario_id:str,db:Session=Depends(get_db),user:m.User=Depends(can_admin)):
    scenario = lookup(db,m.Scenario,scenario_id)
    if db.scalar(select(m.Plan.id).where(m.Plan.scenario_id==scenario_id).limit(1)):
        raise HTTPException(status_code=409,detail='已有方案的场景不能直接删除，需保留评估追溯')
    db.delete(scenario);note(db,user,'scenario.delete',scenario_id);db.commit()
    return {'deleted':True}

@app.get(f'{PREFIX}/scenarios/{{scenario_id}}/tasks',response_model=list[s.TaskOut])
def tasks(scenario_id:str,db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    lookup(db,m.Scenario,scenario_id)
    return db.scalars(select(m.DeliveryTask).where(m.DeliveryTask.scenario_id==scenario_id).order_by(m.DeliveryTask.priority,m.DeliveryTask.code)).all()

@app.post(f'{PREFIX}/scenarios/{{scenario_id}}/tasks',response_model=s.TaskOut,status_code=201)
def create_task(scenario_id:str,body:s.TaskIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    lookup(db,m.Scenario,scenario_id)
    scenario=lookup(db,m.Scenario,scenario_id)
    same_city_nodes(db,scenario.city_id,body.origin,body.destination,network_id=scenario.network_id)
    if body.leg_index>1 and not body.predecessor_task_id:
        raise HTTPException(status_code=422,detail='后续运输分段必须关联前序任务')
    if body.shipment_id and db.scalar(select(m.DeliveryTask).where(m.DeliveryTask.scenario_id==scenario_id,m.DeliveryTask.shipment_id==body.shipment_id,m.DeliveryTask.leg_index==body.leg_index)):
        raise HTTPException(status_code=409,detail='同一运单中分段序号不能重复')
    if body.predecessor_task_id:
        previous=lookup(db,m.DeliveryTask,body.predecessor_task_id)
        if previous.scenario_id!=scenario_id or previous.destination!=body.origin or previous.shipment_id!=body.shipment_id or not body.shipment_id:
            raise HTTPException(status_code=422,detail='接驳任务必须来自同一运单和想定，并衔接前段终点')
        if body.leg_index!=previous.leg_index+1 or abs(body.weight_kg-previous.weight_kg)>.001 or body.cargo!=previous.cargo:
            raise HTTPException(status_code=422,detail='运单分段序号必须连续，接驳物资及重量必须一致')
    count = db.scalar(select(func.count()).select_from(m.DeliveryTask).where(m.DeliveryTask.scenario_id==scenario_id)) or 0
    task=m.DeliveryTask(id='TSK-'+uuid4().hex[:10].upper(),scenario_id=scenario_id,
                        code=f'T-{count+1:03}', **body.model_dump())
    db.add(task);note(db,user,'task.create',task.id,body.model_dump());db.commit();db.refresh(task)
    return task

@app.patch(f'{PREFIX}/scenarios/{{scenario_id}}/tasks/{{task_id}}',response_model=s.TaskOut)
def update_task(scenario_id:str,task_id:str,body:s.TaskPatch,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    task=lookup(db,m.DeliveryTask,task_id)
    if task.scenario_id!=scenario_id:raise HTTPException(status_code=404,detail='任务不属于当前想定')
    changes=body.model_dump(exclude_unset=True,exclude_none=True)
    for key,value in changes.items():setattr(task,key,value)
    if task.shipment_id:
        siblings=db.scalars(select(m.DeliveryTask).where(m.DeliveryTask.scenario_id==scenario_id,m.DeliveryTask.shipment_id==task.shipment_id)).all()
        for sibling in siblings:
            for key in ('cargo','weight_kg'):
                if key in changes:setattr(sibling,key,changes[key])
    note(db,user,'task.update',task.id,changes);db.commit();db.refresh(task)
    return task

@app.delete(f'{PREFIX}/scenarios/{{scenario_id}}/tasks/{{task_id}}')
def delete_task(scenario_id:str,task_id:str,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    task=lookup(db,m.DeliveryTask,task_id)
    if task.scenario_id!=scenario_id:raise HTTPException(status_code=404,detail='任务不存在于当前场景')
    if db.scalar(select(m.DeliveryTask).where(m.DeliveryTask.predecessor_task_id==task_id)):
        raise HTTPException(status_code=422,detail='该任务仍有关联的后续接驳分段，请先移除后续分段')
    db.delete(task);note(db,user,'task.delete',task_id);db.commit()
    return {'deleted':True}

@app.get(f'{PREFIX}/vehicles',response_model=list[s.VehicleOut])
def vehicles(db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    return db.scalars(select(m.Vehicle).order_by(m.Vehicle.code)).all()

class VehiclePatch(BaseModel):
    status: str | None = Field(default=None,pattern='^(available|maintenance|offline)$')
    name: str | None = Field(default=None,min_length=2,max_length=80)
    capacity_kg: float | None = Field(default=None,gt=0,le=100000)
    speed_kmh: float | None = Field(default=None,gt=0,le=350)
    range_km: float | None = Field(default=None,gt=0,le=20000)
    reliability: float | None = Field(default=None,ge=0,le=1)

@app.patch(f'{PREFIX}/vehicles/{{vehicle_id}}',response_model=s.VehicleOut)
def update_vehicle(vehicle_id:str,body:VehiclePatch,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    vehicle=lookup(db,m.Vehicle,vehicle_id)
    changes=body.model_dump(exclude_unset=True,exclude_none=True)
    if not changes:raise HTTPException(status_code=422,detail='未提供任何有效修改')
    for name,value in changes.items():setattr(vehicle,name,value)
    note(db,user,'vehicle.update',vehicle.id,changes);db.commit();db.refresh(vehicle)
    return vehicle

@app.patch(f'{PREFIX}/network/edges/{{edge_id}}',response_model=s.EdgeOut)
def update_edge(edge_id:str,body:s.EdgeStatusIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    edge=lookup(db,m.Edge,edge_id)
    changes=body.model_dump(exclude_unset=True,exclude_none=True)
    if not changes:raise HTTPException(status_code=422,detail='未提供任何有效修改')
    for name,value in changes.items():setattr(edge,name,value)
    note(db,user,'network.edge.update',edge.id,changes);db.commit();db.refresh(edge)
    return edge

@app.get(f'{PREFIX}/routes/preview')
def route_preview(origin:str,destination:str,city_id:str='wuhan',strategy:str='balanced',algorithm:str='astar',weather:str='clear',transport_mode:str='multimodal',db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    if strategy not in ('balanced','fastest','safest') or algorithm not in ('astar','dijkstra') or weather not in ('clear','rain','fog','wind'):
        raise HTTPException(status_code=422,detail='不支持的规划参数')
    same_city_nodes(db,city_id,origin,destination)
    origin_node=lookup(db,m.Node,origin)
    same_city_nodes(db,city_id,destination,network_id=origin_node.network_id)
    nodes,edges,_=graph_and_fleet(db,city_id,origin_node.network_id)
    if transport_mode not in ('multimodal','road','sea'):raise HTTPException(status_code=422,detail='不支持的运输方式')
    if transport_mode!='multimodal':edges=[e for e in edges if e.get('transport_mode','road')==transport_mode]
    path=sim.find_path(sim.build_graph(nodes,edges),origin,destination,strategy=strategy,weather=weather,algorithm=algorithm)
    if path is None:raise HTTPException(status_code=409,detail='当前没有可通行的路径')
    edge_modes={e['id']:e.get('transport_mode','road') for e in edges}
    path['transport_modes']=list(dict.fromkeys(edge_modes[eid] for eid in path['edges']))
    return path

@app.post(f'{PREFIX}/plans',response_model=s.PlanOut,status_code=201)
def create_plan(body:s.PlanIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    scenario = lookup(db,m.Scenario,body.scenario_id)
    node_data,edge_data,vehicle_data=graph_and_fleet(db,scenario.city_id,scenario.network_id)
    task_data=[s.TaskOut.model_validate(t).model_dump(mode='json') for t in scenario.tasks]
    if not task_data:raise HTTPException(status_code=422,detail='当前场景没有投送任务')
    if any(t['origin'] not in {n['id'] for n in node_data} or t['destination'] not in {n['id'] for n in node_data} for t in task_data):
        raise HTTPException(status_code=422,detail='该想定存在不属于当前城市的任务节点')
    configuration=normalize_configuration(scenario.configuration_data,vehicle_data)
    planned_vehicles=scenario_vehicles(configuration,vehicle_data)
    result=sim.generate_plan(node_data,edge_data,planned_vehicles,task_data,
                             s.ScenarioOut.model_validate(scenario).model_dump(mode='json'),
                             body.strategy,body.algorithm)
    plan=m.Plan(id='PLN-'+uuid4().hex[:8].upper(),scenario_id=scenario.id,
                name=f'{scenario.name} · {dict(balanced="均衡",fastest="时效",safest="安全")[body.strategy]}方案',
                strategy=body.strategy,algorithm=body.algorithm,
                assignment_data=result['assignments'],summary_data=result['summary'],
                snapshot_data={'scenario':s.ScenarioOut.model_validate(scenario).model_dump(mode='json'),
                               'nodes':node_data,'edges':edge_data,'vehicles':planned_vehicles,
                               'tasks':task_data,'configuration':configuration})
    db.add(plan);note(db,user,'plan.generate',plan.id,body.model_dump());db.commit();db.refresh(plan)
    return plan

@app.get(f'{PREFIX}/plans',response_model=list[s.PlanOut])
def list_plans(scenario_id:str|None=None,limit:int=Query(default=30,ge=1,le=100),db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    q=select(m.Plan).order_by(m.Plan.created_at.desc(),m.Plan.id.desc()).limit(limit)
    if scenario_id:q=q.where(m.Plan.scenario_id==scenario_id)
    return db.scalars(q).all()

@app.get(f'{PREFIX}/plans/{{plan_id}}',response_model=s.PlanOut)
def get_plan(plan_id:str,db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    return lookup(db,m.Plan,plan_id)

@app.post(f'{PREFIX}/simulations',response_model=s.RunOut,status_code=201)
def start_simulation(body:s.RunIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    plan=lookup(db,m.Plan,body.plan_id)
    scenario=lookup(db,m.Scenario,plan.scenario_id)
    snapshot = plan.snapshot_data
    if not snapshot:
        raise HTTPException(status_code=409, detail='缺少方案输入快照，无法保证推演的可重复性')
    result=sim.simulate({'assignments':plan.assignment_data,'summary':plan.summary_data},
                        snapshot['scenario'],snapshot['vehicles'],snapshot['nodes'],snapshot['edges'],
                        seed=body.seed,iterations=body.iterations)
    run=m.SimulationRun(id='RUN-'+uuid4().hex[:8].upper(),plan_id=plan.id,scenario_id=scenario.id,
                        seed=body.seed,iterations=body.iterations,**result)
    db.add(run);note(db,user,'simulation.execute',run.id,body.model_dump());db.commit();db.refresh(run)
    return run

@app.get(f'{PREFIX}/simulations',response_model=list[s.RunOut])
def list_runs(scenario_id:str|None=None,limit:int=Query(default=30,ge=1,le=100),db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    q=select(m.SimulationRun).order_by(m.SimulationRun.created_at.desc(),m.SimulationRun.id.desc()).limit(limit)
    if scenario_id:q=q.where(m.SimulationRun.scenario_id==scenario_id)
    return db.scalars(q).all()

@app.get(f'{PREFIX}/simulations/{{run_id}}',response_model=s.RunOut)
def get_run(run_id:str,db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    return lookup(db,m.SimulationRun,run_id)

@app.get(f'{PREFIX}/simulations/{{run_id}}/telemetry')
def simulation_telemetry(run_id:str,minute:float=Query(default=0,ge=0,le=100000),db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    run=lookup(db,m.SimulationRun,run_id)
    plan=lookup(db,m.Plan,run.plan_id)
    return telemetry_at({'id':run.id,'events':run.events},
                        {'assignment_data':plan.assignment_data,'snapshot_data':plan.snapshot_data},minute)

@app.get(f'{PREFIX}/simulations/{{run_id}}/report')
def simulation_report(run_id:str,db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    run=lookup(db,m.SimulationRun,run_id)
    plan=lookup(db,m.Plan,run.plan_id)
    return delivery_report({'id':run.id,'iterations':run.iterations,'events':run.events,'metrics':run.metrics},
       {'id':plan.id,'assignment_data':plan.assignment_data,'summary_data':plan.summary_data,'snapshot_data':plan.snapshot_data})

@app.post(f'{PREFIX}/experiments',response_model=s.ExperimentOut,status_code=201)
def create_experiment(body:s.ExperimentIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    """Run and persist an immutable civilian airdrop experiment record."""
    scenario=lookup(db,m.Scenario,body.scenario_id)
    if scenario.status=='archived':
        raise HTTPException(status_code=409,detail='归档想定只读，不能创建新实验')
    if scenario.network_id!='civil-airdrop':
        raise HTTPException(status_code=422,detail='实验记录仅支持当前民用空投合成想定')
    node_data,edge_data,vehicle_data=graph_and_fleet(db,scenario.city_id,scenario.network_id)
    task_data=[s.TaskOut.model_validate(t).model_dump(mode='json') for t in scenario.tasks]
    if not task_data:
        raise HTTPException(status_code=422,detail='当前空投想定没有任务')
    if any(t.get('transport_mode')!='airdrop' for t in task_data):
        raise HTTPException(status_code=422,detail='民用空投实验中的所有任务必须使用无人机空投')
    if any(e.get('transport_mode')!='airdrop' for e in edge_data):
        raise HTTPException(status_code=422,detail='活动空投网络不得混入陆路或海运通道')
    if any(v.get('category')!='drone' for v in vehicle_data):
        raise HTTPException(status_code=422,detail='活动空投网络只允许无人机平台')
    configuration=normalize_configuration(scenario.configuration_data,vehicle_data)
    planned_vehicles=scenario_vehicles(configuration,vehicle_data)
    raw_params=body.parameters.model_dump(mode='json')
    params=normalize_parameters(raw_params)
    params_snapshot=parameter_summary(params)
    scenario_data=s.ScenarioOut.model_validate(scenario).model_dump(mode='json')
    scenario_data.update({'weather':params['weather'],'wind_kmh':params['wind_kmh'],
                          'visibility_km':params['visibility_km']})
    plan_result=sim.generate_plan(node_data,edge_data,planned_vehicles,task_data,scenario_data,
                                  body.strategy,body.algorithm,experiment=params)
    plan_id='PLN-'+uuid4().hex[:8].upper()
    plan=m.Plan(id=plan_id,scenario_id=scenario.id,
                name=f'{body.name} · {dict(balanced="均衡",fastest="时效",safest="稳健")[body.strategy]}',
                strategy=body.strategy,algorithm=body.algorithm,
                assignment_data=plan_result['assignments'],summary_data=plan_result['summary'],
                snapshot_data={'scenario':scenario_data,'nodes':node_data,'edges':edge_data,
                               'vehicles':planned_vehicles,'tasks':task_data,
                               'configuration':configuration,'experiment_data':params_snapshot})
    db.add(plan)
    db.flush()
    execution=sim.simulate({'assignments':plan_result['assignments'],'summary':plan_result['summary']},
                           scenario_data,planned_vehicles,node_data,edge_data,
                           seed=body.seed,iterations=body.iterations,experiment=params)
    run_id='RUN-'+uuid4().hex[:8].upper()
    run=m.SimulationRun(id=run_id,plan_id=plan.id,scenario_id=scenario.id,
                        seed=body.seed,iterations=body.iterations,
                        experiment_data=params_snapshot,**execution)
    db.add(run)
    db.flush()
    record=m.ExperimentRecord(
        id='EXP-'+uuid4().hex[:8].upper(),scenario_id=scenario.id,plan_id=plan.id,run_id=run.id,
        name=body.name,notes=body.notes,parameters=params_snapshot,
        results={'metrics':execution['metrics'],'plan_summary':plan_result['summary'],
                 'seed':body.seed,'iterations':body.iterations,'sample_count':len(execution['samples']),
                 'run_id':run.id,'plan_id':plan.id},
        model_version=EXPERIMENT_MODEL_VERSION,created_by=user.username)
    db.add(record)
    note(db,user,'experiment.create',record.id,{'scenario_id':scenario.id,'plan_id':plan.id,
         'run_id':run.id,'parameters':params_snapshot,'seed':body.seed,'iterations':body.iterations})
    db.commit()
    db.refresh(record)
    return record

@app.get(f'{PREFIX}/experiments',response_model=list[s.ExperimentOut])
def list_experiments(scenario_id:str|None=None,limit:int=Query(default=50,ge=1,le=200),
                     db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    q=select(m.ExperimentRecord).order_by(m.ExperimentRecord.created_at.desc(),m.ExperimentRecord.id.desc()).limit(limit)
    if scenario_id:q=q.where(m.ExperimentRecord.scenario_id==scenario_id)
    return db.scalars(q).all()

@app.get(f'{PREFIX}/experiments/{{experiment_id}}',response_model=s.ExperimentOut)
def get_experiment(experiment_id:str,db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    return lookup(db,m.ExperimentRecord,experiment_id)

@app.patch(f'{PREFIX}/experiments/{{experiment_id}}',response_model=s.ExperimentOut)
def update_experiment(experiment_id:str,body:s.ExperimentPatch,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    record=lookup(db,m.ExperimentRecord,experiment_id)
    changes=body.model_dump(exclude_unset=True,exclude_none=True)
    if not changes:raise HTTPException(status_code=422,detail='请提供实验名称或备注修改')
    for key,value in changes.items():setattr(record,key,value)
    note(db,user,'experiment.annotate',record.id,changes)
    db.commit()
    db.refresh(record)
    return record

@app.get(f'{PREFIX}/simulations/{{run_id}}/assessment')
def assessment(run_id:str,minute:float=Query(default=0,ge=0,le=100000),db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    run=lookup(db,m.SimulationRun,run_id)
    plan=lookup(db,m.Plan,run.plan_id)
    return assessment_projection(
        {'id':run.id,'events':run.events,'metrics':run.metrics,'iterations':run.iterations,'seed':run.seed},
        {'id':plan.id,'assignment_data':plan.assignment_data,'summary_data':plan.summary_data,'snapshot_data':plan.snapshot_data},minute)

@app.get(f'{PREFIX}/analytics/compare')
def compare(ids:str=Query(min_length=1,max_length=1000),db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    run_ids=list(dict.fromkeys(ids.split(',')))[:8]
    runs=db.scalars(select(m.SimulationRun).where(m.SimulationRun.id.in_(run_ids))).all()
    return [{'id':r.id,'plan_id':r.plan_id,'scenario_id':r.scenario_id,
             'created_at':r.created_at.isoformat(),'metrics':r.metrics} for r in runs]

@app.get(f'{PREFIX}/audit')
def audit(limit:int=Query(default=50,ge=1,le=200),db:Session=Depends(get_db),_user:m.User=Depends(can_admin)):
    result=db.scalars(select(m.AuditLog).order_by(m.AuditLog.created_at.desc(),m.AuditLog.id.desc()).limit(limit)).all()
    return [{'id':item.id,'actor':item.actor,'action':item.action,'subject':item.subject,
             'details':item.details,'created_at':item.created_at.isoformat()} for item in result]

FRONTEND=Path(__file__).resolve().parents[2]/'frontend'
ASSETS=StaticFiles(directory=FRONTEND/'assets')

@app.get('/versioned-assets/{revision}/{filename}',include_in_schema=False)
async def versioned_asset(revision:str,filename:str,request:Request):
    response=await ASSETS.get_response(filename,request.scope)
    response.headers['Cache-Control']='no-cache'
    return response

app.mount('/assets',StaticFiles(directory=FRONTEND/'assets'),name='assets')

def frontend_html():
    # Version the complete module directory: relative ES imports must also change
    # URL when code changes, otherwise a fresh index can run cached old modules.
    digest=sha256()
    for asset in sorted((FRONTEND/'assets').iterdir()):
        if asset.is_file():
            digest.update(asset.name.encode())
            digest.update(asset.read_bytes())
    revision=digest.hexdigest()[:12]
    html=(FRONTEND/'index.html').read_text(encoding='utf-8')
    return HTMLResponse(html.replace('/assets/',f'/versioned-assets/{revision}/'),headers={'Cache-Control':'no-store'})

@app.get('/')
def index():
    return frontend_html()

@app.get('/{page:path}',include_in_schema=False)
def spa_fallback(page:str):
    if '.' in page or page.startswith('api/'):
        raise HTTPException(status_code=404,detail='不存在的资源')
    return frontend_html()
