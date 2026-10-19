import os
import tempfile
from pathlib import Path
os.environ['DEMO_MODE'] = 'true'
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(tempfile.gettempdir()) / 'aether_test_suite.sqlite3')
import pytest
from fastapi.testclient import TestClient
from app.database import engine, Base
from app.main import app

@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    with TestClient(app) as c:
        yield c

@pytest.fixture()
def admin_headers(client):
    result=client.post('/api/v1/auth/login',json={'username':'admin','password':'demo123456'})
    assert result.status_code==200
    return {'Authorization':'Bearer '+result.json()['access_token']}

@pytest.fixture()
def viewer_headers(client):
    result=client.post('/api/v1/auth/login',json={'username':'analyst','password':'demo123456'})
    assert result.status_code==200
    return {'Authorization':'Bearer '+result.json()['access_token']}
