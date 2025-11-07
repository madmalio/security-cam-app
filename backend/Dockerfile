# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Copy the dependencies file and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source code
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Command to run the Uvicorn server (the server that runs FastAPI)
# --host 0.0.0.0 makes it accessible from other Docker containers
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]