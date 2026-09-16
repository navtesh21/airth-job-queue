# Job Queue Dashboard

A small app for managing jobs. You can create a job, move it through its statuses, delete it, and see the full history of changes for any job.

- Live app: https://airth-job-queue-eight.vercel.app
- API: https://airth-job-queue-1f4e.onrender.com (the API is on Render's free plan, which sleeps when idle, so the first request can take about 30 seconds)

## Stack

- `backend/`: NestJS, TypeORM, PostgreSQL
- `frontend/`: Next.js (React)

## Running locally

Requires Node 20+.

```bash
cd backend
npm install
npm run start:dev      # API on http://localhost:3000
npm test               # run the tests
```

Locally the backend uses a SQLite file, so there's no database to set up. Set `DATABASE_URL` to use PostgreSQL instead. The tables are created by migrations when the app starts.

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev -- -p 3001  # app on http://localhost:3001
```

## API

```
POST   /jobs                 create a job        { "title": "...", "type": "..." }
GET    /jobs?status=running  list jobs (status is optional)
GET    /jobs/:id             get one job
PATCH  /jobs/:id/status      change status       { "status": "running" }
DELETE /jobs/:id             delete a job
GET    /jobs/:id/events      history of a job
GET    /jobs/:id/replay      rebuild a job from its history and check it
GET    /events               recent changes across all jobs
GET    /health               check the API and database are up
```

Invalid input returns `400`, a missing job returns `404`, and a change that isn't allowed returns `409`. A 409 response includes the job's current state, so the frontend can update what it shows.

## Job statuses

```
pending → running → completed
                  ↘ failed
```

New jobs always start as `pending`. `completed` and `failed` are final. A job can't be deleted while it's `running`.

The server enforces these rules. The frontend only uses them to decide which buttons to show. Calling the API directly (with curl, for example) gets the same result as using the UI.

## Handling two requests at the same time

Say two browser tabs both show a job as `pending`, and both click "Start" at the same moment. If the server simply reads the job, checks the rule and then saves, both requests see `pending`, both pass the check, and both succeed. The job gets started twice.

To prevent this, each job has a `version` number that goes up on every change. The update only goes through if the version is still the one the request read:

```sql
UPDATE jobs SET status = 'running', version = version + 1
WHERE id = $1 AND version = 1 AND status = 'pending';
```

The database runs this as a single step. The first request updates the row. The second one finds the version already changed, updates nothing, and gets a `409`. That tab then shows the job's real status. A test sends 10 of these requests at once and checks that exactly one succeeds.

## Job history (event log)

Every change is saved as an event in a `job_events` table: when the job was created, each status change, and when it was deleted. Events are never edited or removed, and a deleted job keeps its history.

Each event is saved in the same database transaction as the change it describes, so the history always matches the job.

`GET /jobs/:id/replay` rebuilds a job from its events alone, checks each step against the status rules, and compares the result with the stored job. If they don't match (for example, someone changed the database by hand), it lists what's wrong. In the UI, open a job's **History** and click **Verify by replay**.

## Rate limiting

The API is public and has no login, so it limits each IP address to 120 requests per minute. This stops a buggy script or someone spamming requests from filling the database or slowing the app down for everyone else.

## Assumptions and trade-offs

- A job's `type` is free text, because the brief doesn't define a list of types.
- Nothing can move back to `pending`. To retry a job, create a new one.
- The jobs table still stores each job's current state, and the event log sits beside it. I didn't use full event sourcing, which would rebuild every job from its events on each read. That keeps listing and filtering simple.
- Status counts and filtering are done in the browser from one list request. That's fine for a small number of jobs.
- Other tabs pick up changes by refreshing every 10 seconds, not instantly.

## What I'd add with more time

- Instant updates across tabs (Server-Sent Events)
- Login, and recording who made each change
- Pagination for the job list
- Frontend tests
