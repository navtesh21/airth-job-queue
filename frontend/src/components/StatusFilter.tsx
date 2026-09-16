import { JOB_STATUSES, type JobStatus } from "@/lib/types";

export type Filter = JobStatus | "all";

interface Props {
  counts: Record<JobStatus, number>;
  total: number;
  value: Filter;
  onChange: (filter: Filter) => void;
}

/** Status counts double as the filter controls. */
export function StatusFilter({ counts, total, value, onChange }: Props) {
  const options: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: total },
    ...JOB_STATUSES.map((s) => ({ key: s, label: s, count: counts[s] })),
  ];

  return (
    <div className="filters" role="group" aria-label="Filter jobs by status">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`filter filter-${o.key}`}
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
        >
          <span className="filter-count">{o.count}</span>
          <span className="filter-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
