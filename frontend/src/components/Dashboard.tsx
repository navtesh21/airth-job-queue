"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useJobs } from "@/hooks/useJobs";
import { JOB_STATUSES, type JobStatus } from "@/lib/types";
import { ActivityFeed } from "./ActivityFeed";
import { CreateJobForm } from "./CreateJobForm";
import { JobRow } from "./JobRow";
import { StatusFilter, type Filter } from "./StatusFilter";

export function Dashboard() {
  const { jobs, initialLoading, loadError, refresh, createJob, updateStatus, deleteJob } = useJobs();
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
    for (const job of jobs) c[job.status]++;
    return c;
  }, [jobs]);

  // Cheap fingerprint of the job list: changes on create, delete or any status change
  // (each bumps a version), so the activity feed refetches only when something happened.
  const revision = useMemo(() => jobs.map((j) => `${j.id}:${j.version}`).join(","), [jobs]);

  const visibleJobs = useMemo(
    () => (filter === "all" ? jobs : jobs.filter((j) => j.status === filter)),
    [jobs, filter],
  );

  // Auto-dismiss action errors after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const showError = useCallback((message: string) => setNotice(message), []);

  return (
    <main className="container">
      <header className="page-header">
        <div>
          <h1>Job Queue</h1>
          <p className="muted">Create jobs and move them through their lifecycle.</p>
        </div>
        <button type="button" onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      <CreateJobForm onCreate={createJob} />

      <StatusFilter counts={counts} total={jobs.length} value={filter} onChange={setFilter} />

      {notice && (
        <div className="banner banner-error" role="alert">
          <span>{notice}</span>
          <button type="button" className="link" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {loadError && !initialLoading && (
        <div className="banner banner-error" role="alert">
          <span>
            Failed to load jobs: {loadError}
            {jobs.length > 0 && " Showing the last loaded data."}
          </span>
          <button type="button" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <section className="card">
        {initialLoading ? (
          <p className="empty">Loading jobs…</p>
        ) : visibleJobs.length === 0 ? (
          <p className="empty">
            {loadError && jobs.length === 0
              ? "No data."
              : filter === "all"
                ? "No jobs yet. Create one above."
                : `No ${filter} jobs.`}
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibleJobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onChangeStatus={updateStatus}
                    onDelete={deleteJob}
                    onError={showError}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ActivityFeed revision={revision} />
    </main>
  );
}
