import os
import uuid
import shutil
from typing import Optional

import ffmpeg
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.models import ConversionParams, JobResponse, JobStatus, VideoInfo
from app.job_manager import create_job, get_job, update_job
from app.ffmpeg_utils import convert_video
from app.gpu_detect import detect_best_h264_encoder

app = FastAPI(title="Video Manager API")

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

# Runs once at startup, cached for all requests
H264_ENCODER, H264_EXTRA_KWARGS = detect_best_h264_encoder()


def _probe_video(path: str) -> Optional[VideoInfo]:
    """
    Run ffprobe on a saved video file and return structured metadata.
    Returns None silently if the file can't be probed — the conversion
    can still proceed, we just won't have stats to show.
    """
    try:
        info = ffmpeg.probe(path)
        fmt = info.get("format", {})

        # Find the first video stream (files can have multiple audio/video streams)
        video_stream = next(
            (s for s in info.get("streams", []) if s.get("codec_type") == "video"),
            None,
        )

        fps: Optional[float] = None
        if video_stream:
            r = video_stream.get("r_frame_rate", "0/1")
            num, den = r.split("/")
            fps = round(int(num) / int(den), 2) if int(den) > 0 else None

        raw_bitrate = int(fmt.get("bit_rate", 0))
        raw_duration = float(fmt.get("duration", 0))

        return VideoInfo(
            codec=video_stream.get("codec_name") if video_stream else None,
            width=video_stream.get("width") if video_stream else None,
            height=video_stream.get("height") if video_stream else None,
            fps=fps,
            duration_sec=round(raw_duration, 2),
            bitrate_kbps=raw_bitrate // 1000 if raw_bitrate else None,
            size_bytes=int(fmt.get("size", 0)) or None,
            format_name=fmt.get("format_name", "").split(",")[0] or None,
        )
    except Exception:
        return None


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/system")
def system_info():
    """Returns GPU availability and which encoder was selected at startup."""
    return {
        "gpu_available": H264_ENCODER != "libx264",
        "encoder": H264_ENCODER,
    }


@app.post("/upload", response_model=JobResponse)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    output_format: str = Form("mp4"),
    framerate: Optional[int] = Form(None),
    resolution: Optional[str] = Form(None),
    crf: Optional[int] = Form(23),
    preset: str = Form("medium"),
    audio_bitrate: Optional[int] = Form(None),
    codec: Optional[str] = Form(None),
):
    job_id = str(uuid.uuid4())

    filename = file.filename or "upload"
    input_ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    input_path = os.path.join(UPLOAD_DIR, f"{job_id}.{input_ext}")

    with open(input_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    output_path = os.path.join(PROCESSED_DIR, f"{job_id}.{output_format}")

    # Probe the saved file for metadata before starting the conversion
    video_info = _probe_video(input_path)

    params = ConversionParams(
        output_format=output_format,
        framerate=framerate,
        resolution=resolution,
        crf=crf,
        preset=preset,
        audio_bitrate=audio_bitrate,
        codec=codec,
    )

    create_job(job_id)

    # Store video_info in the job so status polls can return it too
    if video_info:
        update_job(job_id, video_info=video_info.model_dump())

    background_tasks.add_task(
        convert_video,
        job_id, input_path, output_path, params,
        H264_ENCODER, H264_EXTRA_KWARGS,
    )

    return JobResponse(
        job_id=job_id,
        status=JobStatus.QUEUED,
        video_info=video_info,
    )


@app.get("/status/{job_id}", response_model=JobResponse)
def get_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Reconstruct VideoInfo from the stored dict if present
    raw_info = job.get("video_info")
    video_info = VideoInfo(**raw_info) if raw_info else None

    return JobResponse(
        job_id=job_id,
        status=job["status"],
        error=job.get("error"),
        output_filename=job.get("output_filename"),
        progress=job.get("progress"),
        video_info=video_info,
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
