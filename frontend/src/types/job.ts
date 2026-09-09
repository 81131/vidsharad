export type JobStatusValue = "queued" | "processing" | "completed" | "failed";

export interface ConversionParams {
  outputFormat: string;
  framerate?: number;
  resolution?: string;
  crf?: number;
}

export interface VideoInfo {
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration_sec?: number;
  bitrate_kbps?: number;
  size_bytes?: number;
  format_name?: string;
}

export interface JobResponse {
  job_id: string;
  status: JobStatusValue;
  error?: string;
  output_filename?: string;
  progress?: number;       // 0-100
  video_info?: VideoInfo;
}

export interface SystemInfo {
  gpu_available: boolean;
  encoder: string;
}
