"""Persistent domain model. Spatial data uses an intentionally abstract graph."""
from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def utcnow():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16), default='viewer')

class Node(Base):
    __tablename__ = 'nodes'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(32))
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)
    city_id: Mapped[str] = mapped_column(String(30), default="wuhan", index=True)
    lon: Mapped[float] = mapped_column(Float, default=114.30)
    lat: Mapped[float] = mapped_column(Float, default=30.58)
    health: Mapped[int] = mapped_column(Integer, default=100)
    status: Mapped[str] = mapped_column(String(16), default='online')

class Edge(Base):
    __tablename__ = 'edges'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    source: Mapped[str] = mapped_column(ForeignKey('nodes.id'))
    target: Mapped[str] = mapped_column(ForeignKey('nodes.id'))
    distance_km: Mapped[float] = mapped_column(Float)
    risk: Mapped[float] = mapped_column(Float, default=0.05)
    terrain: Mapped[str] = mapped_column(String(32), default='urban')
    status: Mapped[str] = mapped_column(String(20), default='open')

class Vehicle(Base):
    __tablename__ = 'vehicles'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(30))
    capacity_kg: Mapped[float] = mapped_column(Float)
    speed_kmh: Mapped[float] = mapped_column(Float)
    range_km: Mapped[float] = mapped_column(Float)
    reliability: Mapped[float] = mapped_column(Float)
    home_node: Mapped[str] = mapped_column(ForeignKey('nodes.id'))
    status: Mapped[str] = mapped_column(String(16), default='available')

class Scenario(Base):
    __tablename__ = 'scenarios'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    city_id: Mapped[str] = mapped_column(String(30), default="wuhan", index=True)
    description: Mapped[str] = mapped_column(Text, default='')
    weather: Mapped[str] = mapped_column(String(16), default='clear')
    wind_kmh: Mapped[float] = mapped_column(Float, default=5)
    visibility_km: Mapped[float] = mapped_column(Float, default=12)
    status: Mapped[str] = mapped_column(String(20), default='ready')
    configuration_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    tasks: Mapped[list['DeliveryTask']] = relationship(back_populates='scenario', cascade='all, delete-orphan')

class DeliveryTask(Base):
    __tablename__ = 'delivery_tasks'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey('scenarios.id', ondelete='CASCADE'), index=True)
    code: Mapped[str] = mapped_column(String(32))
    cargo: Mapped[str] = mapped_column(String(90))
    weight_kg: Mapped[float] = mapped_column(Float)
    origin: Mapped[str] = mapped_column(ForeignKey('nodes.id'))
    destination: Mapped[str] = mapped_column(ForeignKey('nodes.id'))
    deadline_min: Mapped[float] = mapped_column(Float)
    priority: Mapped[int] = mapped_column(Integer, default=2)
    scenario: Mapped[Scenario] = relationship(back_populates='tasks')

class Plan(Base):
    __tablename__ = 'plans'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey('scenarios.id', ondelete='CASCADE'), index=True)
    name: Mapped[str] = mapped_column(String(100))
    strategy: Mapped[str] = mapped_column(String(24))
    algorithm: Mapped[str] = mapped_column(String(24))
    assignment_data: Mapped[list] = mapped_column(JSON)
    summary_data: Mapped[dict] = mapped_column(JSON)
    snapshot_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class SimulationRun(Base):
    __tablename__ = 'simulation_runs'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey('plans.id', ondelete='CASCADE'), index=True)
    scenario_id: Mapped[str] = mapped_column(ForeignKey('scenarios.id', ondelete='CASCADE'), index=True)
    seed: Mapped[int] = mapped_column(Integer)
    iterations: Mapped[int] = mapped_column(Integer)
    metrics: Mapped[dict] = mapped_column(JSON)
    events: Mapped[list] = mapped_column(JSON)
    samples: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(80))
    subject: Mapped[str] = mapped_column(String(128))
    details: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
