"""Signed HMAC tokens and PBKDF2 credentials without external auth services."""
import base64
import hashlib
import hmac
import json
import secrets
import time
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from .config import SECRET_KEY, DEMO_MODE
from .models import User

bearer = HTTPBearer(auto_error=False)

def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 310000)
    return f'pbkdf2_sha256$310000${salt.hex()}${digest.hex()}'

def verify_password(password: str, saved: str) -> bool:
    try:
        algo, iters, salt, digest = saved.split('$')
        if algo != 'pbkdf2_sha256': return False
        test = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iters))
        return hmac.compare_digest(test, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False

def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')

def sign_token(user: User, expire_seconds=28800) -> str:
    head = b64(b'{"alg":"HS256","typ":"JWT"}')
    body = b64(json.dumps({'sub': user.username,'role':user.role,'exp':int(time.time())+expire_seconds},separators=(',',':')).encode())
    sig = b64(hmac.new(SECRET_KEY.encode(), f'{head}.{body}'.encode(), hashlib.sha256).digest())
    return f'{head}.{body}.{sig}'

def decode_token(token: str) -> dict:
    try:
        head, body, sig = token.split('.')
        expected = b64(hmac.new(SECRET_KEY.encode(), f'{head}.{body}'.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected): raise ValueError()
        payload = json.loads(base64.urlsafe_b64decode(body + '='*(-len(body)%4)))
        if payload['exp'] < time.time(): raise ValueError()
        return payload
    except (ValueError, KeyError, TypeError, UnicodeDecodeError):
        raise HTTPException(status_code=401, detail='无效或已过期的凭证')

def current_user(token: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if token is None:
        raise HTTPException(status_code=401, detail='请先登录')
    p = decode_token(token.credentials)
    user = db.scalar(select(User).where(User.username == p['sub']))
    if not user: raise HTTPException(status_code=401, detail='用户不存在')
    return user

def can_edit(user: User = Depends(current_user)) -> User:
    if user.role not in {'admin','planner'}:
        raise HTTPException(status_code=403, detail='需要规划员权限')
    return user

def can_admin(user: User = Depends(current_user)) -> User:
    if user.role != 'admin':
        raise HTTPException(status_code=403, detail='需要管理员权限')
    return user
