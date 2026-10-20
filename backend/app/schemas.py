"""Public API contracts, validation and serialization for AETHER."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class NodeIn(BaseModel):
    network_id: str = Field(default='civil-airdrop', pattern=r'^[A-Za-z0-9_-]{1,30}$')
    id: str = Field(min_length=2, max_length=40, pattern=r'^[A-Za-z0-9_-]+$')
    name: str = Field(min_length=2, max_length=80)
    category: Literal['hub', 'depot', 'critical', 'delivery', 'command']
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    city_id: str = Field(default='national', pattern=r'^(national|wuhan|shanghai|chengdu|shenzhen)$')
    lon: float | None = Field(default=None, ge=73, le=135)
    lat: float | None = Field(default=None, ge=18, le=54)
    health: int = Field(default=100, ge=0, le=100)


class NodePatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    lon: float | None = Field(default=None, ge=73, le=135)
    lat: float | None = Field(default=None, ge=18, le=54)
    status: Literal['online', 'offline'] | None = None
    health: int | None = Field(default=None, ge=0, le=100)


class EdgeIn(BaseModel):
    source: str
    target: str
    # Historical column name retained for compatibility; civilian values are abstract model units.
    distance_km: float = Field(gt=0, le=10000)
    risk: float = Field(default=0.05, ge=0, le=0.95)
    transport_mode: Literal['road', 'sea', 'airdrop'] = 'airdrop'
    terrain: Literal['urban', 'coastal', 'mountain', 'rural'] = 'coastal'

    @model_validator(mode='after')
    def no_loop(self):
        if self.source == self.target:
            raise ValueError('起点与终点不能相同')
        return self


class VehicleIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=2, max_length=80)
    category: Literal['ugv', 'drone', 'truck', 'ship']
    capacity_kg: float = Field(gt=0, le=100000)
    speed_kmh: float = Field(gt=0, le=350)
    range_km: float = Field(gt=0, le=20000)
    reliability: float = Field(ge=0, le=1)
    home_node: str


class NodeOut(ORMModel):
    network_id: str = 'baseline'
    id: str
    name: str
    category: str
    x: float
    y: float
    city_id: str
    lon: float
    lat: float
    health: int
    status: str


class EdgeOut(ORMModel):
    id: str
    source: str
    target: str
    distance_km: float
    risk: float
    transport_mode: str = 'road'
    terrain: str
    status: str


class VehicleOut(ORMModel):
    id: str
    code: str
    name: str
    category: str
    capacity_kg: float
    speed_kmh: float
    range_km: float
    reliability: float
    home_node: str
    status: str


class ScenarioIn(BaseModel):
    network_id: str = Field(default='civil-airdrop', pattern=r'^[A-Za-z0-9_-]{1,30}$')
    city_id: str = Field(default='national', pattern=r'^(national|wuhan|shanghai|chengdu|shenzhen)$')
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default='', max_length=2000)
    weather: Literal['clear', 'rain', 'wind', 'fog'] = 'clear'
    wind_kmh: float = Field(default=8, ge=0, le=60)
    visibility_km: float = Field(default=15, ge=0.1, le=60)


class ScenarioPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    weather: Literal['clear', 'rain', 'wind', 'fog'] | None = None
    wind_kmh: float | None = Field(default=None, ge=0, le=60)
    visibility_km: float | None = Field(default=None, ge=0.1, le=60)


class ScenarioOut(ORMModel):
    network_id: str = 'baseline'
    id: str
    city_id: str
    name: str
    description: str
    weather: str
    wind_kmh: float
    visibility_km: float
    status: str
    created_at: datetime


class FormationUnit(BaseModel):
    vehicle_id: str = Field(min_length=2, max_length=40)
    deploy_node: str = Field(min_length=2, max_length=40)


class MapLayers(BaseModel):
    facilities: bool = True
    links: bool = True
    formations: bool = True
    routes: bool = True
    labels: bool = True
    model_config = ConfigDict(extra='forbid')


class ConfigurationPatch(BaseModel):
    objective: str | None = Field(default=None, max_length=1000)
    units: list[FormationUnit] | None = Field(default=None, max_length=100)
    layers: MapLayers | None = None
    model_config = ConfigDict(extra='forbid')


class TaskIn(BaseModel):
    shipment_id: str = Field(default='', max_length=40)
    leg_index: int = Field(default=1, ge=1, le=20)
    predecessor_task_id: str = Field(default='', max_length=40)
    handover_min: float = Field(default=0, ge=0, le=1440)
    transport_mode: Literal['road', 'sea', 'airdrop'] = 'airdrop'
    cargo: str = Field(min_length=2, max_length=90)
    weight_kg: float = Field(gt=0, le=5000)
    origin: str
    destination: str
    deadline_min: float = Field(gt=0, le=43200)
    priority: int = Field(default=2, ge=1, le=3)

    @model_validator(mode='after')
    def different_nodes(self):
        if self.origin == self.destination:
            raise ValueError('起点与终点不能相同')
        return self


class TaskPatch(BaseModel):
    cargo: str | None = Field(default=None, min_length=2, max_length=90)
    weight_kg: float | None = Field(default=None, gt=0, le=5000)
    deadline_min: float | None = Field(default=None, gt=0, le=43200)
    priority: int | None = Field(default=None, ge=1, le=3)


class TaskOut(ORMModel):
    shipment_id: str = ''
    leg_index: int = 1
    predecessor_task_id: str = ''
    handover_min: float = 0
    transport_mode: str = 'road'
    id: str
    scenario_id: str
    code: str
    cargo: str
    weight_kg: float
    origin: str
    destination: str
    deadline_min: float
    priority: int


class PlanIn(BaseModel):
    scenario_id: str
    strategy: Literal['balanced', 'fastest', 'safest'] = 'balanced'
    algorithm: Literal['astar', 'dijkstra'] = 'astar'


class PlanOut(ORMModel):
    id: str
    scenario_id: str
    name: str
    strategy: str
    algorithm: str
    assignment_data: list
    summary_data: dict
    snapshot_data: dict
    created_at: datetime


class RunIn(BaseModel):
    plan_id: str
    seed: int = Field(default=2026, ge=0, le=2147483647)
    iterations: int = Field(default=60, ge=1, le=500)


class RunOut(ORMModel):
    id: str
    plan_id: str
    scenario_id: str
    seed: int
    iterations: int
    metrics: dict
    events: list
    samples: list
    experiment_data: dict = Field(default_factory=dict)
    created_at: datetime


class AirdropExperimentParameters(BaseModel):
    fleet_profile: Literal['compact', 'standard', 'reinforced'] = 'standard'
    """Coarse synthetic inputs; not flight-performance or safety predictions."""
    weather: Literal['clear', 'rain', 'wind', 'fog'] = 'clear'
    wind_kmh: float = Field(default=8, ge=0, le=60)
    rain: Literal['none', 'light', 'moderate'] = 'none'
    cloud_base: Literal['high', 'medium', 'low'] = 'high'
    sea_state: Literal['calm', 'moderate', 'rough'] = 'calm'
    payload_profile: Literal['light', 'standard', 'medical'] = 'standard'
    altitude_profile: Literal['conservative', 'standard', 'high'] = 'standard'
    battery_reserve_pct: Literal[20, 30, 40] = 30


class ExperimentIn(BaseModel):
    scenario_id: str = Field(min_length=2, max_length=40)
    name: str = Field(default='应急空投实验', min_length=2, max_length=120)
    notes: str = Field(default='', max_length=2000)
    strategy: Literal['balanced', 'fastest', 'safest'] = 'balanced'
    algorithm: Literal['astar', 'dijkstra'] = 'astar'
    seed: int = Field(default=2026, ge=0, le=2147483647)
    iterations: int = Field(default=80, ge=1, le=500)
    parameters: AirdropExperimentParameters = Field(default_factory=AirdropExperimentParameters)


class ExperimentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)


class ExperimentOut(ORMModel):
    id: str
    scenario_id: str
    plan_id: str
    run_id: str
    name: str
    notes: str
    parameters: dict
    results: dict
    model_version: str
    created_by: str
    created_at: datetime


class EdgeStatusIn(BaseModel):
    status: Literal['open', 'restricted', 'closed'] | None = None
    distance_km: float | None = Field(default=None, gt=0, le=10000)
    risk: float | None = Field(default=None, ge=0, le=0.95)


class LoginIn(BaseModel):
    username: str
    password: str
