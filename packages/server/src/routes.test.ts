import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { createRoutes, type RouteDeps } from './routes';
import { PhaseMachine } from './phase';
import { Registry } from './registry';
import { Phase, defaultConfig } from '@argus/shared';
import type { WsHub } from './ws-hub';
import type { StorageProvider } from './storage';
import type { Server } from 'node:http';

function createTestApp(deps: RouteDeps) {
  const app = express();
  app.use(express.json());
  app.use(createRoutes(deps));
  return app;
}

function createDeps(overrides?: Partial<RouteDeps>): RouteDeps {
  const phaseMachine = new PhaseMachine();
  const registry = new Registry();
  const wsHub = {
    broadcast: vi.fn(),
    sendTo: vi.fn(),
    removeConnection: vi.fn(),
  } as unknown as WsHub;
  const storage: StorageProvider = {
    saveFile: vi.fn().mockResolvedValue('/tmp/test-path'),
    getFile: vi.fn().mockResolvedValue(null),
    exists: vi.fn().mockResolvedValue(false),
  };

  return {
    phaseMachine,
    registry,
    wsHub,
    storage,
    config: defaultConfig,
    sessionId: 'test-session-123',
    startTime: Date.now() - 5000,
    uploadDir: '/tmp/argus-test-uploads',
    ...overrides,
  };
}

async function req(
  app: ReturnType<typeof express>,
  method: string,
  urlPath: string,
  options?: { body?: unknown; headers?: Record<string, string> },
) {
  return new Promise<{ status: number; body: unknown }>((resolve) => {
    const server: Server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const url = `http://127.0.0.1:${port}${urlPath}`;

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers ?? {}),
        },
      };

      if (options?.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      fetch(url, fetchOptions)
        .then(async (res) => {
          const ct = res.headers.get('content-type') ?? '';
          const body = ct.includes('application/json') ? await res.json() : await res.text();
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          resolve({ status: 500, body: { error: String(err) } });
        });
    });
  });
}

