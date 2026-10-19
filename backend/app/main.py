"""Aether Route API — versioned, authenticated and entirely self-hosted."""
from __future__ import annotations
import json
from pathlib import Path
from uuid import uuid4
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.responses import FileResponse
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

@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if DEMO_MODE:
            seed_database(db)
        else:
            seeded = db.scalar(select(m.User).where(m.User.username=='admin'))
            if seeded and verify_password('demo123456', seeded.password_hash):
                raise RuntimeError('Production cannot start while the demo admin password is active')
    yield

app = FastAPI(title='Aether Route · 无人投送仿真平台', version='1.0.0',
              description='A*-Sim synthetic logistics mission planning and Monte Carlo simulation',
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


def graph_and_fleet(db: Session):
    return rows(db,m.Node),rows(db,m.Edge),rows(db,m.Vehicle)


def note(db:Session, user:m.User, action:str, subject:str, details:dict|None=None):
    db.add(m.AuditLog(actor=user.username,action=action,subject=subject,
                      details=json.dumps(details or {},ensure_ascii=False)))

@app.get(f'{PREFIX}/health')
def health():
    return {'status':'ok','service':'aether-route','version':'1.0.0','demo_mode':DEMO_MODE}

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
def overview(db:Session=Depends(get_db), _user:m.User=Depends(current_user)):
    scenarios = db.scalar(select(func.count()).select_from(m.Scenario)) or 0
    tasks = db.scalar(select(func.count()).select_from(m.DeliveryTask)) or 0
    vehicles = db.scalars(select(m.Vehicle)).all()
    edges = db.scalars(select(m.Edge)).all()
    last_run = db.scalar(select(m.SimulationRun).order_by(m.SimulationRun.created_at.desc(),m.SimulationRun.id.desc()).limit(1))
    return {'scenario_count':scenarios,'task_count':tasks,'vehicle_count':len(vehicles),
            'available_vehicles':sum(v.status=='available' for v in vehicles),
            'node_count':db.scalar(select(func.count()).select_from(m.Node)) or 0,
            'edge_count':len(edges),'restricted_edges':sum(e.status != 'open' for e in edges),
            'latest_run':s.RunOut.model_validate(last_run).model_dump(mode='json') if last_run else None}

@app.get(f'{PREFIX}/network')
def network(db:Session=Depends(get_db), _user:m.User=Depends(current_user)):
    nodes,edges,vehicles = graph_and_fleet(db)
    return {'nodes':nodes,'edges':edges,'vehicles':vehicles}

@app.post(f'{PREFIX}/network/nodes',response_model=s.NodeOut,status_code=201)
def create_node(body:s.NodeIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    if db.get(m.Node,body.id):
        raise HTTPException(status_code=409,detail='节点编号已存在')
    node=m.Node(**body.model_dump(),status='online')
    db.add(node);note(db,user,'network.node.create',node.id,body.model_dump());db.commit();db.refresh(node)
    return node

@app.patch(f'{PREFIX}/network/nodes/{{node_id}}',response_model=s.NodeOut)
def update_node(node_id:str,body:s.NodePatch,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    node=lookup(db,m.Node,node_id)
    changes=body.model_dump(exclude_unset=True,exclude_none=True)
    if not changes:raise HTTPException(status_code=422,detail='没有提供有效的节点更新内容')
    for name,value in changes.items():setattr(node,name,value)
    note(db,user,'network.node.update',node.id,changes);db.commit();db.refresh(node)
    return node

@app.post(f'{PREFIX}/network/edges',response_model=s.EdgeOut,status_code=201)
def create_edge(body:s.EdgeIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    lookup(db,m.Node,body.source);lookup(db,m.Node,body.target)
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
def scenarios(db:Session=Depends(get_db), _user:m.User=Depends(current_user)):
    return db.scalars(select(m.Scenario).order_by(m.Scenario.created_at,m.Scenario.id)).all()

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
    lookup(db,m.Node,body.origin); lookup(db,m.Node,body.destination)
    count = db.scalar(select(func.count()).select_from(m.DeliveryTask).where(m.DeliveryTask.scenario_id==scenario_id)) or 0
    task=m.DeliveryTask(id='TSK-'+uuid4().hex[:10].upper(),scenario_id=scenario_id,
                        code=f'T-{count+1:03}', **body.model_dump())
    db.add(task);note(db,user,'task.create',task.id,body.model_dump());db.commit();db.refresh(task)
    return task

@app.delete(f'{PREFIX}/scenarios/{{scenario_id}}/tasks/{{task_id}}')
def delete_task(scenario_id:str,task_id:str,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    task=lookup(db,m.DeliveryTask,task_id)
    if task.scenario_id!=scenario_id:raise HTTPException(status_code=404,detail='任务不存在于当前场景')
    db.delete(task);note(db,user,'task.delete',task_id);db.commit()
    return {'deleted':True}

@app.get(f'{PREFIX}/vehicles',response_model=list[s.VehicleOut])
def vehicles(db:Session=Depends(get_db),_user:m.User=Depends(current_user)):
    return db.scalars(select(m.Vehicle).order_by(m.Vehicle.code)).all()

class VehiclePatch(BaseModel):
    status: str = Field(pattern='^(available|maintenance|offline)$')

@app.patch(f'{PREFIX}/vehicles/{{vehicle_id}}',response_model=s.VehicleOut)
def update_vehicle(vehicle_id:str,body:VehiclePatch,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    vehicle=lookup(db,m.Vehicle,vehicle_id)
    vehicle.status=body.status
    note(db,user,'vehicle.update',vehicle.id,body.model_dump());db.commit();db.refresh(vehicle)
    return vehicle

@app.patch(f'{PREFIX}/network/edges/{{edge_id}}',response_model=s.EdgeOut)
def update_edge(edge_id:str,body:s.EdgeStatusIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    edge=lookup(db,m.Edge,edge_id)
    edge.status=body.status
    note(db,user,'network.edge.update',edge.id,body.model_dump());db.commit();db.refresh(edge)
    return edge

@app.post(f'{PREFIX}/plans',response_model=s.PlanOut,status_code=201)
def create_plan(body:s.PlanIn,db:Session=Depends(get_db),user:m.User=Depends(can_edit)):
    scenario = lookup(db,m.Scenario,body.scenario_id)
    node_data,edge_data,vehicle_data=graph_and_fleet(db)
    task_data=[s.TaskOut.model_validate(t).model_dump(mode='json') for t in scenario.tasks]
    if not task_data:raise HTTPException(status_code=422,detail='当前场景没有投送任务')
    result=sim.generate_plan(node_data,edge_data,vehicle_data,task_data,
                             s.ScenarioOut.model_validate(scenario).model_dump(mode='json'),
                             body.strategy,body.algorithm)
    plan=m.Plan(id='PLN-'+uuid4().hex[:8].upper(),scenario_id=scenario.id,
                name=f'{scenario.name} · {dict(balanced="均衡",fastest="时效",safest="安全")[body.strategy]}方案',
                strategy=body.strategy,algorithm=body.algorithm,
                assignment_data=result['assignments'],summary_data=result['summary'],
                snapshot_data={'scenario':s.ScenarioOut.model_validate(scenario).model_dump(mode='json'),
                               'nodes':node_data,'edges':edge_data,'vehicles':vehicle_data})
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
app.mount('/assets',StaticFiles(directory=FRONTEND/'assets'),name='assets')
@app.get('/')
def index():
    return FileResponse(FRONTEND/'index.html')

@app.get('/{page:path}',include_in_schema=False)
def spa_fallback(page:str):
    if '.' in page or page.startswith('api/'):
        raise HTTPException(status_code=404,detail='不存在的资源')
    return FileResponse(FRONTEND/'index.html')
