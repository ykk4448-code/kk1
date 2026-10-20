from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.database import Base
from app import models as m
from app.seed import seed_database
from app.main import graph_and_fleet, same_city_nodes
from fastapi import HTTPException
import pytest


def test_geographic_upgrade_keeps_legacy_network_separate_and_replayable():
    engine=create_engine('sqlite://')
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(m.Node(id='LEGACY',city_id='wuhan',name='历史节点',category='hub',x=25,y=40,lat=30.58,lon=114.3,health=90,status='online'))
        db.add(m.Scenario(id='OLD',city_id='wuhan',name='历史想定',weather='clear',wind_kmh=4,visibility_km=12))
        db.commit();seed_database(db)
        scene=db.get(m.Scenario,'SCN-GEO-WH');assert scene and scene.network_id=='geographic'
        nodes,edges,fleet=graph_and_fleet(db,'wuhan')
        assert len(nodes)==32 and all(n['network_id']=='geographic' for n in nodes)
        assert len({(n['lat'],n['lon']) for n in nodes})>=20
        ids={n['id'] for n in nodes};assert all(e['source'] in ids and e['target'] in ids for e in edges)
        all_geographic,_,_=graph_and_fleet(db,network_id='geographic')
        assert {n['id'] for n in all_geographic}==ids
        assert all(v['home_node'] in ids for v in fleet)
        old,_,_=graph_and_fleet(db,'wuhan','baseline');assert 'LEGACY' in {n['id'] for n in old}
        assert db.get(m.Node,'LEGACY').x==25 and db.get(m.Scenario,'OLD').network_id=='baseline'
        with pytest.raises(HTTPException):same_city_nodes(db,'wuhan','LEGACY',network_id='geographic')
        plan=db.get(m.Plan,'PLN-GEO-balanced');assert len(plan.assignment_data)==24
        assert all(n['network_id']=='geographic' for n in plan.snapshot_data['nodes'])
        count=len(db.scalars(select(m.Node)).all());seed_database(db);assert len(db.scalars(select(m.Node)).all())==count
    engine.dispose()
