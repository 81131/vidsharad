import { useState, useRef, useEffect, useCallback } from "react";
import { uploadVideo, getJobStatus, getDownloadUrl, getSystemInfo } from "../api/videoApi";
import type { JobResponse, VideoInfo, SystemInfo, PresetValue } from "../types/job";

type Stage = "idle" | "uploading" | "processing" | "completed" | "failed";

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtDuration(sec?: number) {
  if (!sec) return null;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
function fmtBytes(b?: number) {
  if (!b) return null;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${(b / 1e3).toFixed(0)} KB`;
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const css = `
.vc-card {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* GPU status bar */
.vc-gpu-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 20px;
  font-size: 12px; font-weight: 600;
  border-bottom: 1px solid var(--border);
}
.vc-gpu-bar--on  { background: var(--success-light); color: var(--success); }
.vc-gpu-bar--off { background: var(--accent-light);  color: var(--text); }
.vc-gpu-bar__dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: currentColor; flex-shrink: 0;
}
.vc-gpu-bar__label { opacity: .7; font-weight: 400; margin-left: 2px; }

/* Main content */
.vc-body { padding: 28px 28px 24px; display: flex; flex-direction: column; gap: 22px; }

.vc-header { text-align: center; }
.vc-title  { font-size: 21px; font-weight: 700; color: var(--text-h); letter-spacing: -.3px; margin-bottom: 3px; }
.vc-subtitle { font-size: 13px; color: var(--text); }

/* Drop zone */
.vc-dropzone {
  border: 2px dashed var(--border); border-radius: var(--radius);
  padding: 32px 20px; text-align: center; cursor: pointer;
  transition: border-color .2s, background .2s;
  background: transparent; position: relative;
}
.vc-dropzone:hover, .vc-dropzone--over { border-color: var(--accent); background: var(--accent-light); }
.vc-dropzone input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
.vc-dz-icon  { font-size: 30px; margin-bottom: 6px; }
.vc-dz-label { font-size: 14px; font-weight: 600; color: var(--text-h); margin-bottom: 3px; }
.vc-dz-hint  { font-size: 12px; color: var(--text); }
.vc-dz-filename {
  margin-top: 8px; font-size: 12px; font-weight: 500;
  color: var(--accent); background: var(--accent-light);
  border-radius: 6px; padding: 3px 10px; display: inline-block;
}

/* Video stats panel */
.vc-stats {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 12px 16px;
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 8px;
}
@media (max-width: 420px) { .vc-stats { grid-template-columns: repeat(2, 1fr); } }
.vc-stats__item { display: flex; flex-direction: column; gap: 2px; }
.vc-stats__lbl  { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text); opacity: .7; }
.vc-stats__val  { font-size: 13px; font-weight: 600; color: var(--text-h); }

/* Options grid */
.vc-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 420px) { .vc-options { grid-template-columns: 1fr; } }
.vc-field { display: flex; flex-direction: column; gap: 4px; }
.vc-label { font-size: 11px; font-weight: 600; color: var(--text); text-transform: uppercase; letter-spacing: .5px; }

.vc-select {
  appearance: none; width: 100%; padding: 9px 30px 9px 11px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6375' d='M6 8L1 3h10z'/%3E%3C/svg%3E") no-repeat right 9px center;
  font-size: 13px; color: var(--text-h); cursor: pointer; transition: border-color .15s;
}
.vc-select:hover, .vc-select:focus { border-color: var(--accent); outline: none; }

.vc-slider-row { display: flex; align-items: center; gap: 10px; }
.vc-slider { flex: 1; accent-color: var(--accent); cursor: pointer; }

/* Submit button */
.vc-btn {
  width: 100%; padding: 12px; border: none; border-radius: var(--radius-sm);
  background: var(--accent); color: #fff; font-size: 15px; font-weight: 600;
  cursor: pointer; transition: opacity .15s, transform .1s; letter-spacing: .2px;
}
.vc-btn:hover:not(:disabled) { opacity: .88; }
.vc-btn:active:not(:disabled) { transform: scale(.98); }
.vc-btn:disabled { opacity: .45; cursor: not-allowed; }

