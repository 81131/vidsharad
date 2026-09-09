import { useState, useRef, useEffect } from "react";
import { uploadVideo, getJobStatus, getDownloadUrl } from "../api/videoApi";
import type { JobResponse } from "../types/job";

type Stage = "idle" | "uploading" | "processing" | "completed" | "failed";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [resolution, setResolution] = useState("");
  const [framerate, setFramerate] = useState("");
  const [crf, setCrf] = useState(23);

  const [stage, setStage] = useState<Stage>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  function clearPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Once we have a jobId, poll its status every 2s until it resolves.
  // Simplest way to track an async background job for an MVP - no
  // WebSockets needed.
  useEffect(() => {
    if (!jobId) return;

    pollRef.current = window.setInterval(async () => {
      try {
        const job: JobResponse = await getJobStatus(jobId);
        if (job.status === "completed") {
          setStage("completed");
          clearPolling();
        } else if (job.status === "failed") {
          setStage("failed");
          setError(job.error ?? "Unknown error");
          clearPolling();
        } else {
          setStage("processing");
        }
      } catch {
        setStage("failed");
        setError("Lost connection while checking status");
        clearPolling();
      }
    }, 2000);

    return clearPolling;
  }, [jobId]);

  // React 19.2 deprecated React.FormEvent<HTMLFormElement> for onSubmit
  // handlers - it didn't accurately model what actually fires on submit.
  // React.SubmitEvent<HTMLFormElement> is the current replacement.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    setStage("uploading");
    setError(null);

    try {
      const job = await uploadVideo(file, {
        outputFormat,
        resolution: resolution || undefined,
        framerate: framerate ? Number(framerate) : undefined,
        crf,
      });
      setJobId(job.job_id);
      setStage("processing");
    } catch {
      setStage("failed");
      setError("Upload failed");
    }
  }

  const isBusy = stage === "uploading" || stage === "processing";

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        accept="video/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
        <option value="mp4">MP4</option>
        <option value="mkv">MKV</option>
        <option value="webm">WebM</option>
      </select>

      <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
        <option value="">Original resolution</option>
        <option value="1920x1080">1080p</option>
        <option value="1280x720">720p</option>
        <option value="854x480">480p</option>
      </select>

      <select value={framerate} onChange={(e) => setFramerate(e.target.value)}>
        <option value="">Original framerate</option>
        <option value="24">24 fps</option>
        <option value="30">30 fps</option>
        <option value="60">60 fps</option>
      </select>

      <label>
        Compression (CRF - lower = better quality, larger file)
        <input
          type="range"
          min={18}
          max={32}
          value={crf}
          onChange={(e) => setCrf(Number(e.target.value))}
        />
        {crf}
      </label>

      <button type="submit" disabled={!file || isBusy}>
        Convert
      </button>

      {stage === "uploading" && <p>Uploading...</p>}
      {stage === "processing" && <p>Processing your video...</p>}
      {stage === "completed" && jobId && (
        <a href={getDownloadUrl(jobId)} download>
          Download result
        </a>
      )}
      {stage === "failed" && <p style={{ color: "red" }}>Error: {error}</p>}
    </form>
  );
}
