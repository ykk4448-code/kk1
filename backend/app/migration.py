"""Small additive SQLite compatibility upgrade for persistent v1 deployments.

Never destroys historical user data. Old example coordinates are not accurate city
geolocations; to get the new multi-city demo dataset, start with a NEW demo volume.
"""
from sqlalchemy import text
from .database import engine

ADD_COLUMNS={
    'nodes': {'city_id': "VARCHAR(30) NOT NULL DEFAULT 'wuhan'", 'lon': 'FLOAT NOT NULL DEFAULT 114.3', 'lat': 'FLOAT NOT NULL DEFAULT 30.58'},
    'scenarios': {'city_id': "VARCHAR(30) NOT NULL DEFAULT 'wuhan'", 'configuration_data': "JSON NOT NULL DEFAULT '{}'"},
}

def upgrade_schema():
    if engine.dialect.name!='sqlite':
        return
    with engine.begin() as conn:
        tables={row[0] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        for table,columns in ADD_COLUMNS.items():
            if table not in tables:continue
            existing={row[1] for row in conn.execute(text(f'PRAGMA table_info({table})'))}
            for column,sqltype in columns.items():
                if column not in existing:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {sqltype}'))
