"""Curated China city reference locations (approximate WGS84 points, NOT surveyed depot positions).

City map tiles are rendered by the browser via OpenStreetMap. Edges are
synthetic planning graph links, NOT observed routable road centerlines.
"""
from math import radians, cos, asin, sqrt

CITIES = [
    {'id':'wuhan','name':'武汉','province':'湖北','center':[30.583,114.315],'zoom':10,'subtitle':'江城双岸 · 城市应急物资配送','code':'WH'},
    {'id':'shanghai','name':'上海','province':'上海','center':[31.225,121.48],'zoom':10,'subtitle':'长三角枢纽 · 多式协同运力','code':'SH'},
    {'id':'chengdu','name':'成都','province':'四川','center':[30.648,104.067],'zoom':10,'subtitle':'西部核心 · 综合保障网络','code':'CD'},
    {'id':'shenzhen','name':'深圳','province':'广东','center':[22.559,114.05],'zoom':10,'subtitle':'湾区节点 · 高密度快速投送','code':'SZ'},
]
# label, category, latitude, longitude
LANDMARKS = {
'wuhan':[
 ('武汉站','hub',30.610,114.424),('汉口站','hub',30.617,114.257),('武昌站','depot',30.530,114.311),
 ('光谷广场','delivery',30.507,114.399),('武汉大学','critical',30.538,114.365),('武汉天河机场','hub',30.783,114.209),
 ('武汉国际博览中心','depot',30.505,114.249),('武汉体育中心','depot',30.506,114.161),('武汉市民之家','command',30.654,114.319),
 ('江汉路','delivery',30.583,114.292),('东湖区域','critical',30.585,114.389),('武汉东站','hub',30.485,114.452)],
'shanghai':[
 ('虹桥火车站','hub',31.195,121.327),('上海火车站','hub',31.249,121.455),('人民广场','command',31.231,121.473),
 ('陆家嘴','delivery',31.240,121.505),('张江高科','critical',31.205,121.594),('浦东国际机场','hub',31.151,121.805),
 ('上海南站','depot',31.154,121.429),('五角场','delivery',31.300,121.516),('嘉定新城','depot',31.334,121.265)],
'chengdu':[
 ('成都东站','hub',30.633,104.143),('成都南站','depot',30.604,104.068),('天府广场','command',30.657,104.065),
 ('双流国际机场','hub',30.578,103.947),('成都西站','depot',30.668,103.954),('世纪城','delivery',30.556,104.085),
 ('宽窄巷子','critical',30.669,104.049),('春熙路','delivery',30.656,104.080),('金融城','depot',30.592,104.065)],
'shenzhen':[
 ('深圳北站','hub',22.609,114.029),('福田站','hub',22.541,114.064),('深圳湾公园','critical',22.522,113.961),
 ('宝安国际机场','hub',22.639,113.810),('前海湾','depot',22.540,113.902),('市民中心','command',22.544,114.059),
 ('坪山站','delivery',22.700,114.330),('罗湖站','depot',22.533,114.116),('深圳大学','delivery',22.588,113.935)],
}
# Local *synthetic* links, node indices (0 based). No road snapping or navigational guarantee.
LINKS = [(0,1),(0,2),(0,4),(0,8),(0,10),(0,11),(1,2),(1,5),(1,6),(1,8),(1,9),
         (2,3),(2,4),(2,6),(2,9),(3,4),(3,10),(3,11),(4,10),(6,7),(6,9),(8,9),(8,10),(9,10)]

def distance_km(a,b):
    lat1,lon1=a;lat2,lon2=b
    dlat=radians(lat2-lat1);dlon=radians(lon2-lon1)
    h=sin_sq(dlat/2)+cos(radians(lat1))*cos(radians(lat2))*sin_sq(dlon/2)
    return 6371.009*2*asin(min(1,sqrt(h)))

def sin_sq(x):return __import__('math').sin(x)**2
