"use client";

import { useState, type FormEvent } from "react";

const TITLE_MAX = 200;
const TYPE_MAX = 50;
const SUGGESTED_TYPES = ["email", "report", "image-processing", "data-sync", "cleanup"];

interface Props {
  onCreate: (input: { title: string; type: string }) => Promise<unknown>;
}

export function CreateJobForm({ onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedTitle = title.trim();
  const trimmedType = type.trim();
  const canSubmit = trimmedTitle.length > 0 && trimmedType.length > 0 && !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return; // also guards against double-submit

    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ title: trimmedTitle, type: trimmedType });
      setTitle("");
      setType("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create job.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card create-form" onSubmit={handleSubmit}>
      <h2>New job</h2>
      <div className="form-row">
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            placeholder="Generate monthly report"
            required
          />
        </label>
        <label>
          Type
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            maxLength={TYPE_MAX}
            placeholder="report"
            list="job-types"
            required
          />
          <datalist id="job-types">
            {SUGGESTED_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <button type="submit" className="primary" disabled={!canSubmit}>
          {submitting ? "Creating…" : "Create job"}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
