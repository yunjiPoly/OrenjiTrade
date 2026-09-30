# OrenjiTrade ML service. Build from apps/ml:  docker build -t orenjitrade-ml .
# Runs as a non-root user; Cloud Run injects PORT.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app

RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --home-dir /app --shell /usr/sbin/nologin app

# Install dependencies first so source changes do not invalidate the pip layer.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

USER app

EXPOSE 8000

# Liveness check without curl/wget: python's urllib against /health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import os, sys, urllib.request; port = os.environ.get('PORT', '8000'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=2).status == 200 else 1)"

# `exec` so uvicorn is PID 1 and receives SIGTERM from the platform.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
