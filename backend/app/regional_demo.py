"""Pinned, approximate civilian logistics references; links are synthetic corridors."""
from sqlalchemy import select
from . import models as m,schemas as s
from .cities import distance_km
from .engine import generate_plan,simulate

SCENARIO='SCN-REGIONAL-CN'
# id, province/city label, latitude, longitude, facility type
LOCATIONS=[
 ('BJ','北京·首都物流枢纽',39.90,116.40,'hub'),('TJ','天津·天津港接驳点',38.98,117.75,'port'),
 ('SJZ','河北·石家庄枢纽',38.04,114.51,'hub'),('JN','山东·济南枢纽',36.65,117.12,'hub'),('QD','山东·青岛港接驳点',36.06,120.32,'port'),
 ('ZZ','河南·郑州枢纽',34.75,113.62,'hub'),('XA','陕西·西安枢纽',34.34,108.94,'hub'),('CD','四川·成都枢纽',30.67,104.07,'hub'),
 ('CQ','重庆·综合物流枢纽',29.56,106.55,'hub'),('WH','湖北·武汉枢纽',30.59,114.31,'hub'),('CS','湖南·长沙枢纽',28.23,112.94,'hub'),
 ('NJ','江苏·南京枢纽',32.06,118.80,'hub'),('SH','上海·城市配送中心',31.23,121.47,'delivery'),('SHP','上海·洋山港接驳点',30.63,122.06,'port'),
 ('HZ','浙江·杭州枢纽',30.27,120.15,'hub'),('NB','浙江·宁波舟山港接驳点',29.87,121.85,'port'),
 ('FZ','福建·福州配送中心',26.08,119.30,'delivery'),('FZP','福建·福州港接驳点',26.00,119.65,'port'),
 ('QZ','福建·泉州港接驳点',24.82,118.67,'port'),('XM','福建·厦门配送中心',24.48,118.08,'delivery'),('XMP','福建·厦门港接驳点',24.46,118.04,'port'),
 ('GZ','广东·广州枢纽',23.13,113.26,'hub'),('SZ','广东·深圳配送中心',22.54,114.06,'delivery'),('SZP','广东·盐田港接驳点',22.57,114.27,'port'),
 ('TPE','台湾·台北配送中心',25.04,121.56,'delivery'),('KL','台湾·基隆港接驳点',25.14,121.75,'port'),
 ('TCP','台湾·台中港接驳点',24.29,120.51,'port'),('TC','台湾·台中配送中心',24.15,120.67,'delivery'),
 ('KHP','台湾·高雄港接驳点',22.617,120.257,'port'),('KH','台湾·高雄配送中心',22.63,120.30,'delivery'),
 ('GY','贵州·贵阳枢纽',26.65,106.63,'hub'),('KM','云南·昆明枢纽',25.04,102.71,'hub'),('NN','广西·南宁枢纽',22.82,108.36,'hub'),
 ('HK','海南·海口配送中心',20.03,110.32,'delivery'),('HKP','海南·海口港接驳点',20.03,110.27,'port'),
 ('OFF1','模拟·东海外海航路点',26.0,122.8,'depot'),('OFF2','模拟·沿海航路点',28.8,122.7,'depot'),
]
ROAD=[('BJ','TJ'),('BJ','SJZ'),('SJZ','JN'),('JN','QD'),('SJZ','ZZ'),('JN','NJ'),('ZZ','XA'),('XA','CD'),('CD','CQ'),('CQ','WH'),('ZZ','WH'),('WH','NJ'),('NJ','SH'),('SH','SHP'),('NJ','HZ'),('HZ','NB'),('HZ','FZ'),('FZ','FZP'),('FZ','QZ'),('QZ','XM'),('XM','XMP'),('WH','CS'),('CS','GZ'),('GZ','SZ'),('SZ','SZP'),('XM','SZ'),('CQ','GY'),('GY','KM'),('GY','NN'),('NN','GZ'),('KL','TPE'),('TPE','TC'),('TCP','TC'),('TC','KH'),('KH','KHP'),('HKP','HK')]
SEA=[('TJ','QD'),('QD','SHP'),('SHP','NB'),('NB','OFF2'),('OFF2','OFF1'),('OFF1','KL'),('FZP','KL'),('FZP','TCP'),('QZ','TCP'),('XMP','TCP'),('XMP','KHP'),('SZP','KHP'),('TCP','KHP'),('KL','TCP'),('SZP','HKP')]
# Each itinerary becomes dependent tasks; no truck is assigned a sea edge.
SHIPMENTS=[
 ('CN-001','医疗应急物资',3000,['CD','XMP','KHP','KH'],['road','sea','road'],10000),
 ('CN-002','应急净水设备',1800,['WH','FZP','KL','TPE'],['road','sea','road'],8500),
 ('CN-003','冷链保温箱',2200,['NJ','NB','TCP','TC'],['road','sea','road'],9000),
 ('CN-004','民生保障包',1200,['GZ','SZP','KHP','KH'],['road','sea','road'],7000),
 ('CN-005','卫生防护用品',2500,['XA','QD','KL','TPE'],['road','sea','road'],15000),
 ('CN-006','应急照明器材',3200,['CQ','XMP','TCP','TC'],['road','sea','road'],11000),
 ('CN-007','常温食品补给',1600,['JN','SHP','KL','TPE'],['road','sea','road'],12000),
 ('CN-008','回运包装周转箱',900,['TC','TCP','XMP','XM'],['road','sea','road'],9500),
 ('CN-009','跨省医疗耗材',2400,['BJ','ZZ','WH'],['road','road'],8000),
 ('CN-010','西南生活物资',1400,['KM','GY','GZ'],['road','road'],9000),
 ('CN-011','海岛生活物资',2000,['SZ','SZP','HKP','HK'],['road','sea','road'],9500),
]


