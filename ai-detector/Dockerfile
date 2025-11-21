FROM python:3.10-slim

# Install system dependencies for OpenCV
# FIX: Replaced 'libgl1-mesa-glx' with 'libgl1'
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

CMD ["python", "-u", "main.py"]