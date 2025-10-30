FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
ENV CUDA_VISIBLE_DEVICES=""

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libvips openslide-tools && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt && pip install fastapi uvicorn

COPY . .
EXPOSE 5000
HEALTHCHECK CMD curl -fsS http://localhost:5000/health || exit 1
CMD ["uvicorn","app:api","--host","0.0.0.0","--port","5000"]
