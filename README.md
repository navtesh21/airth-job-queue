# Mini Job Queue Dashboard

A small dashboard for creating jobs and moving them through their lifecycle. The backend is NestJS with PostgreSQL, and the frontend is Next.js (React).

- Frontend: _TODO_
- API: _TODO_ (`/health` to check it's up)

The repo has two apps: `backend/` (NestJS + TypeORM) and `frontend/` (Next.js). `render.yaml` at the root is the Render config for the API.

## Running it locally

You'll need Node 20 or newer.

Backend:

```bash
cd backend
npm install
npm run start:dev    # http://localhost:3000
npm test
```

If `DATABASE_URL` isn't set, the API uses a local SQLite file, so you don't need to install Postgres to try it. In production it runs on PostgreSQL. Migrations run automatically when the app starts. All env variables are listed in `backend/.env.example`.

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local    # points to http://localhost:3000
npm run dev -- -p 3001
```

## API

```
POST   /jobs                 create a job        { "title": "...", "type": "..." }
GET    /jobs?status=running  list jobs (status filter is optional)
GET    /jobs/:id             get one job
PATCH  /jobs/:id/status      change status       { "status": "running" }
DELETE /jobs/:id             delete a job
GET    /jobs/:id/events      event history of a job
GET    /jobs/:id/replay      rebuild the job from its events and check it
GET    /events?limit=20      recent events across all jobs
GET    /health
```

A job looks like this:

```json
{
  "id": "2f76d608-c724-4f2d-8f62-e37b238bf056",
  "title": "Nightly backup",
  "type": "cleanup",
  "status": "pending",
  "version": 1,
  "createdAt": "2026-09-16T09:22:31.000Z",
  "updatedAt": "2026-09-16T09:22:31.000Z"
}
```

Validation:

- Unknown fields are rejected, so you can't create a job with `status: "completed"` or set your own `id`.
- `title` (max 200) and `type` (max 50) are trimmed and can't be empty.
- `status` has to be one of `pending`, `running`, `completed`, `failed`.
- Bad ids get a 400, not a database error.
- The database also has a CHECK constraint on `status`, as a fallback.

When a status change or delete isn't allowed, the API returns 409 with a `code` (`INVALID_TRANSITION`, `STATUS_ALREADY_SET`, `CONCURRENT_MODIFICATION` or `JOB_RUNNING`) and the job as it currently is on the server. The frontend uses that to fix its own view without refetching.

## Status transitions and the two-tabs problem

```
pending → running → completed
                  ↘ failed
```

Where is the rule enforced? On the server. The frontend knows the rules too, but only to decide which buttons to show. If someone skips the UI and calls the API with curl, they get the same 409 as the UI would. The rules are defined once, in `backend/src/jobs/job-status.ts`.

What goes wrong with two tabs? The obvious implementation reads the job, checks the rule, then saves. If two requests come in at the same time, both read `pending`, both pass the check, and both save `running`. Both users get a success message, and in a real queue the job would run twice.

To prevent that, every job has a `version` number, and each write runs in a short transaction:

```sql
SELECT * FROM jobs WHERE id = $1;          -- pending, version 1
-- check the transition is allowed

UPDATE jobs SET status = 'running', version = version + 1
WHERE id = $1 AND version = 1 AND status = 'pending';

-- 0 rows updated means someone else changed it first: roll back and return 409
INSERT INTO job_events (...) VALUES (...);
```

The UPDATE only matches if nobody changed the job since we read it. In Postgres the second request waits for the first one's row lock. When it continues, the version is already 2, so it updates nothing and gets a 409. Only one request can win, and this still holds with several API instances, because the database handles it.

There's a test for this. It fires 10 identical requests at once and expects one 200, nine 409s and exactly one new event. Delete works the same way, and running jobs can't be deleted.

On the frontend, status changes aren't optimistic. The row only updates after the server confirms. If a tab loses the race, it shows the job's real status from the 409 response along with a message. Buttons are disabled while a request is in flight. The list also refreshes every 10 seconds and whenever you come back to the tab, so a second tab doesn't show old data for long.

## Event log and replay

This is the extra part I added. Every change is saved as an event in a `job_events` table. Events are only ever added, never updated or deleted. There are three kinds: `JobCreated`, `JobStatusChanged` and `JobDeleted`. Each one has a sequence number per job, the old and new status, and a time.

`GET /jobs/:id/replay` rebuilds a job using only its events and checks every step against the transition rules. It then compares the result with the row in the `jobs` table and lists any mismatches. For example, if someone edits a job's status directly in the database, replay reports it. In the UI, each job has a History button with a "Verify by replay" option, and there's a recent activity list at the bottom.

Some choices I made:

- I didn't go with full event sourcing. The `jobs` table still stores the current state, so listing and filtering stay simple. The events are the history, and replay checks that the two agree.
- The event is written in the same transaction as the change. Otherwise a crash between the two writes could leave a job whose history doesn't match its state.
- `version` is the number of events the job has. It works as the concurrency check and as the next event's sequence number. There's also a unique constraint on `(jobId, sequence)`, so two requests can never both save event #2.
- Events have no foreign key to jobs, so deleting a job keeps its history.
- The migration that adds events also creates a history for jobs that already existed.

## Bonus: rate limiting

The API is public and has no auth, so anyone can script against it. I added `@nestjs/throttler` with a limit of 120 requests per minute per IP (configurable with `RATE_LIMIT_PER_MINUTE`). That way a buggy client or someone spamming `POST /jobs` can't fill the database or slow things down for everyone else. It's only a few lines in NestJS. I also added `/health`, which checks the database connection, so Render can restart the service if it breaks.

## Assumptions and trade-offs

- NestJS doesn't run well on serverless edge platforms like Cloudflare Workers, so the API is a normal Node service on Render. The frontend is on Vercel.
- It runs on SQLite locally and PostgreSQL in production. The migrations work on both, and `synchronize` is turned off.
- `type` is free text, since the brief doesn't list job types. The form suggests a few.
- Nothing can move back to `pending`. To retry, you create a new job.
- A running job can't be deleted.
- Counts and filtering are done on the frontend from a single `GET /jobs`, which is fine at this size. The API still supports `?status=`.
- I used plain React state (`useReducer` in a custom hook) instead of Redux or React Query, because the state is small.

## What I'd do with more time

- Push updates to other tabs with Server-Sent Events instead of polling
- Add authentication, and record who made each change in the events
- Paginate the job list, and add a stats endpoint that counts with SQL
- Idempotency keys on `POST /jobs`, so a retried request doesn't create a duplicate
- Frontend tests, and CI that runs the backend tests against real Postgres
- Swagger docs

## Deployment

- Database: Neon (free Postgres)
- API: Render, using `render.yaml`. Set `DATABASE_URL` and `CORS_ORIGIN`.
- Frontend: Vercel with root directory `frontend`. Set `NEXT_PUBLIC_API_URL` to the API URL.

Render's free tier sleeps when idle, so the first request can take around 30 seconds.
