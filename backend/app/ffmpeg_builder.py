"""
Pure functions for building an ffmpeg-python stream graph from conversion
parameters. Nothing in this file touches disk, the job manager, or runs
ffmpeg itself - it only builds up the command description. That separation
means you can unit test "does resolution=1920x1080 produce the right filter"
without ever needing a real video file or a running FFmpeg binary.

To add a new capability (e.g. a watermark overlay, audio bitrate control,
trimming), add one function here following the same shape - it takes a
stream and returns a (possibly modified) stream - and register it in
apply_filters() or add its output kwargs in build_output_kwargs().
Nothing else in the codebase needs to change.
"""
from typing import Any, Dict

import ffmpeg

from app.models import ConversionParams


def apply_resolution(stream, resolution: str | None):
    """Apply a scale filter if a resolution was requested, e.g. '1920x1080'."""
    if not resolution:
        return stream

    parts = resolution.lower().split("x")
    if len(parts) != 2:
        raise ValueError(
            f"Invalid resolution format '{resolution}'. Expected WIDTHxHEIGHT (e.g. '1920x1080')."
        )
    width, height = parts
    return stream.filter("scale", width, height)


def apply_filters(stream, params: ConversionParams):
    """
    Runs every optional video filter in sequence. Each filter function is
    responsible for deciding whether it applies (returning the stream
    unchanged if its param wasn't set). Add new filter functions to this
    list as features grow - order matters if filters interact, so keep
    related filters grouped and commented.
    """
    filter_pipeline = [
        lambda s: apply_resolution(s, params.resolution),
        # Future: lambda s: apply_crop(s, params.crop),
        # Future: lambda s: apply_watermark(s, params.watermark_path),
    ]

    for apply_filter in filter_pipeline:
        stream = apply_filter(stream)

    return stream


def build_output_kwargs(params: ConversionParams) -> Dict[str, Any]:
    """
    Builds the keyword arguments passed to ffmpeg.output() - the equivalent
    of assembling command-line flags like -r, -crf, -vcodec. Kept separate
    from the stream/filter logic since output settings (codec, quality,
    framerate) are conceptually different from visual transformations
    (scale, crop, watermark).
    """
    # Maps container format to a compatible video codec.
    # libvpx-vp9 is required for WebM; libx264 is the safe default for MP4/MKV.
    _FORMAT_CODEC_MAP: Dict[str, str] = {
        "mp4": "libx264",
        "mkv": "libx264",
        "webm": "libvpx-vp9",
    }

    output_kwargs: Dict[str, Any] = {}

    if params.framerate:
        output_kwargs["r"] = params.framerate

    if params.crf is not None:
        vcodec = _FORMAT_CODEC_MAP.get(params.output_format, "libx264")
        output_kwargs["crf"] = params.crf
        output_kwargs["vcodec"] = vcodec

    return output_kwargs


def build_stream(input_path: str, output_path: str, params: ConversionParams):
    """
    Assembles the full ffmpeg-python stream graph: input -> filters -> output.
    This is the single place that composes the smaller pieces above - if you
    ever want to inspect or test "what command would this produce" without
    running it, this is the function to call.
    """
    stream = ffmpeg.input(input_path)
    stream = apply_filters(stream, params)
    output_kwargs = build_output_kwargs(params)
    return ffmpeg.output(stream, output_path, **output_kwargs)
