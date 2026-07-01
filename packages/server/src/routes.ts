import { Router, Request, Response, static as expressStatic } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { Phase, WsMessageType } from '@argus/shared';
import type { ArgusConfig, WsEnvelope } from '@argus/shared';
import type { PhaseMachine } from './phase.js';
import type { Registry } from './registry.js';
import type { WsHub } from './ws-hub.js';
import type { StorageProvider } from './storage.js';
import type { Orchestrator } from './orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RouteDeps {
  phaseMachine: PhaseMachine;
  registry: Registry;
  wsHub: WsHub;
  orchestrator?: Orchestrator;
  config: ArgusConfig;
  sessionId: string;
  startTime: number;
  uploadDir: string;
  storage: StorageProvider;
}

/**
 * Creates an Express Router with all ARGUS REST API routes.
 *
 * Auth model:
 * - Operator endpoints require `X-Operator-Key` header (default: 'argus-operator')
 * - Upload endpoint requires `X-Session-Token` header matching a registered node's token
 * - No external auth (local network trust model)
 */
export function createRoutes(deps: RouteDeps): Router {
  const { phaseMachine, registry, wsHub, orchestrator, config, sessionId, startTime, uploadDir, storage } = deps;
  const router = Router();

  const operatorKey = process.env.ARGUS_OPERATOR_KEY ?? 'argus-operator';

  // --- Multer setup for file uploads ---
  const upload = multer({
    dest: uploadDir,
    limits: { fileSize: config.upload.maxSizeMb * 1024 * 1024 },
  });

  // --- Middleware helpers ---

  function requireOperatorKey(req: Request, res: Response): boolean {
    const key = req.headers['x-operator-key'];
    if (key !== operatorKey) {
      res.status(401).json({ error: 'Invalid or missing operator key' });
      return false;
    }
    return true;
  }

  // --- Health & Session ---

  router.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      phase: phaseMachine.getCurrentPhase(),
      nodeCount: registry.getNodeCount(),
      uptime: Date.now() - startTime,
    });
  });

  router.get('/api/session', (_req: Request, res: Response) => {
    res.json({
      sessionId,
      phase: phaseMachine.getCurrentPhase(),
      config,
    });
  });

  // --- Node management (operator key required) ---

  router.get('/api/nodes', (req: Request, res: Response) => {
    if (!requireOperatorKey(req, res)) return;
    res.json(registry.getAllNodes());
  });

  router.post('/api/operator/phase', (req: Request, res: Response) => {
    if (!requireOperatorKey(req, res)) return;

    const { phase, force } = req.body as { phase?: string; force?: boolean };

    // Kill switch: force=true triggers immediate IDLE reset
    if (force && orchestrator) {
      orchestrator.killSwitch();
      res.json({ phase: Phase.IDLE });
      return;
    }

    if (!phase || !Object.values(Phase).includes(phase as Phase)) {
      res.status(400).json({ error: 'Invalid phase value' });
      return;
    }

    const result = phaseMachine.advance(phase as Phase);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Broadcast phase change via WebSocket
    const envelope: WsEnvelope = {
      type: WsMessageType.PHASE_CHANGE,
      sessionId,
      ts: Date.now(),
      payload: { phase },
    };
    wsHub.broadcast(envelope);

    // Trigger orchestrator side effects for the new phase
    if (orchestrator) {
      orchestrator.onPhaseChange(phase as Phase);
    }

    res.json({ phase });
  });

  router.post('/api/operator/kick/:nodeId', (req: Request, res: Response) => {
    if (!requireOperatorKey(req, res)) return;

    const { nodeId } = req.params;
    const removed = registry.removeNode(nodeId, phaseMachine.getCurrentPhase());
    if (!removed) {
      res.status(404).json({ error: 'Node not found', success: false });
      return;
    }

    // Remove WebSocket connection
    wsHub.removeConnection(nodeId);

    // Broadcast node disconnection
    const envelope: WsEnvelope = {
      type: WsMessageType.NODE_DISCONNECTED,
      sessionId,
      ts: Date.now(),
      payload: { nodeId },
    };
    wsHub.broadcast(envelope);

    res.json({ success: true });
  });

  // --- Registration ---

  router.post('/api/register', (req: Request, res: Response) => {
    // Phase guard: registration only during REGISTER phase
    if (phaseMachine.getCurrentPhase() !== Phase.REGISTER) {
      res.status(400).json({ error: 'Registration is only allowed during REGISTER phase' });
      return;
    }

    const { ip, userAgent, deviceType, capabilities } = req.body as {
      ip?: string;
      userAgent?: string;
      deviceType?: 'android' | 'ios';
      capabilities?: { camera: boolean; ble: boolean; gyroscope: boolean };
    };

    if (!ip || !userAgent || !deviceType || !capabilities) {
      res.status(400).json({ error: 'Missing required fields: ip, userAgent, deviceType, capabilities' });
      return;
    }

    if (deviceType !== 'android' && deviceType !== 'ios') {
      res.status(400).json({ error: 'deviceType must be "android" or "ios"' });
      return;
    }

    const node = registry.register(ip, userAgent, deviceType, capabilities);

    // Broadcast new node registration
    const envelope: WsEnvelope = {
      type: WsMessageType.NODE_REGISTERED,
      sessionId,
      ts: Date.now(),
      payload: node,
    };
    wsHub.broadcast(envelope);

    res.status(201).json(node);
  });

  // --- Upload (session token required) ---

  router.post('/upload/:nodeId', upload.single('file'), async (req: Request, res: Response) => {
    const { nodeId } = req.params;
    const token = req.headers['x-session-token'] as string | undefined;

    // Validate node exists
    const node = registry.getNode(nodeId);
    if (!node) {
      res.status(404).json({ error: 'Node not found', success: false });
      return;
    }

    // Validate session token
    if (!token || token !== node.sessionToken) {
      res.status(401).json({ error: 'Invalid or missing session token', success: false });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded', success: false });
      return;
    }

    // Use storage provider to persist the file (local filesystem or S3)
    const fileKey = `${nodeId}/${req.file.originalname || req.file.filename}`;
    const fileData = fs.readFileSync(req.file.path);
    const storedPath = await storage.saveFile(fileKey, fileData);

    res.json({ success: true, path: storedPath });
  });

  // --- Composite retrieval ---

  router.get('/composite/:sessionId', async (req: Request, res: Response) => {
    const requestedSessionId = req.params.sessionId;
    const compositeKey = `${requestedSessionId}-composite.png`;

    // Use storage provider to check/retrieve composite (works in both local and cloud mode)
    const fileExists = await storage.exists(compositeKey);
    if (!fileExists) {
      res.status(404).json({ error: 'Composite not found' });
      return;
    }

    const data = await storage.getFile(compositeKey);
    if (!data) {
      res.status(404).json({ error: 'Composite not found' });
      return;
    }

    res.setHeader('Content-Type', 'image/png');
    res.send(data);
  });

  // --- Client SPA serving ---
  // In local mode: Express serves static assets directly
  // In cloud mode: CloudFront serves assets; server only handles API/WebSocket
  // Client code is identical in both modes — the serving mechanism changes.

  if (!config.aws.enabled) {
    const clientRegisterDist = path.resolve(__dirname, '../../client-register/dist');
    const clientBmsDist = path.resolve(__dirname, '../../client-bms/dist');

    // Serve BMS SPA at /bms (static assets + SPA fallback)
    router.use('/bms', expressStatic(clientBmsDist));
    router.get('/bms', (_req: Request, res: Response) => {
      const indexPath = path.join(clientBmsDist, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('BMS client not built');
      }
    });
    router.get('/bms/*', (_req: Request, res: Response) => {
      const indexPath = path.join(clientBmsDist, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('BMS client not built');
      }
    });

    // Serve registration client SPA at / (static assets only)
    router.use(expressStatic(clientRegisterDist));
  }

  return router;
}
