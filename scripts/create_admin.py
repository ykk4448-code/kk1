"""Create/update the production admin account from interactive prompts."""
from getpass import getpass
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from sqlalchemy import select
from app.database import Base, engine, SessionLocal
from app.models import User
from app.security import hash_password

if __name__ == '__main__':
    Base.metadata.create_all(bind=engine)
    username=input('管理员用户名：').strip()
    password=getpass('密码（至少12字符）：')
    confirmation=getpass('再次确认：')
    if not (2<=len(username)<=64) or len(password)<12 or password!=confirmation:
        raise SystemExit('用户名/密码长度不合规或两次密码不一致')
    with SessionLocal() as db:
        user=db.scalar(select(User).where(User.username==username))
        if user:
            user.password_hash=hash_password(password);user.role='admin'
        else:
            db.add(User(username=username,password_hash=hash_password(password),role='admin'))
        db.commit()
    print('管理员账户已创建或更新。')
