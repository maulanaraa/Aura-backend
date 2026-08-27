FROM python:3.11-slim

# Install system dependencies needed for OpenCV and MediaPipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 appuser
WORKDIR /app

# Copy requirements from parent and local
COPY --chown=appuser:appuser ../ai-pipeline/requirements.txt /app/ai-pipeline/requirements.txt
COPY --chown=appuser:appuser requirements.txt /app/ai-service/requirements.txt

RUN pip install --no-cache-dir -r /app/ai-pipeline/requirements.txt \
    && pip install --no-cache-dir -r /app/ai-service/requirements.txt

COPY --chown=appuser:appuser ../ai-pipeline /app/ai-pipeline
COPY --chown=appuser:appuser . /app/ai-service

USER appuser
ENV HOME=/home/appuser \
    PATH=/home/appuser/.local/bin:$PATH \
    ML_PROJECT_PATH=/app/ai-pipeline \
    MODEL_PATH=/app/ai-pipeline/models/face_landmarker.task \
    PORT=7860

WORKDIR /app/ai-service

EXPOSE 7860 8000

CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT:-7860}"]