def seed_regional_demo(db):
    if db.get(m.Scenario,SCENARIO):return
    lookup={key:(name,lat,lon,kind) for key,name,lat,lon,kind in LOCATIONS}
    for key,name,lat,lon,kind in LOCATIONS:
        db.add(m.Node(id='CN-'+key,name=name,city_id='national',network_id='regional',category=kind,
                      lat=lat,lon=lon,x=round((lon-73)/62*100,4),y=round((54-lat)/36*100,4),health=98,status='online'))
    db.flush()
    for mode,links in [('road',ROAD),('sea',SEA)]:
        for i,(a,b) in enumerate(links,1):
            d=distance_km(lookup[a][1:3],lookup[b][1:3])*(1.22 if mode=='road' else 1.12)
            db.add(m.Edge(id=f'CN-{mode.upper()}-{i:02}',source='CN-'+a,target='CN-'+b,distance_km=round(max(.5,d),2),
                          transport_mode=mode,risk=.008+(i%4)*.003,terrain='coastal' if mode=='sea' else 'rural',status='open'))
    truck_homes=['BJ','JN','ZZ','XA','CD','CQ','WH','CS','NJ','HZ','FZ','XM','GZ','SZ','GY','KM','KL','TCP','TC','KHP','TPE','HKP']
    ship_homes=['TJ','QD','SHP','NB','FZP','XMP','SZP','KL','TCP','KHP','HKP']
    for category,homes in [('truck',truck_homes),('ship',ship_homes)]:
        for i,home in enumerate(homes,1):
            code=f'CN-{ "SEA" if category=="ship" else "TRK" }-{i:02}'
            db.add(m.Vehicle(id=code,code=code,name=('沿海运输货船' if category=='ship' else '跨区域干线货车')+f' {i}',category=category,
                             capacity_kg=50000 if category=='ship' else 8000,speed_kmh=32 if category=='ship' else 70,
                             range_km=20000 if category=='ship' else 12000,reliability=.99,home_node='CN-'+home,status='available'))
    scene=m.Scenario(id=SCENARIO,city_id='national',network_id='regional',name='全国陆海联运 · 跨省跨市与台湾接驳',
                     description='11 票民生物流示例，包含跨省陆运、沿海海运和台湾港口接驳。港口采用近似位置，连线为合成运输走廊，不表示具体开通航线。',weather='clear',wind_kmh=12,visibility_km=18)
    db.add(scene);db.flush()
    for sid,cargo,weight,route,modes,deadline in SHIPMENTS:
        previous=''
        for i,mode in enumerate(modes,1):
            task=m.DeliveryTask(id=f'{sid}-L{i}',scenario_id=SCENARIO,code=f'{sid}/{i:02}',shipment_id=sid,leg_index=i,
                                predecessor_task_id=previous,handover_min=60 if mode=='sea' else 45 if previous else 0,transport_mode=mode,
                                cargo=cargo,weight_kg=weight,origin='CN-'+route[i-1],destination='CN-'+route[i],deadline_min=deadline,priority=1 if sid in ('CN-001','CN-002') else 2)
            db.add(task);previous=task.id
    db.flush()
    ns=[s.NodeOut.model_validate(n).model_dump() for n in db.scalars(select(m.Node).where(m.Node.network_id=='regional')).all()]
    ids={n['id'] for n in ns}
    es=[s.EdgeOut.model_validate(e).model_dump() for e in db.scalars(select(m.Edge)).all() if e.source in ids and e.target in ids]
    vs=[s.VehicleOut.model_validate(v).model_dump() for v in db.scalars(select(m.Vehicle)).all() if v.home_node in ids]
    ts=[s.TaskOut.model_validate(t).model_dump() for t in db.scalars(select(m.DeliveryTask).where(m.DeliveryTask.scenario_id==SCENARIO)).all()]
    scene.configuration_data={'objective':'跨省干线运输、港口交接和跨海配送的完整民生运单仿真','units':[{'vehicle_id':v['id'],'deploy_node':v['home_node']} for v in vs],'layers':{}}
    sc=s.ScenarioOut.model_validate(scene).model_dump(mode='json')
    for strategy,label in [('balanced','均衡方案'),('fastest','时效方案'),('safest','稳健方案')]:
        result=generate_plan(ns,es,vs,ts,sc,strategy,'astar')
        plan=m.Plan(id='PLN-REGIONAL-'+strategy,scenario_id=SCENARIO,name='全国陆海联运 · '+label,strategy=strategy,algorithm='astar',assignment_data=result['assignments'],summary_data=result['summary'],
                    snapshot_data={'scenario':sc,'nodes':ns,'edges':es,'vehicles':vs,'tasks':ts,'configuration':scene.configuration_data})
        db.add(plan);db.flush()
        execution=simulate(result,sc,vs,ns,es,seed=20261020,iterations=80)
        db.add(m.SimulationRun(id='RUN-REGIONAL-'+strategy,plan_id=plan.id,scenario_id=SCENARIO,seed=20261020,iterations=80,**execution));db.flush()
