from app.engine import build_graph, find_path, generate_plan, simulate

NODES=[dict(id=x,x=i*10.,y=0.) for i,x in enumerate('ABCD')]
EDGES=[dict(id='ab',source='A',target='B',distance_km=10.,risk=.04,status='open'),
       dict(id='bc',source='B',target='C',distance_km=11.,risk=.05,status='open'),
       dict(id='ac',source='A',target='C',distance_km=26.,risk=.01,status='open'),
       dict(id='cd',source='C',target='D',distance_km=9.,risk=.05,status='open')]
V=[dict(id='v1',code='UGV-1',name='test',category='ugv',capacity_kg=100.,speed_kmh=60.,range_km=80.,reliability=.95,home_node='A',status='available')]
T=[dict(id='t1',code='T-1',cargo='实验组件',weight_kg=30,origin='A',destination='D',deadline_min=90,priority=1)]
S=dict(weather='clear',wind_kmh=5.,visibility_km=12.)

def test_astar_matches_dijkstra_distance():
    graph=build_graph(NODES,EDGES)
    a=find_path(graph,'A','D',algorithm='astar',strategy='fastest')
    b=find_path(graph,'A','D',algorithm='dijkstra',strategy='fastest')
    assert a['distance_km']==b['distance_km']==30
    assert a['nodes']==['A','B','C','D']

def test_strategy_respects_risk_and_path_state():
    graph=build_graph(NODES,EDGES)
    safest=find_path(graph,'A','C',strategy='safest')
    assert safest['nodes']==['A','C']  # safer direct alternative beats lower distance
    closed=[{**e,'status':'closed'} if e['id']=='ac' else e for e in EDGES]
    assert find_path(build_graph(NODES,closed),'A','C',strategy='safest')['nodes']==['A','B','C']
    no_path=[{**e,'status':'closed'} if e['id'] in ('ac','bc') else e for e in EDGES]
    assert find_path(build_graph(NODES,no_path),'A','C') is None

def test_assignment_respects_capacity_and_endurance():
    plan=generate_plan(NODES,EDGES,V,T,S)
    assert plan['summary']['assigned_count']==1
    assert plan['assignments'][0]['path_nodes']==['A','B','C','D']
    overloaded=[{**T[0],'weight_kg':999}]
    assert generate_plan(NODES,EDGES,V,overloaded,S)['summary']['unassigned_count']==1
    tiny=[{**V[0],'range_km':12}]
    assert generate_plan(NODES,EDGES,tiny,T,S)['summary']['unassigned_count']==1

def test_weather_grounding_and_drone_restriction():
    drone=[{**V[0],'category':'drone'}]
    storm={**S,'weather':'wind','wind_kmh':70}
    assert generate_plan(NODES,EDGES,drone,T,storm)['summary']['assigned_count']==0
    assert generate_plan(NODES,EDGES,V,T,storm)['summary']['assigned_count']==1

def test_repeatability_and_sample_limits():
    p=generate_plan(NODES,EDGES,V,T,S)
    n1=simulate(p,S,V,NODES,EDGES,seed=42,iterations=25)
    n2=simulate(p,S,V,NODES,EDGES,seed=42,iterations=25)
    n3=simulate(p,S,V,NODES,EDGES,seed=13,iterations=25)
    assert n1 == n2
    assert n1['samples'] != n3['samples']
    assert len(n1['samples'])==25
    assert len(n1['events'])>0
    assert 0 <= n1['metrics']['score'] <= 100
    assert 0 <= n1['metrics']['success_pct'] <= 100

def test_offline_infrastructure_excluded():
    nodes=[{**n,'status':'offline'} if n['id']=='C' else n for n in NODES]
    assert find_path(build_graph(nodes,EDGES),'A','D') is None
