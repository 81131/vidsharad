"""
Probes FFmpeg at startup to determine which hardware encoder is available.
Returns the best encoder for H.264 and whether hwaccel is usable.
Falls back to CPU silently if no GPU is found.
"""
import subprocess
import logging

logger = logging.getLogger(__name__)

def _ffmpeg_supports_encoder(encoder: str) -> bool:
    """Returns True if ffmpeg knows about this encoder."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10
        )
        return encoder in result.stdout
    except Exception:
        return False

def _test_encoder(encoder: str, hwaccel: str | None = None) -> bool:
    """
    Actually tries to encode a 1-frame blank video with this encoder.
    This is the only reliable way to know if the GPU is usable at runtime —
    the encoder might be compiled in but the GPU driver might not be present.
    """
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error"]
    if hwaccel:
        cmd += ["-hwaccel", hwaccel]
    cmd += [
        "-f", "lavfi", "-i", "nullsrc=s=256x256:d=0.1",
        "-vframes", "1", "-vcodec", encoder,
        "-f", "null", "-"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=15)
        return result.returncode == 0
    except Exception:
        return False

def detect_best_h264_encoder() -> tuple[str, dict]:
    """
    Returns (encoder_name, extra_output_kwargs) for the best available H.264 encoder.
    Priority: NVENC > QSV > AMF > CPU fallback.
    """
    candidates = [
        ("h264_nvenc", "cuda",  {"preset": "p4", "rc": "vbr", "cq": None}),  # NVIDIA
        ("h264_qsv",   "qsv",   {"preset": "medium", "q": None}),             # Intel
        ("h264_amf",   None,    {"usage": "transcoding"}),                    # AMD
    ]
    for encoder, hwaccel, kwargs in candidates:
        if _ffmpeg_supports_encoder(encoder) and _test_encoder(encoder, hwaccel):
            logger.info(f"GPU encoder selected: {encoder}")
            return encoder, kwargs

    logger.info("No GPU encoder found — falling back to libx264 (CPU)")
    return "libx264", {}