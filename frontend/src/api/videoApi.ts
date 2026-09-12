import type { ConversionParams, JobResponse, VideoInfo, SystemInfo } from "../types/job";
const API_BASE = "/api";

export async function getSystemInfo(): Promise<SystemInfo> {
  const res = await fetch(`${API_BASE}/system`);
  if (!res.ok) throw new Error("Failed to fetch system info");
  return res.json();
}

export async function probeVideo(file: File): Promise<VideoInfo> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/probe`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Probe failed");
  return res.json();
}

export async function uploadVideo(file: File, params: ConversionParams): Promise<JobResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("output_format", params.outputFormat);
  if (params.framerate) formData.append("framerate", String(params.framerate));
  if (params.resolution) formData.append("resolution", params.resolution);
  if (params.crf !== undefined) formData.append("crf", String(params.crf));
  formData.append("preset", params.preset ?? "medium");
  if (params.audioBitrate !== undefined)
    formData.append("audio_bitrate", String(params.audioBitrate));
  if (params.codec)
    formData.append("codec", params.codec);

  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function getJobStatus(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/status/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export function getDownloadUrl(jobId: string): string {
  return `${API_BASE}/download/${jobId}`;
}
