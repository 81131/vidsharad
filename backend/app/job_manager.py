"""
In-memory job store for tracking conversion job status.

NOTE: This is intentionally simple for the MVP. It's a plain Python dict
living in process memory, so it only works with a single backend worker
process, and jobs are lost on restart. When you outgrow this (multiple
workers, need to survive restarts), swap this for Redis - the interface
below (create_job / update_job / get_job) can stay identical, only the
storage backend changes.
"""
from datetime import datetime
from typing import Dict, Optional

from app.models import JobStatus

_jobs: Dict[str, dict] = {}


def create_job(job_id: str) -> None:
    _jobs[job_id] = {
        "status": JobStatus.QUEUED,
        "error": None,
        "output_filename": None,
        "created_at": datetime.utcnow().isoformat(),
    }


def update_job(job_id: str, **fields) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(fields)


def get_job(job_id: str) -> Optional[dict]:
    return _jobs.get(job_id)
