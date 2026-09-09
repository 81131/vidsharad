export type JobStatusValue = "queued" | "processing" | "completed" | "failed";

export interface ConversionParams {
  outputFormat: string;
  framerate?: number;
  resolution?: string;
  crf?: number;
}

export interface JobResponse {
  job_id: string;
  status: JobStatusValue;
  error?: string;
  output_filename?: string;
}
