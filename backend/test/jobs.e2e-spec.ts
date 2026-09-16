import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

process.env.SQLITE_PATH = ':memory:';
process.env.RATE_LIMIT_PER_MINUTE = '100000';
delete process.env.DATABASE_URL;

describe('Jobs API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    // Imported lazily so the env vars above are applied before module metadata is evaluated.
    const { AppModule } = await import('../src/app.module');
    const { setupApp } = await import('../src/setup-app');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  const createJob = async (body = { title: 'Resize images', type: 'image' }) => {
    const res = await http.post('/jobs').send(body).expect(201);
    return res.body as { id: string; status: string };
  };

  describe('POST /jobs', () => {
    it('creates a pending job with server-generated fields', async () => {
      const res = await http.post('/jobs').send({ title: '  Send emails  ', type: 'email' }).expect(201);
      expect(res.body).toMatchObject({ title: 'Send emails', type: 'email', status: 'pending' });
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.createdAt).toEqual(expect.any(String));
    });

    it.each([
      [{}],
      [{ title: '', type: 'email' }],
      [{ title: '   ', type: 'email' }],
      [{ title: 'x'.repeat(201), type: 'email' }],
      [{ title: 123, type: 'email' }],
      [{ title: 'ok' }],
    ])('rejects invalid body %j', async (body) => {
      await http.post('/jobs').send(body).expect(400);
    });

    it('rejects client-controlled status (cannot create a job as completed)', async () => {
      await http.post('/jobs').send({ title: 'Hack', type: 'x', status: 'completed' }).expect(400);
    });
  });

  describe('GET /jobs', () => {
    it('lists jobs and filters by status', async () => {
      const job = await createJob();
      await http.patch(`/jobs/${job.id}/status`).send({ status: 'running' }).expect(200);

      const all = await http.get('/jobs').expect(200);
      expect(all.body.length).toBeGreaterThan(0);

      const running = await http.get('/jobs?status=running').expect(200);
      expect(running.body.every((j: { status: string }) => j.status === 'running')).toBe(true);
      expect(running.body.map((j: { id: string }) => j.id)).toContain(job.id);
    });

    it('rejects an unknown status filter', async () => {
      await http.get('/jobs?status=exploded').expect(400);
    });
  });

  describe('PATCH /jobs/:id/status', () => {
    it('follows the full happy path pending -> running -> completed', async () => {
      const job = await createJob();
      await http.patch(`/jobs/${job.id}/status`).send({ status: 'running' }).expect(200);
      const res = await http.patch(`/jobs/${job.id}/status`).send({ status: 'completed' }).expect(200);
      expect(res.body.status).toBe('completed');
    });

    it('rejects skipping a state (pending -> completed)', async () => {
      const job = await createJob();
      const res = await http.patch(`/jobs/${job.id}/status`).send({ status: 'completed' }).expect(409);
      expect(res.body.code).toBe('INVALID_TRANSITION');
      expect(res.body.job.status).toBe('pending');
    });

    it('does not let a terminal job become running again', async () => {
      const job = await createJob();
      await http.patch(`/jobs/${job.id}/status`).send({ status: 'running' }).expect(200);
      await http.patch(`/jobs/${job.id}/status`).send({ status: 'failed' }).expect(200);
      const res = await http.patch(`/jobs/${job.id}/status`).send({ status: 'running' }).expect(409);
      expect(res.body.code).toBe('INVALID_TRANSITION');
    });

    it('rejects an unknown status value', async () => {
      const job = await createJob();
      await http.patch(`/jobs/${job.id}/status`).send({ status: 'done' }).expect(400);
    });

    it('returns 400 for a malformed id and 404 for a missing job', async () => {
      await http.patch('/jobs/not-a-uuid/status').send({ status: 'running' }).expect(400);
      await http
        .patch('/jobs/00000000-0000-4000-8000-000000000000/status')
        .send({ status: 'running' })
        .expect(404);
    });

    it('lets exactly one of many simultaneous pending -> running requests win', async () => {
      const job = await createJob();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => http.patch(`/jobs/${job.id}/status`).send({ status: 'running' })),
      );

      const statuses = responses.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(9);
      for (const loser of responses.filter((r) => r.status === 409)) {
        expect(loser.body.code).toBe('STATUS_ALREADY_SET');
      }
    });

    it('lets only one of racing completed/failed requests win', async () => {
      const job = await createJob();
      await http.patch(`/jobs/${job.id}/status`).send({ status: 'running' }).expect(200);

      const [a, b] = await Promise.all([
        http.patch(`/jobs/${job.id}/status`).send({ status: 'completed' }),
        http.patch(`/jobs/${job.id}/status`).send({ status: 'failed' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });
  });

  describe('DELETE /jobs/:id', () => {
    it('deletes a job', async () => {
      const job = await createJob();
      await http.delete(`/jobs/${job.id}`).expect(204);
      await http.get(`/jobs/${job.id}`).expect(404);
      await http.delete(`/jobs/${job.id}`).expect(404);
    });

    it('refuses to delete a running job', async () => {
      const job = await createJob();
      await http.patch(`/jobs/${job.id}/status`).send({ status: 'running' }).expect(200);
      const res = await http.delete(`/jobs/${job.id}`).expect(409);
      expect(res.body.code).toBe('JOB_RUNNING');
    });
  });

  describe('event log & replay', () => {
    const patch = (id: string, status: string) => http.patch(`/jobs/${id}/status`).send({ status });

    it('records one event per change, in order, and replays consistently', async () => {
      const job = await createJob({ title: 'Nightly backup', type: 'cleanup' });
      await patch(job.id, 'running').expect(200);
      const done = await patch(job.id, 'completed').expect(200);
      expect(done.body.version).toBe(3);

      const events = await http.get(`/jobs/${job.id}/events`).expect(200);
      expect(events.body.map((e: { sequence: number; eventType: string; fromStatus: string; toStatus: string }) => [
        e.sequence,
        e.eventType,
        e.fromStatus,
        e.toStatus,
      ])).toEqual([
        [1, 'JobCreated', null, 'pending'],
        [2, 'JobStatusChanged', 'pending', 'running'],
        [3, 'JobStatusChanged', 'running', 'completed'],
      ]);
      expect(events.body[0].payload).toEqual({ title: 'Nightly backup', type: 'cleanup' });

      const replay = await http.get(`/jobs/${job.id}/replay`).expect(200);
      expect(replay.body).toMatchObject({
        consistent: true,
        problems: [],
        eventCount: 3,
        replayed: { status: 'completed', version: 3, deleted: false },
      });
    });

    it('does not record events for rejected requests', async () => {
      const job = await createJob();
      await patch(job.id, 'completed').expect(409);
      await patch(job.id, 'bogus').expect(400);
      const events = await http.get(`/jobs/${job.id}/events`).expect(200);
      expect(events.body).toHaveLength(1);
    });

    it('records exactly one event when many requests race', async () => {
      const job = await createJob();
      await Promise.all(Array.from({ length: 10 }, () => patch(job.id, 'running')));

      const events = await http.get(`/jobs/${job.id}/events`).expect(200);
      expect(events.body).toHaveLength(2);
      const replay = await http.get(`/jobs/${job.id}/replay`).expect(200);
      expect(replay.body.consistent).toBe(true);
    });

    it('keeps the history of a deleted job', async () => {
      const job = await createJob();
      await http.delete(`/jobs/${job.id}`).expect(204);

      const events = await http.get(`/jobs/${job.id}/events`).expect(200);
      expect(events.body.map((e: { eventType: string }) => e.eventType)).toEqual(['JobCreated', 'JobDeleted']);

      const replay = await http.get(`/jobs/${job.id}/replay`).expect(200);
      expect(replay.body).toMatchObject({ consistent: true, stored: null, replayed: { deleted: true } });
    });

    it('detects a job whose row was changed outside the API', async () => {
      const job = await createJob();
      // Simulate a manual/buggy write that bypasses the service and the event log.
      await app.get(DataSource).query(`UPDATE jobs SET status = 'completed' WHERE id = ?`, [job.id]);

      const replay = await http.get(`/jobs/${job.id}/replay`).expect(200);
      expect(replay.body.consistent).toBe(false);
      expect(replay.body.problems).toContain('status mismatch: replayed pending, stored completed');
    });

    it('returns 404 for events of a job that never existed', async () => {
      await http.get('/jobs/00000000-0000-4000-8000-000000000000/events').expect(404);
      await http.get('/jobs/00000000-0000-4000-8000-000000000000/replay').expect(404);
    });

    it('serves a recent activity feed across jobs, newest first', async () => {
      const job = await createJob({ title: 'Feed check', type: 'report' });
      await patch(job.id, 'running').expect(200);

      const feed = await http.get('/events?limit=2').expect(200);
      expect(feed.body).toHaveLength(2);
      expect(feed.body[0]).toMatchObject({ jobId: job.id, eventType: 'JobStatusChanged', toStatus: 'running' });
      expect(feed.body[1]).toMatchObject({ jobId: job.id, eventType: 'JobCreated' });

      await http.get('/events?limit=0').expect(400);
      await http.get('/events?limit=abc').expect(400);
    });
  });
});
