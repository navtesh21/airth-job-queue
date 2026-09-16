"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { api, ApiError } from "@/lib/api";
import type { Job, JobStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 10_000;

interface State {
  jobs: Job[];
  /** True only until the first load finishes; background refreshes don't blank the UI. */
  initialLoading: boolean;
  loadError: string | null;
}

type Action =
  | { type: "loaded"; jobs: Job[] }
  | { type: "loadFailed"; error: string }
  | { type: "upsert"; job: Job }
  | { type: "removed"; id: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { jobs: action.jobs, initialLoading: false, loadError: null };
    case "loadFailed":
      return { ...state, initialLoading: false, loadError: action.error };
    case "upsert": {
      const exists = state.jobs.some((j) => j.id === action.job.id);
      return {
        ...state,
        jobs: exists
          ? state.jobs.map((j) => (j.id === action.job.id ? action.job : j))
          : [action.job, ...state.jobs],
      };
    }
    case "removed":
      return { ...state, jobs: state.jobs.filter((j) => j.id !== action.id) };
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function useJobs() {
  const [state, dispatch] = useReducer(reducer, { jobs: [], initialLoading: true, loadError: null });
  // Ignore out-of-order list responses (e.g. a slow poll finishing after a newer one).
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    try {
      const jobs = await api.listJobs();
      if (requestId === latestRequest.current) dispatch({ type: "loaded", jobs });
    } catch (err) {
      if (requestId === latestRequest.current) dispatch({ type: "loadFailed", error: messageOf(err) });
    }
  }, []);

  // Initial load, periodic polling while the tab is visible, and an immediate
  // refresh when the user comes back to the tab — so a second tab doesn't sit
  // on stale data for long.
  useEffect(() => {
    void refresh();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  /**
   * Applies what the server told us after a failed mutation, so the UI converges
   * to the real state instead of showing what this tab *thought* was true.
   */
  const reconcile = useCallback((err: unknown, id: string) => {
    if (err instanceof ApiError) {
      if (err.status === 404) dispatch({ type: "removed", id });
      else if (err.job) dispatch({ type: "upsert", job: err.job });
    }
  }, []);

  const createJob = useCallback(async (input: { title: string; type: string }) => {
    const job = await api.createJob(input);
    dispatch({ type: "upsert", job });
    return job;
  }, []);

  // Deliberately not optimistic: a status change can lose a race with another
  // tab, and showing "running" before the server agrees would be misleading.
  const updateStatus = useCallback(
    async (id: string, status: JobStatus) => {
      try {
        const job = await api.updateStatus(id, status);
        dispatch({ type: "upsert", job });
      } catch (err) {
        reconcile(err, id);
        throw err;
      }
    },
    [reconcile],
  );

  const deleteJob = useCallback(
    async (id: string) => {
      try {
        await api.deleteJob(id);
        dispatch({ type: "removed", id });
      } catch (err) {
        reconcile(err, id);
        throw err;
      }
    },
    [reconcile],
  );

  return { ...state, refresh, createJob, updateStatus, deleteJob };
}
