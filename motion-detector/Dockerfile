# 1. Start from the Python 3.10 slim image
FROM python:3.10-slim

# Install system dependencies for OpenCV AND FFMPEG
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Add non-root user (Debian syntax) ---
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup --no-create-home appuser

# --- Create the recordings directory AND set permissions ---
RUN mkdir -p /recordings && chown -R appuser:appgroup /recordings

# Copy and install requirements
COPY --chown=appuser:appgroup ./requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy the application code
COPY --chown=appuser:appgroup . .
# --- Switch to the non-root user ---
USER appuser

# --- REVERTED to the original command ---
CMD ["python", "-u", "detector.py"]