# 1. Start from the Python 3.10 slim image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /code

# --- Add non-root user (Debian syntax) ---
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup --no-create-home appuser

# Copy the requirements file and install dependencies
# --- 1. Set owner during copy ---
COPY --chown=appuser:appgroup ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the rest of the backend application code
# --- 2. Set owner during copy ---
COPY --chown=appuser:appgroup . /code

# --- 4. Switch to the non-root user ---
USER appuser

# Run the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]