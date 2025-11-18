# 1. Start from the Python 3.10 slim image
FROM python:3.10-slim

# Install system dependencies for FFMPEG, motion, and gosu
RUN apt-get update && apt-get install -y \
    ffmpeg \
    motion \
    curl \
    gosu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Add non-root user (Debian syntax) ---
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup --no-create-home appuser

# --- Create directories (ownership will be fixed by entrypoint) ---
RUN mkdir -p /recordings
RUN mkdir -p /var/log/motion/
RUN mkdir -p /app/motion_confs

# Copy and install requirements (as root)
COPY ./requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy the application code (as root)
COPY . .

# --- Make the new entrypoint executable ---
RUN chmod +x ./entrypoint.sh

# --- DO NOT 'USER appuser' HERE ---
# We need the entrypoint to run as root to chown the volumes

# --- Run the entrypoint script ---
ENTRYPOINT ["./entrypoint.sh"]