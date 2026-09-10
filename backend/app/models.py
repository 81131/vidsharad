from enum import Enum
from typing import Optional
from pydantic import BaseModel


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ConversionParams(BaseModel):
    output_format: str = "mp4"
    framerate: Optional[int] = None
    resolution: Optional[str] = None  # e.g. "1920x1080"
    crf: Optional[int] = 23           # lower = higher quality, larger file
    preset: str = "medium"            # encoding speed/compression trade-off


class VideoInfo(BaseModel):
    """Metadata probed from the uploaded video using ffprobe."""
    codec: Optional[str] = None          # e.g. "h264"
    width: Optional[int] = None          # pixels
    height: Optional[int] = None         # pixels
    fps: Optional[float] = None          # frames per second
    duration_sec: Optional[float] = None # total length in seconds
    bitrate_kbps: Optional[int] = None   # overall bitrate in kbps
    size_bytes: Optional[int] = None     # file size
    format_name: Optional[str] = None    # container format e.g. "mp4"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    error: Optional[str] = None
    output_filename: Optional[str] = None
    progress: Optional[int] = None       # 0-100 during encoding
    video_info: Optional[VideoInfo] = None
