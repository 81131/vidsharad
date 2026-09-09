# --- Base image ---
FROM python:3.11-slim

# --- Install system dependencies (FFmpeg binary itself, not the python wrapper) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# --- Set working directory ---
WORKDIR /app

# --- Install Python dependencies first (better Docker layer caching) ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- Copy application code ---
COPY ./app ./app

# --- Create directories for temp uploads/processed files (mounted as volume in compose) ---
RUN mkdir -p /app/storage/uploads /app/storage/processed /app/storage/temp

# --- Expose the port FastAPI/uvicorn will run on ---
EXPOSE 8000

# --- Run with uvicorn ---
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
