"""
Orchestrates a conversion job: builds the ffmpeg command via ffmpeg_builder,
runs it, and updates job status accordingly. This file is the only one that
knows about job_manager and actually executes anything - ffmpeg_builder.py
stays pure and side-effect-free, which keeps this function focused on
"what happens", not "how the command is constructed".
"""
import ffmpeg

from app.ffmpeg_builder import build_stream
from app.job_manager import update_job
from app.models import JobStatus, ConversionParams


def convert_video(
    job_id: str,
    input_path: str,
    output_path: str,
    params: ConversionParams,
    h264_encoder: str = "libx264",
    h264_extra: dict | None = None,
) -> None:
    update_job(job_id, status=JobStatus.PROCESSING)

    try:
        stream = build_stream(input_path, output_path, params, h264_encoder, h264_extra or {})

        # overwrite_output=True stops ffmpeg from pausing to ask "overwrite? y/n"
        # in the terminal - which would otherwise hang a background job forever
        # since nothing is there to answer the prompt.
        ffmpeg.run(stream, overwrite_output=True, quiet=True)

        update_job(
            job_id,
            status=JobStatus.COMPLETED,
            output_filename=output_path.split("/")[-1],
        )

    except ffmpeg.Error as e:
        # ffmpeg's actual error detail lives in stderr, not in the Python exception message
        error_message = e.stderr.decode("utf-8") if e.stderr else str(e)
        update_job(job_id, status=JobStatus.FAILED, error=error_message[-500:])
    except Exception as e:
        update_job(job_id, status=JobStatus.FAILED, error=str(e))