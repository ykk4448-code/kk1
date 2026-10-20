"""Small additive SQLite compatibility upgrade for persistent v1 deployments.

Never destroys historical data. Independent geographic and regional profiles are
seeded additively; historical XY snapshots retain their original coordinates.
"""
from sqlalchemy import text
from .database import engine

ADD_COLUMNS={
    'edges':{'transport_mode':"VARCHAR(16) NOT NULL DEFAULT 'road'"},
    'delivery_tasks':{'shipment_id':"VARCHAR(40) NOT NULL DEFAULT ''",'leg_index':'INTEGER NOT NULL DEFAULT 1','predecessor_task_id':"VARCHAR(40) NOT NULL DEFAULT ''",'handover_min':'FLOAT NOT NULL DEFAULT 0','transport_mode':"VARCHAR(16) NOT NULL DEFAULT 'road'"},
    'nodes': {'city_id': "VARCHAR(30) NOT NULL DEFAULT 'wuhan'", 'lon': 'FLOAT NOT NULL DEFAULT 114.3', 'lat': 'FLOAT NOT NULL DEFAULT 30.58', 'network_id': "VARCHAR(30) NOT NULL DEFAULT 'baseline'"},
    'scenarios': {'city_id': "VARCHAR(30) NOT NULL DEFAULT 'wuhan'", 'configuration_data': "JSON NOT NULL DEFAULT '{}'", 'network_id': "VARCHAR(30) NOT NULL DEFAULT 'baseline'"},
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
