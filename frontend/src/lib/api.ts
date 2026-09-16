import type { Job, JobEvent, JobStatus, ReplayReport } from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    /** For 409s the API returns the job's current server state. */
    readonly job?: Job,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    // Nest validation errors put an array of messages in `message`.
    const raw = body?.message;
    const message = Array.isArray(raw) ? raw.join(", ") : raw || `Request failed (${res.status})`;
    if (res.status === 429) {
      throw new ApiError("Too many requests. Please slow down.", 429);
    }
    throw new ApiError(message, res.status, body?.code, body?.job);
  }

  return body as T;
}

export const api = {
  listJobs: () => request<Job[]>("/jobs"),

  createJob: (input: { title: string; type: string }) =>
    request<Job>("/jobs", { method: "POST", body: JSON.stringify(input) }),

  updateStatus: (id: string, status: JobStatus) =>
    request<Job>(`/jobs/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  deleteJob: (id: string) => request<void>(`/jobs/${id}`, { method: "DELETE" }),

  jobEvents: (id: string) => request<JobEvent[]>(`/jobs/${id}/events`),

  replayJob: (id: string) => request<ReplayReport>(`/jobs/${id}/replay`),

  recentEvents: (limit = 20) => request<JobEvent[]>(`/events?limit=${limit}`),
};
