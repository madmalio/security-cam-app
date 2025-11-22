FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# --- THE FIX: Install CPU-only PyTorch explicitly first ---
# This prevents downloading the massive NVIDIA CUDA drivers
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
# ----------------------------------------------------------

# Install the rest (Ultralytics will see torch is already installed and skip the big one)
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "-u", "main.py"]