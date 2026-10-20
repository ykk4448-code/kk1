"""Independent geographic network for legacy databases, preserving every old row."""
from sqlalchemy import select
from . import models as m
from .cities import LANDMARKS, LINKS, distance_km
from .demo_network import seed_dense_network


def seed_geographic_demo(db):
    if db.get(m.Scenario,'SCN-GEO-WH') is not None:return
    baseline=db.scalars(select(m.Node).where(m.Node.city_id=='wuhan',m.Node.network_id=='baseline')).all()
    if len({(n.lat,n.lon) for n in baseline})>1:return
    landmarks=LANDMARKS['wuhan']
    lats=[n[2] for n in landmarks];lons=[n[3] for n in landmarks]
    for i,(name,category,lat,lon) in enumerate(landmarks):
        db.add(m.Node(id=f'GWH{i+1:02}',network_id='geographic',city_id='wuhan',name=name,category=category,
                      lat=lat,lon=lon,x=round(8+(lon-min(lons))/(max(lons)-min(lons))*84,2),
                      y=round(8+(max(lats)-lat)/(max(lats)-min(lats))*84,2),health=96,status='online'))
    db.flush()
    for i,(a,b) in enumerate(LINKS,1):
        db.add(m.Edge(id=f'GWH-E{i:02}',source=f'GWH{a+1:02}',target=f'GWH{b+1:02}',
                      distance_km=round(max(.5,distance_km(landmarks[a][2:],landmarks[b][2:])*1.3),2),
                      risk=.025+(i%4)*.008,terrain='urban',status='open'))
    for i in range(8):
        aerial=i%3==2
        db.add(m.Vehicle(id=f'GWHV{i+1:02}',code=f'GEO-{ "UAV" if aerial else "UGV" }-{201+i}',
                         name=f'武汉地理示例运输平台 {i+1}',category='drone' if aerial else 'ugv',
                         capacity_kg=60 if aerial else 600,speed_kmh=90 if aerial else 55,range_km=480,
                         reliability=.98,home_node=f'GWH{(i*2)%12+1:02}',status='available'))
    db.flush()
    seed_dense_network(db,network_id='geographic',scenario_id='SCN-GEO-WH',prefix='GWX',archive='GEO')
