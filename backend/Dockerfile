# --- Base image ---
# nvidia/cuda provides the CUDA 12 runtime needed for NVENC hardware encoding.
# The app auto-detects the GPU at startup and falls back to CPU (libx264) if
# no GPU is present, so this image works on machines with or without NVIDIA GPUs.
FROM nvidia/cuda:12.3.2-runtime-ubuntu22.04

# --- Prevent interactive prompts during apt installs ---
ENV DEBIAN_FRONTEND=noninteractive

# --- Tell the NVIDIA container runtime which GPU capabilities to expose ---
# "video" enables NVENC/NVDEC; "compute" and "utility" are required by CUDA.
ENV NVIDIA_DRIVER_CAPABILITIES=video,compute,utility
ENV NVIDIA_VISIBLE_DEVICES=all

# --- Install system dependencies ---
# python3.11 + pip are not pre-installed in the CUDA base image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3.11 \
    python3.11-distutils \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Make "python3" and "pip" resolve to 3.11
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1

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
