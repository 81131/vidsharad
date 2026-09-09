import type { ConversionParams, JobResponse } from "../types/job";
const API_BASE = "/api";

export async function uploadVideo(file: File, params: ConversionParams): Promise<JobResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("output_format", params.outputFormat);
  if (params.framerate) formData.append("framerate", String(params.framerate));
  if (params.resolution) formData.append("resolution", params.resolution);
  if (params.crf !== undefined) formData.append("crf", String(params.crf));

  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData, // no Content-Type header set manually - the browser sets
    // the correct multipart/form-data boundary automatically for FormData
  });

  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function getJobStatus(jobId: string): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/status/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

