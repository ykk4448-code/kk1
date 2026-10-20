from copy import deepcopy
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app import models as m
from app.database import Base
from app.seed import seed_database
from app.demo_network import DENSE_SCENARIO
from app.engine import build_graph, find_path
import re


def test_entrypoint_versions_all_relative_module_imports(client):
    page=client.get('/')
    assert page.headers['cache-control']=='no-store'
    prefix=re.search(r'/versioned-assets/[a-f0-9]{12}/',page.text).group()
    app=client.get(prefix+'app.js')
    assert app.status_code==200 and 'assessment.js' in app.text
    assessment=client.get(prefix+'assessment.js')
    assert assessment.status_code==200 and "from './routes.js'" in assessment.text
    assert client.get(prefix+'routes.js').status_code==200
    assert client.get(prefix+'missing.js').status_code==404


def test_dense_network_has_distinct_missions_and_redundant_paths(client, admin_headers):
    net=client.get('/api/v1/network?city_id=wuhan',headers=admin_headers).json()
    assert len(net['nodes'])==32 and len(net['edges'])>=70
    plans=client.get('/api/v1/plans',params={'scenario_id':DENSE_SCENARIO},headers=admin_headers).json()
    assert {p['strategy'] for p in plans}=={'balanced','fastest','safest'}
    for plan in plans:
        assignments=plan['assignment_data']
        assert len(assignments)==24 and plan['summary_data']['unassigned_count']==0
        assert len({a['vehicle_id'] for a in assignments})>=6
        assert len({tuple(a['path_nodes']) for a in assignments})>=20
        assert len({e for a in assignments for e in a['path_edges']})>=25
    path=find_path(build_graph(net['nodes'],net['edges']),'WHX01','WHX11')
    assert path and path['edges']
    for edge in path['edges']:
        alternative=find_path(build_graph(net['nodes'],[e for e in net['edges'] if e['id']!=edge]),'WHX01','WHX11')
        assert alternative, f'no alternative after closing {edge}'


def test_legacy_upgrade_is_additive_idempotent_and_collision_safe():
    engine=create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        for i in range(3):
            db.add(m.Node(id=f'N{i+1:02}',name=f'旧设施{i}',category='hub',city_id='wuhan',
                          x=10+i*30,y=20+i*20,lat=30.58,lon=114.3,health=77,status='online'))
        db.add(m.User(username='admin',role='admin',password_hash='preserve-existing-password'))
        # SCN-003 used to be a Wuhan scenario in v1; Shanghai must not overwrite it.
        db.add(m.Scenario(id='SCN-003',name='用户保留想定',city_id='wuhan',weather='rain',wind_kmh=32,visibility_km=3))
        db.flush()
        snapshot={'nodes':[{'id':'N01','x':10,'y':20}], 'custom':'immutable historical evidence'}
        db.add(m.Plan(id='PLN-DEMO-003',scenario_id='SCN-003',name='旧计划',strategy='balanced',algorithm='astar',
                      assignment_data=[],summary_data={},snapshot_data=snapshot))
        db.commit()
        original={n.id:{c.name:deepcopy(getattr(n,c.name)) for c in m.Node.__table__.columns} for n in db.scalars(select(m.Node))}
        seed_database(db)
        for node_id, values in original.items():
            assert {c.name:getattr(db.get(m.Node,node_id),c.name) for c in m.Node.__table__.columns}==values
        assert db.get(m.Scenario,'SCN-003').name=='用户保留想定'
        assert db.get(m.Scenario,'SCN-003').city_id=='wuhan'
        assert db.get(m.Plan,'PLN-DEMO-003').snapshot_data==snapshot
        assert db.scalar(select(m.User).where(m.User.username=='admin')).password_hash=='preserve-existing-password'
        assert db.get(m.Scenario,'SCN-BASE-SH').city_id=='shanghai'
        models=[m.Node,m.Edge,m.Vehicle,m.Scenario,m.DeliveryTask,m.Plan,m.SimulationRun,m.User]
        counts=lambda:{model.__name__:len(db.scalars(select(model)).all()) for model in models}
        before=counts()
        edge=db.scalar(select(m.Edge).where(m.Edge.id.like('WHX-E%')))
        edge.status='closed'
        db.get(m.Scenario,DENSE_SCENARIO).name='已编辑的协同想定'
        db.commit()
        seed_database(db)
        assert counts()==before
        assert edge.status=='closed'
        assert db.get(m.Scenario,DENSE_SCENARIO).name=='已编辑的协同想定'
    engine.dispose()