/* Status banners */
.vc-status { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--radius-sm); font-size: 14px; }
.vc-status--info    { background: var(--accent-light);  color: var(--accent); }
.vc-status--success { background: var(--success-light); color: var(--success); }
.vc-status--error   { background: var(--error-light);   color: var(--error); }
.vc-status__icon { font-size: 17px; flex-shrink: 0; margin-top: 1px; }
.vc-status__text { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
.vc-status__label  { font-weight: 600; }
.vc-status__detail { font-size: 12px; opacity: .85; }

/* Progress bar */
.vc-progress-track {
  height: 6px; border-radius: 999px;
  background: color-mix(in oklab, currentColor 20%, transparent);
  overflow: hidden;
}
.vc-progress-fill {
  height: 100%; border-radius: 999px; background: currentColor;
  transition: width .4s ease;
}

/* Spinner (upload only) */
@keyframes vc-spin { to { transform: rotate(360deg); } }
.vc-spinner {
  width: 17px; height: 17px; flex-shrink: 0; margin-top: 2px;
  border: 2px solid currentColor; border-top-color: transparent;
  border-radius: 50%; animation: vc-spin .7s linear infinite;
}

/* Download button */
.vc-download {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 12px; background: var(--success-light);
  color: var(--success); border: 1.5px solid var(--success);
  border-radius: var(--radius-sm); font-size: 15px; font-weight: 600;
  text-decoration: none; transition: background .15s;
}
.vc-download:hover { background: var(--success); color: #fff; }

/* ── Mode toggle ──────────────────────────────────────────────────── */
.vc-mode-toggle {
  display: flex; align-items: center; gap: 0;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: 999px; padding: 3px; width: fit-content; align-self: flex-end;
}
.vc-mode-btn {
  padding: 5px 14px; border-radius: 999px; border: none;
  font-size: 12px; font-weight: 600; cursor: pointer;
  background: transparent; color: var(--text);
  transition: background .15s, color .15s;
}
.vc-mode-btn--active {
  background: var(--accent); color: #fff;
}

/* ── Advanced text inputs ─────────────────────────────────────────── */
.vc-input {
  width: 100%; padding: 9px 11px;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--bg); font-size: 13px; color: var(--text-h);
  transition: border-color .15s; box-sizing: border-box;
}
.vc-input:hover, .vc-input:focus { border-color: var(--accent); outline: none; }
.vc-input--error { border-color: var(--error) !important; }
.vc-input-hint { font-size: 10px; color: var(--text); opacity: .65; margin-top: 2px; }
.vc-input-hint--error { color: var(--error); opacity: 1; }

/* Two inputs side by side (width × height) */
.vc-input-pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px; align-items: center; }
.vc-input-pair__sep { font-size: 14px; color: var(--text); opacity: .5; text-align: center; }
`;

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function UploadForm() {
  // Form state
  const [file, setFile]                 = useState<File | null>(null);
  const [isDragOver, setIsDragOver]     = useState(false);
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [resolution, setResolution]     = useState("");
  const [framerate, setFramerate]       = useState("");
  const [crf, setCrf]                   = useState(23);
  const [preset, setPreset]             = useState<PresetValue>("medium");
  const [audioBitrate, setAudioBitrate] = useState<number | null>(null); // null = auto

  // Advanced mode
  const [advancedMode, setAdvancedMode]     = useState(false);
  const [advWidth, setAdvWidth]             = useState("");
  const [advHeight, setAdvHeight]           = useState("");
  const [advFramerate, setAdvFramerate]     = useState("");
  const [advCrf, setAdvCrf]                 = useState("23");
  const [advAudioBitrate, setAdvAudioBitrate] = useState("");
  const [advCodec, setAdvCodec]             = useState("");

  // CRF validation (advanced mode only, range 0–51)
  const advCrfNum  = parseInt(advCrf, 10);
  const advCrfValid = advCrf === "" || (!isNaN(advCrfNum) && advCrfNum >= 0 && advCrfNum <= 51);

  // Audio bitrate validation (advanced, 1–9999 kbps)
  const advAudioNum   = parseInt(advAudioBitrate, 10);
  const advAudioValid = advAudioBitrate === "" || (!isNaN(advAudioNum) && advAudioNum > 0 && advAudioNum <= 9999);

  // Resolution validation (both must be positive even numbers or both empty)
  const wNum = parseInt(advWidth, 10);
  const hNum = parseInt(advHeight, 10);
  const bothFilled  = advWidth !== "" && advHeight !== "";
  const eitherFilled = advWidth !== "" || advHeight !== "";
  const advResValid = !eitherFilled || (bothFilled && wNum > 0 && wNum % 2 === 0 && hNum > 0 && hNum % 2 === 0);

  const advFormValid = advCrfValid && advAudioValid && advResValid;

  // Job state
  const [stage, setStage]       = useState<Stage>("idle");
  const [jobId, setJobId]       = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  // System info
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  const pollRef = useRef<number | null>(null);

  // Fetch GPU status once on mount
  useEffect(() => {
    getSystemInfo().then(setSystemInfo).catch(() => {/* backend not ready yet */});
  }, []);

  function clearPolling() {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
  }

  // Poll job status every 2 s; read progress and video_info from each response
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const job: JobResponse = await getJobStatus(jobId);
        if (job.progress != null) setProgress(job.progress);
        if (job.video_info)       setVideoInfo(job.video_info);

        if (job.status === "completed") { setStage("completed"); clearPolling(); }
        else if (job.status === "failed") {
          setStage("failed"); setError(job.error ?? "Unknown error"); clearPolling();
        } else { setStage("processing"); }
      } catch {
        setStage("failed"); setError("Lost connection while checking status"); clearPolling();
      }
    }, 2000);
    return clearPolling;
  }, [jobId]);

  const pickFile = useCallback((f: File | null | undefined) => {
    if (f) { setFile(f); setVideoInfo(null); setProgress(0); }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    pickFile(e.dataTransfer.files[0]);
  }, [pickFile]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setStage("uploading"); setError(null); setProgress(0); setVideoInfo(null);
    try {
      const job = await uploadVideo(file, {
        outputFormat,
        resolution: resolution || undefined,
        framerate: framerate ? Number(framerate) : undefined,
        crf,
        preset,
        audioBitrate: audioBitrate ?? undefined,
      });
      // video_info comes back immediately from the upload response
      let params;
      if (advancedMode) {
        const advRes = bothFilled ? `${wNum}x${hNum}` : undefined;
        params = {
          outputFormat,
          resolution:   advRes,
          framerate:    advFramerate ? Number(advFramerate) : undefined,
          crf:          advCrf !== "" ? advCrfNum : undefined,
          preset,
          audioBitrate: advAudioBitrate !== "" ? advAudioNum : undefined,
          codec:        advCodec || undefined,
        };
      } else {
        params = {
          outputFormat,
          resolution: resolution || undefined,
          framerate:  framerate ? Number(framerate) : undefined,
          crf,
          preset,
          audioBitrate: audioBitrate ?? undefined,
        };
      }
      const job = await uploadVideo(file, params);
      if (job.video_info) setVideoInfo(job.video_info);
      setJobId(job.job_id);
      setStage("processing");
    } catch { setStage("failed"); setError("Upload failed. Please try again."); }
  }

  const isBusy = stage === "uploading" || stage === "processing";
  const canSubmit = !!file && !isBusy && (!advancedMode || advFormValid);

  return (
    <>
      <style>{css}</style>
      <div className="vc-card">

        {/* ── GPU status bar ────────────────────────────────────────── */}
        <div className={`vc-gpu-bar ${systemInfo?.gpu_available ? "vc-gpu-bar--on" : "vc-gpu-bar--off"}`}>
          <span className="vc-gpu-bar__dot" />
          {systemInfo
            ? systemInfo.gpu_available
              ? <><strong>GPU</strong><span className="vc-gpu-bar__label">· {systemInfo.encoder}</span></>
              : <><strong>CPU Only</strong><span className="vc-gpu-bar__label">· GPU not detected, using libx264</span></>
            : <span style={{ opacity: .6 }}>Detecting hardware…</span>
          }
        </div>

        <div className="vc-body">
          {/* ── Header ───────────────────────────────────────────────── */}
          <div className="vc-header">
            <div className="vc-title">🎬 Video Converter</div>
            <div className="vc-subtitle">Convert, resize, and compress videos in your browser</div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "contents" }}>
            {/* ── Drop zone ────────────────────────────────────────────── */}
            <div
              className={`vc-dropzone${isDragOver ? " vc-dropzone--over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <input type="file" accept="video/*" onChange={(e) => pickFile(e.target.files?.[0])} />
              <div className="vc-dz-icon">{file ? "🎥" : "📂"}</div>
              <div className="vc-dz-label">{file ? "File selected" : "Drop your video here"}</div>
              <div className="vc-dz-hint">{file ? "" : "or click to browse"}</div>
              {file && <div className="vc-dz-filename">{file.name}</div>}
            </div>

            {/* ── Video stats ──────────────────────────────────────────── */}
            {videoInfo && (
              <div className="vc-stats">
                {videoInfo.codec && (
                  <div className="vc-stats__item">
                    <span className="vc-stats__lbl">Codec</span>
                    <span className="vc-stats__val">{videoInfo.codec.toUpperCase()}</span>
                  </div>
                )}
                {videoInfo.width && videoInfo.height && (
                  <div className="vc-stats__item">
                    <span className="vc-stats__lbl">Resolution</span>
                    <span className="vc-stats__val">{videoInfo.width}×{videoInfo.height}</span>
                  </div>
                )}
                {videoInfo.fps && (
                  <div className="vc-stats__item">
                    <span className="vc-stats__lbl">Frame Rate</span>
                    <span className="vc-stats__val">{videoInfo.fps} fps</span>
                  </div>
                )}
                {videoInfo.bitrate_kbps && (
                  <div className="vc-stats__item">
                    <span className="vc-stats__lbl">Bitrate</span>
                    <span className="vc-stats__val">
                      {videoInfo.bitrate_kbps >= 1000
                        ? `${(videoInfo.bitrate_kbps / 1000).toFixed(1)} Mbps`
                        : `${videoInfo.bitrate_kbps} kbps`}
                    </span>
                  </div>
                )}
                {videoInfo.duration_sec && (
                  <div className="vc-stats__item">
                    <span className="vc-stats__lbl">Duration</span>
                    <span className="vc-stats__val">{fmtDuration(videoInfo.duration_sec)}</span>
                  </div>
                )}
                {videoInfo.size_bytes && (
                  <div className="vc-stats__item">
                    <span className="vc-stats__lbl">File Size</span>
                    <span className="vc-stats__val">{fmtBytes(videoInfo.size_bytes)}</span>
                  </div>
                )}
                {videoInfo.format_name && (
                  <div className="vc-stats__item">
                    <span className="vc-stats__lbl">Format</span>
                    <span className="vc-stats__val">{videoInfo.format_name.toUpperCase()}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Mode toggle ───────────────────────────────────────────── */}
            <div className="vc-mode-toggle">
              <button type="button" className={`vc-mode-btn${!advancedMode ? " vc-mode-btn--active" : ""}`}
                onClick={() => setAdvancedMode(false)}>Basic</button>
              <button type="button" className={`vc-mode-btn${advancedMode ? " vc-mode-btn--active" : ""}`}
                onClick={() => setAdvancedMode(true)}>⚙ Advanced</button>
            </div>

            {/* ── Options ──────────────────────────────────────────────── */}
            <div className="vc-options">
              <div className="vc-field">
                <label className="vc-label">Output Format</label>
                <select className="vc-select" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
                  <option value="mp4">MP4 (H.264)</option>
                  <option value="mkv">MKV (H.264)</option>
                  <option value="webm">WebM (VP9)</option>
                </select>
              </div>
              <div className="vc-field">
                <label className="vc-label">Resolution</label>
                <select className="vc-select" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  <option value="">Original</option>
                  <option value="1920x1080">1080p</option>
                  <option value="1280x720">720p</option>
                  <option value="854x480">480p</option>
                </select>
              </div>
              <div className="vc-field">
                <label className="vc-label">Frame Rate</label>
                <select className="vc-select" value={framerate} onChange={(e) => setFramerate(e.target.value)}>
                  <option value="">Original</option>
                  <option value="24">24 fps</option>
                  <option value="30">30 fps</option>
                  <option value="60">60 fps</option>
                </select>
              </div>
              <div className="vc-field">
                <label className="vc-label">Quality (CRF {crf})</label>
                <div className="vc-slider-row">
                  <span style={{ fontSize: 11 }}>Best</span>
                  <input className="vc-slider" type="range" min={18} max={32} value={crf}
                    onChange={(e) => setCrf(Number(e.target.value))} />
                  <span style={{ fontSize: 11 }}>Smallest</span>
                </div>
              </div>
              {/* Preset spans both columns */}
              <div className="vc-field" style={{ gridColumn: "1 / -1" }}>
                <label className="vc-label">
                  Encoding Preset
                  {outputFormat === "webm" && (
                    <span style={{ fontWeight: 400, textTransform: "none", opacity: .65, marginLeft: 6 }}>
                      · not used for WebM
                    </span>
                  )}
                </label>
                <select
                  className="vc-select"
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as PresetValue)}
                  disabled={outputFormat === "webm"}
                >
                  <option value="ultrafast">Ultrafast · largest file, fastest encode</option>
                  <option value="veryfast">Very Fast</option>
                  <option value="faster">Faster</option>
                  <option value="fast">Fast</option>
                  <option value="medium">Medium · balanced (default)</option>
                  <option value="slow">Slow · better compression</option>
                  <option value="slower">Slower</option>
                  <option value="veryslow">Very Slow · smallest file, slowest encode</option>
                </select>
              </div>
              {/* Audio bitrate spans both columns */}
              <div className="vc-field" style={{ gridColumn: "1 / -1" }}>
                <label className="vc-label">
                  Audio Bitrate
                  <span style={{ fontWeight: 400, textTransform: "none", opacity: .65, marginLeft: 6 }}>
                    · {outputFormat === "webm" ? "Opus" : "AAC"}
                  </span>
                </label>
                <select
                  className="vc-select"
                  value={audioBitrate ?? ""}
                  onChange={(e) => setAudioBitrate(e.target.value === "" ? null : Number(e.target.value))}
                >
                  <option value="">Auto (copy source audio)</option>
                  <option value="64">64 kbps · voice / podcast</option>
                  <option value="96">96 kbps · compact stereo</option>
                  <option value="128">128 kbps · standard stereo</option>
                  <option value="192">192 kbps · high quality</option>
                  <option value="256">256 kbps · near-transparent</option>
                  <option value="320">320 kbps · maximum</option>
                </select>
              </div>
              {!advancedMode ? (
                <>
                  {/* ── BASIC controls ────────────────────────────── */}
                  <div className="vc-field">
                    <label className="vc-label">Output Format</label>
                    <select className="vc-select" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
                      <option value="mp4">MP4 (H.264)</option>
                      <option value="mkv">MKV (H.264)</option>
                      <option value="webm">WebM (VP9)</option>
                    </select>
                  </div>
                  <div className="vc-field">
                    <label className="vc-label">Resolution</label>
                    <select className="vc-select" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                      <option value="">Original</option>
                      <option value="1920x1080">1080p</option>
                      <option value="1280x720">720p</option>
                      <option value="854x480">480p</option>
                    </select>
                  </div>
                  <div className="vc-field">
                    <label className="vc-label">Frame Rate</label>
                    <select className="vc-select" value={framerate} onChange={(e) => setFramerate(e.target.value)}>
                      <option value="">Original</option>
                      <option value="24">24 fps</option>
                      <option value="30">30 fps</option>
                      <option value="60">60 fps</option>
                    </select>
                  </div>
                  <div className="vc-field">
                    <label className="vc-label">Quality (CRF {crf})</label>
                    <div className="vc-slider-row">
                      <span style={{ fontSize: 11 }}>Best</span>
                      <input className="vc-slider" type="range" min={18} max={32} value={crf}
                        onChange={(e) => setCrf(Number(e.target.value))} />
                      <span style={{ fontSize: 11 }}>Smallest</span>
                    </div>
                  </div>
                  <div className="vc-field" style={{ gridColumn: "1 / -1" }}>
                    <label className="vc-label">
                      Encoding Preset
                      {outputFormat === "webm" && (
                        <span style={{ fontWeight: 400, textTransform: "none", opacity: .65, marginLeft: 6 }}>· not used for WebM</span>
                      )}
                    </label>
                    <select className="vc-select" value={preset}
                      onChange={(e) => setPreset(e.target.value as PresetValue)}
                      disabled={outputFormat === "webm"}>
                      <option value="ultrafast">Ultrafast · largest file, fastest encode</option>
                      <option value="veryfast">Very Fast</option>
                      <option value="faster">Faster</option>
                      <option value="fast">Fast</option>
                      <option value="medium">Medium · balanced (default)</option>
                      <option value="slow">Slow · better compression</option>
                      <option value="slower">Slower</option>
                      <option value="veryslow">Very Slow · smallest file, slowest encode</option>
                    </select>
                  </div>
                  <div className="vc-field" style={{ gridColumn: "1 / -1" }}>
                    <label className="vc-label">
                      Audio Bitrate
                      <span style={{ fontWeight: 400, textTransform: "none", opacity: .65, marginLeft: 6 }}>
                        · {outputFormat === "webm" ? "Opus" : "AAC"}
                      </span>
                    </label>
                    <select className="vc-select" value={audioBitrate ?? ""}
                      onChange={(e) => setAudioBitrate(e.target.value === "" ? null : Number(e.target.value))}>
                      <option value="">Auto (copy source audio)</option>
                      <option value="64">64 kbps · voice / podcast</option>
                      <option value="96">96 kbps · compact stereo</option>
                      <option value="128">128 kbps · standard stereo</option>
                      <option value="192">192 kbps · high quality</option>
                      <option value="256">256 kbps · near-transparent</option>
                      <option value="320">320 kbps · maximum</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  {/* ── ADVANCED controls ─────────────────────────── */}
                  <div className="vc-field">
                    <label className="vc-label">Output Format</label>
                    <select className="vc-select" value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
                      <optgroup label="Common">
                        <option value="mp4">MP4</option>
                        <option value="mkv">MKV (Matroska)</option>
                        <option value="webm">WebM</option>
                      </optgroup>
                      <optgroup label="Legacy / Other">
                        <option value="avi">AVI</option>
                        <option value="mov">MOV (QuickTime)</option>
                        <option value="flv">FLV (Flash)</option>
                        <option value="ts">TS (MPEG Transport)</option>
                        <option value="ogv">OGV (Ogg)</option>
                        <option value="3gp">3GP (Mobile)</option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="vc-field">
                    <label className="vc-label">Video Codec</label>
                    <input
                      className="vc-input"
                      list="vc-codec-list"
                      placeholder="Default for format (e.g. libx264)"
                      value={advCodec}
                      onChange={(e) => setAdvCodec(e.target.value)}
                    />
                    <datalist id="vc-codec-list">
                      <option value="libx264" />
                      <option value="libx265" />
                      <option value="h264_nvenc" />
                      <option value="hevc_nvenc" />
                      <option value="libvpx-vp9" />
                      <option value="libaom-av1" />
                      <option value="h264_qsv" />
                      <option value="hevc_qsv" />
                      <option value="copy" />
                    </datalist>
                    <span className="vc-input-hint">Leave blank to use the format default</span>
                  </div>
                  <div className="vc-field" style={{ gridColumn: "1 / -1" }}>
                    <label className="vc-label">Resolution (px)</label>
                    <div className="vc-input-pair">
                      <input className={`vc-input${!advResValid ? " vc-input--error" : ""}`}
                        type="number" min={2} step={2} placeholder="Width"
                        value={advWidth} onChange={(e) => setAdvWidth(e.target.value)} />
                      <span className="vc-input-pair__sep">×</span>
                      <input className={`vc-input${!advResValid ? " vc-input--error" : ""}`}
                        type="number" min={2} step={2} placeholder="Height"
                        value={advHeight} onChange={(e) => setAdvHeight(e.target.value)} />
                    </div>
                    {!advResValid && (
                      <span className="vc-input-hint vc-input-hint--error">
                        Width and height must both be positive even numbers
                      </span>
                    )}
                    {advResValid && <span className="vc-input-hint">Leave blank to keep original. Must be even numbers.</span>}
                  </div>
                  <div className="vc-field">
                    <label className="vc-label">Frame Rate (fps)</label>
                    <input className="vc-input" type="number" min={1} max={240} step={0.001}
                      placeholder="Original"
                      value={advFramerate} onChange={(e) => setAdvFramerate(e.target.value)} />
                    <span className="vc-input-hint">e.g. 23.976, 25, 29.97, 60</span>
                  </div>
                  <div className="vc-field">
                    <label className="vc-label">CRF Quality (0–51)</label>
                    <input className={`vc-input${!advCrfValid ? " vc-input--error" : ""}`}
                      type="number" min={0} max={51} placeholder="23 (default)"
                      value={advCrf} onChange={(e) => setAdvCrf(e.target.value)} />
                    {!advCrfValid
                      ? <span className="vc-input-hint vc-input-hint--error">Must be 0–51 (lower = better quality)</span>
                      : <span className="vc-input-hint">0 = lossless · 18 = visually lossless · 23 = default · 51 = worst</span>
                    }
                  </div>
                  <div className="vc-field">
                    <label className="vc-label">
                      Encoding Preset
                      {outputFormat === "webm" && (
                        <span style={{ fontWeight: 400, textTransform: "none", opacity: .65, marginLeft: 6 }}>· not used for WebM</span>
                      )}
                    </label>
                    <select className="vc-select" value={preset}
                      onChange={(e) => setPreset(e.target.value as PresetValue)}
                      disabled={outputFormat === "webm"}>
                      <option value="ultrafast">ultrafast</option>
                      <option value="veryfast">veryfast</option>
                      <option value="faster">faster</option>
                      <option value="fast">fast</option>
                      <option value="medium">medium (default)</option>
                      <option value="slow">slow</option>
                      <option value="slower">slower</option>
                      <option value="veryslow">veryslow</option>
                    </select>
                  </div>
                  <div className="vc-field">
                    <label className="vc-label">Audio Bitrate (kbps)</label>
                    <input className={`vc-input${!advAudioValid ? " vc-input--error" : ""}`}
                      type="number" min={1} max={9999} placeholder="Auto (copy source)"
                      value={advAudioBitrate} onChange={(e) => setAdvAudioBitrate(e.target.value)} />
                    {!advAudioValid
                      ? <span className="vc-input-hint vc-input-hint--error">Must be a positive number in kbps</span>
                      : <span className="vc-input-hint">Common: 96, 128, 192, 256, 320</span>
                    }
                  </div>
                </>
              )}
            </div>

            {/* ── Submit ───────────────────────────────────────────────── */}
            <button className="vc-btn" type="submit" disabled={!file || isBusy}>
            <button className="vc-btn" type="submit" disabled={!canSubmit}>
              {isBusy ? "Working…" : "Convert Video"}
            </button>
          </form>

          {/* ── Status banners ───────────────────────────────────────── */}
          {stage === "uploading" && (
            <div className="vc-status vc-status--info">
              <div className="vc-spinner" />
              <div className="vc-status__text">
                <span className="vc-status__label">Uploading…</span>
                <span className="vc-status__detail">Sending file to server</span>
              </div>
            </div>
          )}

          {stage === "processing" && (
            <div className="vc-status vc-status--info">
              <div className="vc-status__text">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="vc-status__label">Encoding…</span>
                  <span className="vc-status__label">{progress}%</span>
                </div>
                <div className="vc-progress-track">
                  <div className="vc-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span className="vc-status__detail">
                  {systemInfo?.gpu_available
                    ? `GPU · ${systemInfo.encoder}`
                    : "CPU · libx264"}
                </span>
              </div>
            </div>
          )}

          {stage === "completed" && jobId && (
            <>
              <div className="vc-status vc-status--success">
                <span className="vc-status__icon">✅</span>
                <div className="vc-status__text">
                  <span className="vc-status__label">Conversion complete!</span>
                  <span className="vc-status__detail">Your file is ready to download</span>
                </div>
              </div>
              <a className="vc-download" href={getDownloadUrl(jobId)} download>
                ⬇ Download converted video
              </a>
            </>
          )}

          {stage === "failed" && (
            <div className="vc-status vc-status--error">
              <span className="vc-status__icon">⚠️</span>
              <div className="vc-status__text">
                <span className="vc-status__label">Something went wrong</span>
                <span className="vc-status__detail">{error}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

