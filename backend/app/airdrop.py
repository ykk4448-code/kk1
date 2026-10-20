"""Transparent coarse factors for synthetic civilian emergency-aid experiments.

These are educational model assumptions, not flight-performance forecasts or
navigation/safety advice. Distances in the civil-airdrop demo are abstract units.
"""
EXPERIMENT_MODEL_VERSION = 'civil-airdrop-sim-v1'

DEFAULT_PARAMETERS = {
    'weather': 'clear',
    'wind_kmh': 8.0,
    'rain': 'none',
    'cloud_base': 'high',
    'sea_state': 'calm',
    'payload_profile': 'standard',
    'altitude_profile': 'standard',
    'battery_reserve_pct': 30,
}

def normalize_parameters(raw=None):
    params = {**DEFAULT_PARAMETERS, **(raw or {})}
    cloud_visibility = {'high': 15.0, 'medium': 8.0, 'low': 3.0}
    params['visibility_km'] = min(cloud_visibility[params['cloud_base']], 2.0) if params['weather'] == 'fog' else cloud_visibility[params['cloud_base']]
    return params

def environmental_factors(raw=None):
    """Return documented, deliberately coarse multipliers used by planner and simulator."""
    p = normalize_parameters(raw)
    weather = {
        'clear': (1.0, 1.0, 1.0, 1.0),
        'rain': (1.12, 1.16, 0.93, 1.18),
        'wind': (1.08, 1.18, 0.90, 1.22),
        'fog': (1.10, 1.12, 0.96, 1.14),
    }[p['weather']]
    wind = max(0.65, 1.0 - p['wind_kmh'] / 180.0)
    wind_duration = 1.0 + p['wind_kmh'] / 120.0
    rain = {
        'none': (1.0, 1.0, 1.0, 1.0),
        'light': (1.04, 1.07, 0.97, 1.10),
        'moderate': (1.10, 1.18, 0.90, 1.22),
    }[p['rain']]
    cloud = {
        'high': (1.0, 1.0, 1.0, 1.0),
        'medium': (1.02, 1.04, 0.98, 1.06),
        'low': (1.07, 1.14, 0.94, 1.16),
    }[p['cloud_base']]
    sea = {
        'calm': (1.0, 1.0, 1.0, 1.0),
        'moderate': (1.01, 1.05, 0.98, 1.07),
        'rough': (1.03, 1.12, 0.95, 1.16),
    }[p['sea_state']]
    payload = {
        'light': (0.97, 0.97, 1.0, 0.98),
        'standard': (1.0, 1.0, 1.0, 1.0),
        'medical': (1.06, 1.05, 0.97, 1.06),
    }[p['payload_profile']]
    altitude = {
        'conservative': (1.08, 0.96, 0.99, 0.98),
        'standard': (1.0, 1.0, 1.0, 1.0),
        'high': (1.03, 1.08, 0.91, 1.10),
    }[p['altitude_profile']]
    groups = [weather, rain, cloud, sea, payload, altitude]
    return {
        'duration_factor': round(wind_duration * __import__('math').prod(x[0] for x in groups), 4),
        'risk_factor': round((1.0 + p['wind_kmh'] / 100.0) * __import__('math').prod(x[1] for x in groups), 4),
        'range_factor': round(wind * __import__('math').prod(x[2] for x in groups), 4),
        'stress_factor': round((1.0 + p['wind_kmh'] / 100.0) * __import__('math').prod(x[3] for x in groups), 4),
    }

def parameter_summary(raw=None):
    p = normalize_parameters(raw)
    return {
        'weather': p['weather'],
        'wind_kmh': p['wind_kmh'],
        'rain': p['rain'],
        'cloud_base': p['cloud_base'],
        'visibility_km': p['visibility_km'],
        'sea_state': p['sea_state'],
        'payload_profile': p['payload_profile'],
        'altitude_profile': p['altitude_profile'],
        'battery_reserve_pct': p['battery_reserve_pct'],
        'model_version': EXPERIMENT_MODEL_VERSION,
        'model_factors': environmental_factors(p),
        'disclaimer': '合成民用应急仿真；距离为抽象模型单位，所有环境因子为教学假设，不代表实际航线、飞行性能或安全认证。',
    }
