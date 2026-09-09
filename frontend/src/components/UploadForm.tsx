import { useState, useRef, useEffect, useCallback } from "react";
import { uploadVideo, getJobStatus, getDownloadUrl } from "../api/videoApi";
import type { JobResponse } from "../types/job";

type Stage = "idle" | "uploading" | "processing" | "completed" | "failed";

/* ─── Inline styles ──────────────────────────────────────────────────────── */
const css = `
.vc-card {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.vc-header { text-align: center; }
.vc-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-h);
  letter-spacing: -0.3px;
  margin-bottom: 4px;
}
.vc-subtitle { font-size: 13px; color: var(--text); }

/* Drop zone */
.vc-dropzone {
  border: 2px dashed var(--border);
  border-radius: var(--radius);
  padding: 36px 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color .2s, background .2s;
  background: transparent;
  position: relative;
}
.vc-dropzone:hover,
.vc-dropzone--over { border-color: var(--accent); background: var(--accent-light); }
.vc-dropzone input[type="file"] {
  position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
}
.vc-dz-icon { font-size: 32px; margin-bottom: 8px; }
.vc-dz-label { font-size: 14px; font-weight: 600; color: var(--text-h); margin-bottom: 4px; }
.vc-dz-hint { font-size: 12px; color: var(--text); }
.vc-dz-filename {
  margin-top: 10px; font-size: 13px; font-weight: 500;
  color: var(--accent); background: var(--accent-light);
  border-radius: 6px; padding: 4px 10px; display: inline-block;
}

/* Options grid */
.vc-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 420px) { .vc-options { grid-template-columns: 1fr; } }

.vc-field { display: flex; flex-direction: column; gap: 4px; }
.vc-field--full { grid-column: 1 / -1; }
.vc-label { font-size: 12px; font-weight: 600; color: var(--text); text-transform: uppercase; letter-spacing: .5px; }

.vc-select {
  appearance: none;
  width: 100%;
  padding: 9px 32px 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b6375' d='M6 8L1 3h10z'/%3E%3C/svg%3E") no-repeat right 10px center;
  font-size: 14px;
  color: var(--text-h);
  cursor: pointer;
  transition: border-color .15s;
}
.vc-select:hover, .vc-select:focus { border-color: var(--accent); outline: none; }

/* CRF slider */
.vc-slider-row { display: flex; align-items: center; gap: 12px; }
.vc-slider {
  flex: 1;
  accent-color: var(--accent);
  cursor: pointer;
}
.vc-slider-value {
  font-size: 13px; font-weight: 600; color: var(--accent);
  min-width: 28px; text-align: right;
}

/* Submit button */
.vc-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .15s, transform .1s;
  letter-spacing: .2px;
}
.vc-btn:hover:not(:disabled) { opacity: .88; }
.vc-btn:active:not(:disabled) { transform: scale(.98); }
.vc-btn:disabled { opacity: .45; cursor: not-allowed; }

/* Status banners */
.vc-status {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  font-size: 14px;
}
.vc-status--info    { background: var(--accent-light);  color: var(--accent);  }
.vc-status--success { background: var(--success-light); color: var(--success); }
.vc-status--error   { background: var(--error-light);   color: var(--error);   }
.vc-status__icon { font-size: 18px; flex-shrink: 0; }
.vc-status__text { display: flex; flex-direction: column; gap: 2px; }
.vc-status__label { font-weight: 600; }
.vc-status__detail { font-size: 12px; opacity: .85; }

/* Spinner */
@keyframes vc-spin { to { transform: rotate(360deg); } }
.vc-spinner {
  width: 18px; height: 18px; flex-shrink: 0;
  border: 2px solid currentColor; border-top-color: transparent;
  border-radius: 50%;
  animation: vc-spin .7s linear infinite;
}

/* Download button */
.vc-download {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 12px;
  background: var(--success-light);
  color: var(--success);
  border: 1.5px solid var(--success);
  border-radius: var(--radius-sm);
  font-size: 15px; font-weight: 600;
  text-decoration: none;
  transition: background .15s;
}
.vc-download:hover { background: var(--success); color: #fff; }
`;

export default function UploadForm() {
  const [file, setFile]               = useState<File | null>(null);
  const [isDragOver, setIsDragOver]   = useState(false);
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [resolution, setResolution]   = useState("");
  const [framerate, setFramerate]     = useState("");
  const [crf, setCrf]                 = useState(23);

  const [stage, setStage]   = useState<Stage>("idle");
  const [jobId, setJobId]   = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  function clearPolling() {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const job: JobResponse = await getJobStatus(jobId);
        if (job.status === "completed")      { setStage("completed"); clearPolling(); }
        else if (job.status === "failed")    { setStage("failed"); setError(job.error ?? "Unknown error"); clearPolling(); }
        else                                  { setStage("processing"); }
      } catch { setStage("failed"); setError("Lost connection while checking status"); clearPolling(); }
    }, 2000);
    return clearPolling;
  }, [jobId]);

  const pickFile = useCallback((f: File | null | undefined) => {
    if (f) setFile(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    pickFile(e.dataTransfer.files[0]);
  }, [pickFile]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setStage("uploading"); setError(null);
    try {
      const job = await uploadVideo(file, {
        outputFormat,
        resolution: resolution || undefined,
        framerate: framerate ? Number(framerate) : undefined,
        crf,
      });
      setJobId(job.job_id); setStage("processing");
    } catch { setStage("failed"); setError("Upload failed. Please try again."); }
  }

  const isBusy = stage === "uploading" || stage === "processing";

  return (
    <>
      <style>{css}</style>
      <div className="vc-card">
        {/* Header */}
        <div className="vc-header">
          <div className="vc-title">🎬 Video Converter</div>
          <div className="vc-subtitle">Convert, resize, and compress videos in your browser</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          {/* Drop zone */}
          <div
            className={`vc-dropzone${isDragOver ? " vc-dropzone--over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="video/*"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <div className="vc-dz-icon">{file ? "🎥" : "📂"}</div>
            <div className="vc-dz-label">{file ? "File selected" : "Drop your video here"}</div>
            <div className="vc-dz-hint">{file ? "" : "or click to browse"}</div>
            {file && <div className="vc-dz-filename">{file.name}</div>}
          </div>

          {/* Options */}
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
                <input
                  className="vc-slider"
                  type="range" min={18} max={32} value={crf}
                  onChange={(e) => setCrf(Number(e.target.value))}
                />
                <span style={{ fontSize: 11 }}>Smallest</span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button className="vc-btn" type="submit" disabled={!file || isBusy}>
            {isBusy ? "Working…" : "Convert Video"}
          </button>
        </form>

        {/* Status */}
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
            <div className="vc-spinner" />
            <div className="vc-status__text">
              <span className="vc-status__label">Processing…</span>
              <span className="vc-status__detail">FFmpeg is converting your video</span>
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
    </>
  );
}
