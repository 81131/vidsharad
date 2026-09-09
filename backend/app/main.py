from fileinput import filename
import os
import uuid
import shutil
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.models import ConversionParams, JobResponse, JobStatus
from app.job_manager import create_job, get_job
from app.ffmpeg_utils import convert_video

app = FastAPI(title="Video Manager API")

# CORS: lets your React frontend (a different origin during local dev) call
# this API from the browser. Tighten allow_origins to your real domain once
# you deploy - "*" is fine for local development only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict to your frontend's real origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "/app/storage/uploads"
PROCESSED_DIR = "/app/storage/processed"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/upload", response_model=JobResponse)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    output_format: str = Form("mp4"),
    framerate: Optional[int] = Form(None),
    resolution: Optional[str] = Form(None),
    crf: Optional[int] = Form(23),
):
    job_id = str(uuid.uuid4())

    # Save the uploaded file under a job-specific name so concurrent uploads
    # never collide with each other on disk.
    filename = file.filename or "upload"
    input_ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    input_path = os.path.join(UPLOAD_DIR, f"{job_id}.{input_ext}")

    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    output_path = os.path.join(PROCESSED_DIR, f"{job_id}.{output_format}")

    params = ConversionParams(
        output_format=output_format,
        framerate=framerate,
        resolution=resolution,
        crf=crf,
    )

    create_job(job_id)

    # Key piece: BackgroundTasks tells FastAPI to run convert_video() AFTER
    # this response is sent to the client. The user gets their job_id back
    # immediately instead of the HTTP request hanging open for however long
    # the conversion takes.
    background_tasks.add_task(convert_video, job_id, input_path, output_path, params)

    return JobResponse(job_id=job_id, status=JobStatus.QUEUED)


@app.get("/status/{job_id}", response_model=JobResponse)
def get_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobResponse(
        job_id=job_id,
        status=job["status"],
        error=job.get("error"),
        output_filename=job.get("output_filename"),
    )


@app.get("/download/{job_id}")
def download_video(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != JobStatus.COMPLETED:
        raise HTTPException(status_code=400, detail=f"Job is not ready (status: {job['status']})")

    output_path = os.path.join(PROCESSED_DIR, job["output_filename"])
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail="Output file missing")

    return FileResponse(output_path, filename=job["output_filename"])
