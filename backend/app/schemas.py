"""Public API contracts, validation and serialization."""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator

class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class NodeIn(BaseModel):
    id: str = Field(min_length=2, max_length=40, pattern=r'^[A-Za-z0-9_-]+$')
    name: str = Field(min_length=2, max_length=80)
    category: Literal['hub','depot','critical','delivery','command']
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    health: int = Field(default=100, ge=0, le=100)

class NodePatch(BaseModel):
    status: Literal['online','offline'] | None = None
    health: int | None = Field(default=None, ge=0, le=100)

class EdgeIn(BaseModel):
    source: str
    target: str
    distance_km: float = Field(gt=0, le=10000)
    risk: float = Field(default=0.05, ge=0, le=0.95)
    terrain: Literal['urban','coastal','mountain','rural'] = 'urban'
    @model_validator(mode='after')
    def no_loop(self):
        if self.source == self.target:
            raise ValueError('边不能指向自身')
        return self

class VehicleIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=2, max_length=80)
    category: Literal['ugv','drone']
    capacity_kg: float = Field(gt=0, le=100000)
    speed_kmh: float = Field(gt=0, le=350)
    range_km: float = Field(gt=0, le=5000)
    reliability: float = Field(ge=0, le=1)
    home_node: str

class NodeOut(ORMModel):
    id: str
    name: str
    category: str
    x: float
    y: float
    health: int
    status: str

class EdgeOut(ORMModel):
    id: str
    source: str
    target: str
    distance_km: float
    risk: float
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
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default='', max_length=2000)
    weather: Literal['clear','rain','wind','fog'] = 'clear'
    wind_kmh: float = Field(default=5, ge=0, le=150)
    visibility_km: float = Field(default=12, ge=0.1, le=60)

class ScenarioPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    weather: Literal['clear','rain','wind','fog'] | None = None
    wind_kmh: float | None = Field(default=None, ge=0, le=150)
    visibility_km: float | None = Field(default=None, ge=0.1, le=60)

class ScenarioOut(ORMModel):
    id: str
    name: str
    description: str
    weather: str
    wind_kmh: float
    visibility_km: float
    status: str
    created_at: datetime

class TaskIn(BaseModel):
    cargo: str = Field(min_length=2, max_length=90)
    weight_kg: float = Field(gt=0, le=5000)
    origin: str
    destination: str
    deadline_min: float = Field(gt=0, le=1440)
    priority: int = Field(default=2, ge=1, le=3)
    @model_validator(mode='after')
    def different_nodes(self):
        if self.origin == self.destination:
            raise ValueError('起点与终点不能相同')
        return self

class TaskOut(ORMModel):
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
    created_at: datetime

class EdgeStatusIn(BaseModel):
    status: Literal['open', 'restricted', 'closed']

class LoginIn(BaseModel):
    username: str
    password: str
