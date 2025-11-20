# motion-detector/Dockerfile

FROM python:3.10-slim

# Install system dependencies
# Added 'tzdata' for timezone support
RUN apt-get update && apt-get install -y \
    ffmpeg \
    motion \
    curl \
    gosu \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create a non-root user with a fixed UID/GID (1000)
# This helps with file permission compatibility on Linux host systems
RUN addgroup --system --gid 1000 appgroup && \
    adduser --system --uid 1000 --ingroup appgroup --no-create-home appuser

# Create necessary directories
RUN mkdir -p /recordings
RUN mkdir -p /var/log/motion/
RUN mkdir -p /app/motion_confs

# Copy requirements and install dependencies
COPY ./requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy the application code
COPY . .

# Make the entrypoint executable
RUN chmod +x ./entrypoint.sh

# Run the entrypoint script
ENTRYPOINT ["./entrypoint.sh"]