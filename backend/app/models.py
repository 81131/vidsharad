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
    crf: Optional[int] = 23  # lower = higher quality, larger file


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    error: Optional[str] = None
    output_filename: Optional[str] = None
