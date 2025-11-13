# 1. Start from the Python 3.10 slim image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /code

# --- Add non-root user (Debian syntax) ---
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup --no-create-home appuser

# This creates the mount point *before* we switch users
# and gives our 'appuser' ownership of it.
RUN mkdir /recordings && chown appuser:appgroup /recordings

# Copy the requirements file and install dependencies
COPY --chown=appuser:appgroup ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the rest of the backend application code
COPY --chown=appuser:appgroup . /code

# --- Switch to the non-root user ---
USER appuser

# Run the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]