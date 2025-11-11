# 1. Start from the Python 3.10 slim image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /code

# Copy the requirements file and install dependencies
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# --- ADD THIS LINE ---
# Install ffmpeg (which includes ffprobe)
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy the rest of the backend application code
COPY . /code

# Run the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]