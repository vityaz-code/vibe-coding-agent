process.env.ENABLE_MOCK_AUTH = 'true';
import request from 'supertest';
import { app } from './server';
import { getDatabase, resetDatabase } from './db';
import { validateTelegramInitData } from './telegramAuth';
import { generateGraph } from './graph';
import * as crypto from 'crypto';

describe('Lite Visual Composer Integration Test Suite', () => {
  beforeEach(() => {
    // Fresh slate before every test
    resetDatabase();
  });

  // --- 1. Telegram initData validation ---
  describe('Telegram Authentication Verification', () => {
    test('Should reject requests with missing headers', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('header is missing');
    });

    test('Should reject requests with invalid signature hashes', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('x-telegram-init-data', 'auth_date=1234&hash=badhash');
      expect(res.status).toBe(401);
    });

    test('Should allow mock authorization if ENABLE_MOCK_AUTH is set to true', async () => {
      // By default mock is enabled in development test env
      const res = await request(app)
        .get('/api/projects')
        .set('x-telegram-init-data', 'mock_1111_owner');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3); // user_1 (1111) has access to projects 1, 2, 3
    });

    test('Should reject expired real cryptographic signatures', () => {
      const botToken = 'mock_bot_token';
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

      const authDate = Math.floor(Date.now() / 1000) - 90000; // Expired 25 hours ago
      const dataCheckString = `auth_date=${authDate}\nuser={"id":1111,"first_name":"Jules"}`;
      const hash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      const rawInitData = `auth_date=${authDate}&user={"id":1111,"first_name":"Jules"}&hash=${hash}`;
      const check = validateTelegramInitData(rawInitData, botToken, false);

      expect(check.valid).toBe(false);
      expect(check.error).toBe('Authentication signature has expired.');
    });
  });

  // --- 2. Project isolation & Cross-project access ---
  describe('Workspace Isolation & Membership Access Guard', () => {
    test('User 1 (1111) should read and write authorized projects (proj-1, proj-2, proj-3)', async () => {
      const res = await request(app)
        .get('/api/projects/proj-1')
        .set('x-telegram-init-data', 'mock_1111_owner');
      expect(res.status).toBe(200);
      expect(res.body.project.id).toBe('proj-1');
    });

    test('User 1 (1111) must be rejected with 403 when trying to access Project 4 (proj-4)', async () => {
      const res = await request(app)
        .get('/api/projects/proj-4')
        .set('x-telegram-init-data', 'mock_1111_owner');
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('You are not authorized');
    });

    test('User 2 (2222) must be rejected with 403 when trying to access Project 1 (proj-1)', async () => {
      const res = await request(app)
        .get('/api/projects/proj-1')
        .set('x-telegram-init-data', 'mock_2222_owner');
      expect(res.status).toBe(403);
    });

    test('SSE Stream must reject unauthorized project subscription', async () => {
      const res = await request(app)
        .get('/api/projects/proj-4/events?initData=mock_1111_owner');
      expect(res.status).toBe(403);
    });
  });

  // --- 3. State machine transitions & Revision Failed safety ---
  describe('State Machine & Revision Control', () => {
    test('Should reject invalid state transitions', async () => {
      // Transitioning directly from draft -> deployed is forbidden
      const res = await request(app)
        .post('/api/projects/proj-1/state')
        .set('x-telegram-init-data', 'mock_1111_owner')
        .send({ state: 'deployed' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('is not allowed');
    });

    test('Failed candidate revisions must never replace the active working revision', async () => {
      const headers = { 'x-telegram-init-data': 'mock_1111_owner' };

      // Initialize workspace state by checking current active working revision
      const res1 = await request(app).get('/api/projects/proj-1').set(headers);
      const activeRevBefore = res1.body.project.activeRevisionId;
      expect(activeRevBefore).toBe('rev-proj-1-1');

      // Add a module that causes validation failure (e.g. Booking without Auth)
      await request(app)
        .post('/api/projects/proj-1/ai/tool')
        .set(headers)
        .send({ tool: 'addModule', arguments: { moduleId: 'booking' } });

      // Run validate project tool. This will fail because Auth module is missing for booking.
      const validateRes = await request(app)
        .post('/api/projects/proj-1/ai/tool')
        .set(headers)
        .send({ tool: 'validateProject', arguments: {} });

      expect(validateRes.status).toBe(400);
      expect(validateRes.body.message).toContain('Validation failed');

      // Assert that active revision remains unchanged (has not been replaced with the failed spec)
      const res2 = await request(app).get('/api/projects/proj-1').set(headers);
      expect(res2.body.project.activeRevisionId).toBe('rev-proj-1-2'); // Revision 2 was the successful addModule, not the failed validation!
    });

    test('Optimistic concurrency locking check', async () => {
      const headers = { 'x-telegram-init-data': 'mock_1111_owner' };

      const getProj = await request(app).get('/api/projects/proj-1').set(headers);
      const currentVersion = getProj.body.currentRevisionNumber;

      // Try saving spec with obsolete expected version
      const badSave = await request(app)
        .post('/api/projects/proj-1/spec')
        .set(headers)
        .send({
          spec: { name: 'Conflict Spec', modules: [] },
          expectedRevisionNumber: currentVersion - 1
        });

      expect(badSave.status).toBe(409);
      expect(badSave.body.error).toContain('Optimistic Locking Conflict');
    });
  });

  // --- 4. Manifest-driven graph snapshots ---
  describe('Deterministic Manifest-driven Graph Compiler', () => {
    test('Should produce identical graphs for identical AppSpec manifests', () => {
      const spec1 = {
        name: 'Workspace 1',
        version: '1.0.0',
        modules: [
          { id: 'inst-auth', moduleId: 'auth', name: 'Auth', config: {}, status: 'ready' as const },
          { id: 'inst-booking', moduleId: 'booking', name: 'Booking', config: {}, status: 'ready' as const }
        ],
        moduleConnections: [],
        functions: [],
        functionConnections: [],
        approvalMode: 'manual' as const
      };

      const graph1 = generateGraph(spec1);
      const graph2 = generateGraph(spec1);

      // Verify determinism
      expect(graph1).toEqual(graph2);
      expect(graph1.functions.some(f => f.name.includes('login'))).toBe(true);
      expect(graph1.functions.some(f => f.name.includes('booking'))).toBe(true);
    });
  });

  // --- 5. AI Controller Restrictions ---
  describe('AI Controller Tool Enforcements', () => {
    test('Should reject forbidden operations or uncertified tools', async () => {
      const headers = { 'x-telegram-init-data': 'mock_1111_owner' };

      const forbiddenRes = await request(app)
        .post('/api/projects/proj-1/ai/tool')
        .set(headers)
        .send({
          tool: 'executeShell',
          arguments: { command: 'rm -rf /' }
        });

      expect(forbiddenRes.status).toBe(400);
      expect(forbiddenRes.body.message).toContain('is not in the allowed tool allowlist');
    });

    test('Should reject cross-project data inspection requests', async () => {
      const headers = { 'x-telegram-init-data': 'mock_1111_owner' };

      const badInspection = await request(app)
        .post('/api/projects/proj-1/ai/tool')
        .set(headers)
        .send({
          tool: 'inspectProject',
          arguments: { projectId: 'proj-4' } // project 4 is outside user_1 workspace access!
        });

      expect(badInspection.status).toBe(400);
      expect(badInspection.body.message).toContain('Security Rejection');
    });
  });
});