describe('Routes', () => {
  describe('GET /healthz', () => {
    it('returns status ok with phase, nodeCount, and uptime', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'GET', '/healthz');

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.status).toBe('ok');
      expect(body.phase).toBe(Phase.IDLE);
      expect(body.nodeCount).toBe(0);
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /api/session', () => {
    it('returns sessionId, phase, and config', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'GET', '/api/session');

      expect(res.status).toBe(200);
      const body = res.body as Record<string, unknown>;
      expect(body.sessionId).toBe('test-session-123');
      expect(body.phase).toBe(Phase.IDLE);
      expect(body.config).toBeDefined();
    });
  });

  describe('GET /api/nodes', () => {
    it('returns 401 without operator key', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'GET', '/api/nodes');
      expect(res.status).toBe(401);
    });

    it('returns nodes with valid operator key', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'GET', '/api/nodes', {
        headers: { 'X-Operator-Key': 'argus-operator' },
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns registered nodes after registration', async () => {
      const deps = createDeps();
      deps.phaseMachine.advance(Phase.REGISTER);
      deps.registry.register('192.168.1.10', 'TestAgent/1.0', 'android', {
        camera: true, ble: true, gyroscope: true,
      });
      const app = createTestApp(deps);

      const res = await req(app, 'GET', '/api/nodes', {
        headers: { 'X-Operator-Key': 'argus-operator' },
      });
      expect(res.status).toBe(200);
      const nodes = res.body as Array<Record<string, unknown>>;
      expect(nodes).toHaveLength(1);
      expect(nodes[0].ip).toBe('192.168.1.10');
      expect(nodes[0].deviceType).toBe('android');
    });
  });

  describe('POST /api/operator/phase', () => {
    it('returns 401 without operator key', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'POST', '/api/operator/phase', {
        body: { phase: 'REGISTER' },
      });
      expect(res.status).toBe(401);
    });

    it('advances phase with valid operator key and valid transition', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'POST', '/api/operator/phase', {
        headers: { 'X-Operator-Key': 'argus-operator' },
        body: { phase: 'REGISTER' },
      });
      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).phase).toBe('REGISTER');
      expect(deps.phaseMachine.getCurrentPhase()).toBe(Phase.REGISTER);
    });

    it('broadcasts phase change via WebSocket', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      await req(app, 'POST', '/api/operator/phase', {
        headers: { 'X-Operator-Key': 'argus-operator' },
        body: { phase: 'REGISTER' },
      });
      expect(deps.wsHub.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PHASE_CHANGE',
          payload: { phase: 'REGISTER' },
        }),
      );
    });

    it('rejects invalid phase transition with 400', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'POST', '/api/operator/phase', {
        headers: { 'X-Operator-Key': 'argus-operator' },
        body: { phase: 'DEPLOY' },
      });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).error).toContain('Invalid transition');
    });

    it('rejects invalid phase value with 400', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'POST', '/api/operator/phase', {
        headers: { 'X-Operator-Key': 'argus-operator' },
        body: { phase: 'INVALID' },
      });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).error).toBe('Invalid phase value');
    });
  });

  describe('POST /api/operator/kick/:nodeId', () => {
    it('returns 401 without operator key', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'POST', '/api/operator/kick/some-node');
      expect(res.status).toBe(401);
    });

    it('returns 404 for non-existent node', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'POST', '/api/operator/kick/non-existent', {
        headers: { 'X-Operator-Key': 'argus-operator' },
      });
      expect(res.status).toBe(404);
    });

    it('kicks existing node and removes WebSocket connection', async () => {
      const deps = createDeps();
      deps.phaseMachine.advance(Phase.REGISTER);
      const node = deps.registry.register('192.168.1.10', 'TestAgent/1.0', 'android', {
        camera: true, ble: true, gyroscope: true,
      });
      const app = createTestApp(deps);

      const res = await req(app, 'POST', `/api/operator/kick/${node.nodeId}`, {
        headers: { 'X-Operator-Key': 'argus-operator' },
      });
      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).success).toBe(true);
      expect(deps.wsHub.removeConnection).toHaveBeenCalledWith(node.nodeId);
      expect(deps.registry.getNode(node.nodeId)).toBeUndefined();
    });
  });

  describe('POST /api/register', () => {
    it('rejects registration when not in REGISTER phase', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'POST', '/api/register', {
        body: {
          ip: '192.168.1.10',
          userAgent: 'TestAgent/1.0',
          deviceType: 'android',
          capabilities: { camera: true, ble: true, gyroscope: true },
        },
      });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).error).toContain('REGISTER phase');
    });

    it('registers a node during REGISTER phase', async () => {
      const deps = createDeps();
      deps.phaseMachine.advance(Phase.REGISTER);
      const app = createTestApp(deps);

      const res = await req(app, 'POST', '/api/register', {
        body: {
          ip: '192.168.1.10',
          userAgent: 'TestAgent/1.0',
          deviceType: 'android',
          capabilities: { camera: true, ble: true, gyroscope: true },
        },
      });
      expect(res.status).toBe(201);
      const body = res.body as Record<string, unknown>;
      expect(body.nodeId).toBeDefined();
      expect(body.ip).toBe('192.168.1.10');
      expect(body.deviceType).toBe('android');
      expect(body.sessionToken).toBeDefined();
    });

    it('broadcasts node registration via WebSocket', async () => {
      const deps = createDeps();
      deps.phaseMachine.advance(Phase.REGISTER);
      const app = createTestApp(deps);

      await req(app, 'POST', '/api/register', {
        body: {
          ip: '192.168.1.10',
          userAgent: 'TestAgent/1.0',
          deviceType: 'ios',
          capabilities: { camera: true, ble: false, gyroscope: true },
        },
      });
      expect(deps.wsHub.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'NODE_REGISTERED' }),
      );
    });

    it('rejects registration with missing fields', async () => {
      const deps = createDeps();
      deps.phaseMachine.advance(Phase.REGISTER);
      const app = createTestApp(deps);

      const res = await req(app, 'POST', '/api/register', {
        body: { ip: '192.168.1.10' },
      });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).error).toContain('Missing required fields');
    });

    it('rejects registration with invalid device type', async () => {
      const deps = createDeps();
      deps.phaseMachine.advance(Phase.REGISTER);
      const app = createTestApp(deps);

      const res = await req(app, 'POST', '/api/register', {
        body: {
          ip: '192.168.1.10',
          userAgent: 'TestAgent/1.0',
          deviceType: 'windows',
          capabilities: { camera: true, ble: true, gyroscope: true },
        },
      });
      expect(res.status).toBe(400);
      expect((res.body as Record<string, unknown>).error).toContain('deviceType');
    });
  });

  describe('POST /upload/:nodeId', () => {
    it('returns 404 for non-existent node', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'POST', '/upload/non-existent', {
        headers: { 'X-Session-Token': 'some-token' },
      });
      expect(res.status).toBe(404);
    });

    it('returns 401 with invalid session token', async () => {
      const deps = createDeps();
      deps.phaseMachine.advance(Phase.REGISTER);
      const node = deps.registry.register('192.168.1.10', 'TestAgent/1.0', 'android', {
        camera: true, ble: true, gyroscope: true,
      });
      const app = createTestApp(deps);

      const res = await req(app, 'POST', `/upload/${node.nodeId}`, {
        headers: { 'X-Session-Token': 'wrong-token' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /composite/:sessionId', () => {
    it('returns 404 when composite does not exist', async () => {
      const deps = createDeps();
      const app = createTestApp(deps);
      const res = await req(app, 'GET', '/composite/nonexistent-session');
      expect(res.status).toBe(404);
    });
  });
});
