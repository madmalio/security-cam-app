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

# --- FIX: Set fixed UID/GID (1000) ---
RUN addgroup --system --gid 1000 appgroup && \
    adduser --system --uid 1000 --ingroup appgroup --no-create-home appuser

# --- Create directories ---
RUN mkdir -p /recordings
RUN mkdir -p /var/log/motion/
RUN mkdir -p /app/motion_confs

# Copy and install requirements (as root)
COPY ./requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy the application code (as root)
COPY . .

# --- Make the entrypoint executable ---
RUN chmod +x ./entrypoint.sh

# --- Run the entrypoint script ---
ENTRYPOINT ["./entrypoint.sh"]