FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt && \
    groupadd --system aether && useradd --system --gid aether --home /app aether
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/
RUN mkdir -p /app/data && chown -R aether:aether /app
USER aether
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
