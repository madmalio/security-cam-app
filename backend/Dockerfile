FROM python:3.10-slim

# Install system dependencies
# Added 'tzdata' for timezone support
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# --- MATCHING VOLUME MOUNT PATH ---
WORKDIR /code

# --- FIX: Set fixed UID/GID (1000) so it matches motion-detector ---
RUN addgroup --system --gid 1000 appgroup && \
    adduser --system --uid 1000 --ingroup appgroup --no-create-home appuser

# Create recordings dir and set permission
RUN mkdir -p /recordings && chown -R appuser:appgroup /recordings

COPY --chown=appuser:appgroup ./requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY --chown=appuser:appgroup . .

USER appuser

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]