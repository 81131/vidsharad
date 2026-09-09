# vidsharad 🎬

A self-hosted web application for converting, resizing, compressing, and re-encoding videos — all through a clean browser UI. Built with **FastAPI + FFmpeg** on the backend and **React (Vite)** on the frontend, served via **nginx**, and containerized end-to-end with **Docker Compose**.

> ⚠️ **This is an MVP prototype.** The job store is in-memory and will not survive backend container restarts. For production workloads, configure a Redis backend.

---

## Features

| Capability | Details |
|---|---|
| **Format conversion** | MP4 (H.264), MKV (H.264), WebM (VP9) |
| **Resolution scaling** | 1080p, 720p, 480p, or keep original |
| **Frame rate adjustment** | 24, 30, 60 fps, or keep original |
| **CRF compression** | Quality slider (CRF 18–32). Lower = higher quality, larger file |
| **Drag-and-drop upload** | Drop a video file directly onto the UI |
| **Async processing** | Jobs run in the background; the UI polls for status every 2 s |
| **Direct download** | Download the converted file straight from the browser |

---

## Architecture

```
Browser
  │
  ▼
nginx (port 80)
  ├── /          → React SPA (static files)
  └── /api/      → proxy → FastAPI (port 8000)
                              │
                              ├── POST /upload      — save file, queue job
                              ├── GET  /status/{id} — poll job state
                              └── GET  /download/{id} — stream result
                                          │
                                          ▼
                                    FFmpeg (CPU)
                                    /app/storage/
                                      ├── uploads/
                                      └── processed/
```

- **Backend:** Python 3.11, FastAPI, uvicorn, ffmpeg-python
- **Frontend:** React 18, TypeScript, Vite
- **Reverse proxy:** nginx (alpine)
- **Persistence:** Docker named volume (`video_storage`) — survives container restarts

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| [Docker](https://docs.docker.com/get-docker/) | 24.x |
| [Docker Compose](https://docs.docker.com/compose/install/) | V2 (bundled with Docker Desktop) |
| Git | any |

> No Python, Node.js, or FFmpeg installation is needed on the host — everything runs inside Docker.

---

## Quick Start

```bash
# 1. Clone the repository
git clone git@github.com:81131/vidsharad.git
cd vidsharad

# 2. Build images and start all services
docker compose up --build

# 3. Open the app
#    http://localhost
```

On the first run, Docker will:
1. Pull `python:3.11-slim` and install FFmpeg via apt
2. Pull `node:20-alpine`, install npm dependencies, and build the React app
3. Pull `nginx:alpine` and serve the built frontend

Subsequent starts (without `--build`) are near-instant.

---

## Usage

1. **Open** [http://localhost](http://localhost) in your browser
2. **Drop** a video file onto the upload area (or click to browse)
3. **Choose** your output format, resolution, frame rate, and quality
4. **Click** Convert Video
5. Wait for the spinner to turn green — then **Download** your file

### Converting via the API directly

```bash
# Upload and start a conversion job
curl -X POST http://localhost/api/upload \
  -F "file=@/path/to/video.mp4" \
  -F "output_format=webm" \
  -F "resolution=1280x720" \
  -F "framerate=30" \
  -F "crf=28"

# Response: { "job_id": "abc-123", "status": "queued" }

# Poll status
curl http://localhost/api/status/abc-123

# Download when status == "completed"
curl -OJ http://localhost/api/download/abc-123
```

---

## Configuration

All environment variables are set in `docker-compose.yml`.

| Variable | Default | Description |
|---|---|---|
| `ENV` | `production` | Runtime environment label |

Storage paths inside the container (mounted via Docker volume):

| Path | Purpose |
|---|---|
| `/app/storage/uploads/` | Raw uploaded files |
| `/app/storage/processed/` | Converted output files |

To change the host port (e.g. if port 80 is taken):

```yaml
# docker-compose.yml
services:
  frontend:
    ports:
      - "8080:80"   # change 8080 to any free port
```

---

## Development Setup (without Docker)

### Backend

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# FFmpeg must be installed on your system
# Ubuntu/Debian:  sudo apt install ffmpeg
# macOS:          brew install ffmpeg
# Fedora:         sudo dnf install ffmpeg

# Create storage directories
mkdir -p /app/storage/uploads /app/storage/processed

# Start the dev server (auto-reload on code changes)
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

npm install
npm run dev   # Vite dev server at http://localhost:5173
```

> During local dev, the React app talks directly to `http://localhost:8000` (not via nginx).
> Update `API_BASE` in `src/api/videoApi.ts` from `/api` to `http://localhost:8000` temporarily.

---

## Stopping & Cleanup

```bash
# Stop containers (data is preserved in the Docker volume)
docker compose down

# Stop AND delete all stored video files
docker compose down -v
```

---

## GPU Integration

Vidsharad supports **hardware-accelerated GPU encoding** for H.264 outputs to drastically improve conversion speeds, especially for large files or high resolutions.

At startup, the backend probes FFmpeg to automatically detect available hardware encoders and runs a quick 1-frame test to ensure the host drivers are properly loaded and functional. 

The fallback chain is:
1. **NVIDIA** (`h264_nvenc`) — *highest priority*
2. **Intel Quick Sync** (`h264_qsv`)
3. **AMD AMF** (`h264_amf`)
4. **CPU Fallback** (`libx264`) — *used automatically if no GPU is found*

> **Note:** WebM outputs (VP9) will always use the CPU (`libvpx-vp9`), as VP9 GPU encoding is not uniformly supported across hardware families.

### Requirements for NVIDIA GPUs

To use an NVIDIA GPU, you must have the **NVIDIA Container Toolkit** installed on your Docker host.

1. Install the toolkit for your OS (e.g. `nvidia-container-toolkit`).
2. Configure the Docker daemon to use the `nvidia` runtime:
   ```bash
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```
3. Start the containers. The `docker-compose.yml` is already configured to pass all GPUs to the backend container.

You can verify GPU detection in the UI (it will show a green "GPU" status indicator at the top of the card) or by querying the API:
```bash
curl -s http://localhost/api/system
# {"gpu_available":true,"encoder":"h264_nvenc"}
```

---

## Project Structure

```
vidsharad/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI routes
│   │   ├── ffmpeg_builder.py  # Pure FFmpeg stream graph construction
│   │   ├── ffmpeg_utils.py    # Job orchestration & FFmpeg execution
│   │   ├── job_manager.py     # In-memory job store
│   │   └── models.py          # Pydantic models
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/videoApi.ts    # HTTP client
│   │   ├── components/
│   │   │   └── UploadForm.tsx
│   │   ├── types/job.ts       # Shared TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── nginx.conf             # nginx config (SPA routing + API proxy)
│   └── Dockerfile
└── docker-compose.yml
```

---

## Known Limitations (MVP)

- **In-memory job store** — jobs are lost on backend restart. Swap `job_manager.py` for Redis when scaling beyond a single worker.
- **No authentication** — the API is open. Add an API key or OAuth before exposing to the internet.
- **No file size limit enforcement on the backend** — currently only enforced at the nginx layer (500 MB).
- **Single worker** — uvicorn runs with one process. Use `--workers N` or Gunicorn for concurrency.

---

## License

MIT
