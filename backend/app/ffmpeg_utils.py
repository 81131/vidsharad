"""
Orchestrates a conversion job: builds the ffmpeg command via ffmpeg_builder,
runs it with real-time progress tracking, and updates job status accordingly.

Progress is tracked by reading FFmpeg's stderr output. FFmpeg emits a line like:
  frame=  120 fps= 30 q=28.0 size=  1024kB time=00:00:04.00 bitrate=2048.0kbits/s
We parse the time= field and divide by the video's total duration to get a %.
"""
import re
import subprocess
import ffmpeg

from app.ffmpeg_builder import build_stream
from app.job_manager import update_job
from app.models import JobStatus, ConversionParams


def _get_duration(input_path: str) -> float:
    """Probe the video's total duration in seconds. Returns 0 if probe fails."""
    try:
        info = ffmpeg.probe(input_path)
        return float(info["format"].get("duration", 0))
    except Exception:
        return 0.0


def _run_with_progress(cmd: list[str], job_id: str, total_duration: float) -> None:
    """
    Run the FFmpeg command as a subprocess and stream stderr to parse progress.
    Raises RuntimeError with the last lines of stderr if FFmpeg exits non-zero.
    """
    proc = subprocess.Popen(cmd, stderr=subprocess.PIPE, text=True, bufsize=1)

    # Keep a rolling tail of stderr lines for error reporting if the job fails
    stderr_tail: list[str] = []

    for line in proc.stderr:  # type: ignore[union-attr]
        stderr_tail.append(line)
        if len(stderr_tail) > 40:
            stderr_tail.pop(0)

        # FFmpeg reports progress via "time=HH:MM:SS.ss" in stderr
        match = re.search(r"time=(\d+):(\d+):([\d.]+)", line)
        if match and total_duration > 0:
            h, m, s = match.groups()
            elapsed = int(h) * 3600 + int(m) * 60 + float(s)
            pct = min(int(elapsed / total_duration * 100), 99)
            update_job(job_id, progress=pct)

    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError("FFmpeg error:\n" + "".join(stderr_tail[-20:]))


def convert_video(
    job_id: str,
    input_path: str,
    output_path: str,
    params: ConversionParams,
    h264_encoder: str = "libx264",
    h264_extra: dict | None = None,
) -> None:
    update_job(job_id, status=JobStatus.PROCESSING, progress=0)

    try:
        stream = build_stream(input_path, output_path, params, h264_encoder, h264_extra or {})
        total_duration = _get_duration(input_path)

        # Compile the ffmpeg-python graph into a plain arg list, then run it
        # ourselves so we can stream stderr for progress updates.
        cmd = ffmpeg.compile(stream, overwrite_output=True)
        _run_with_progress(cmd, job_id, total_duration)

        update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            output_filename=output_path.split("/")[-1],
        )

    except Exception as e:
        update_job(job_id, status=JobStatus.FAILED, error=str(e)[-500:])