import express from 'express';
import type { Express } from 'express';
import { createServer as createHttpServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { Server as HttpsServer } from 'node:https';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { defaultConfig, WsMessageType } from '@argus/shared';
import type { ArgusConfig, WsEnvelope } from '@argus/shared';
import { PhaseMachine } from './phase';
import { Registry } from './registry';
import { WsHub } from './ws-hub';
import { Stitcher } from './stitcher';
import { Orchestrator } from './orchestrator';
import { createRoutes } from './routes';
import { createStorage } from './storage';
import type { StorageProvider } from './storage';

export interface AppContext {
  app: Express;
  httpServer: HttpServer;
  httpsServer: HttpsServer | null;
  phaseMachine: PhaseMachine;
  registry: Registry;
  wsHub: WsHub;
  stitcher: Stitcher;
  orchestrator: Orchestrator;
  sessionId: string;
  startTime: number;
  config: ArgusConfig;
  storage: StorageProvider;
  shutdown: () => void;
}

/**
 * Creates the ARGUS Express application with all middleware, routes,
 * and WebSocket wiring. Exported for testability.
 */
export function createApp(): AppContext {
  const config = defaultConfig;
  const sessionId = randomUUID();
  const startTime = Date.now();
  const uploadDir = './uploads';

  // Ensure upload directory exists (used in local mode)
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }

  // Core components
  const phaseMachine = new PhaseMachine();
  const registry = new Registry();
  const wsHub = new WsHub(config.heartbeat);

  // Storage abstraction: local filesystem or S3 based on config.aws.enabled
  // Client code is identical in both modes — only the server-side backend changes.
  const storage: StorageProvider = createStorage(config, uploadDir);

  // Video stitcher pipeline
  const stitcher = new Stitcher(config.stitch);

  // Orchestrator: wires phase transitions to side effects (capture, stitch, kill)
  const orchestrator = new Orchestrator({
    phaseMachine,
    registry,
    wsHub,
    stitcher,
    config,
    sessionId,
  });

  // Express app
  const app = express();

  // Enable CORS for edge devices on different origins (CloudFront)
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Operator-Key, X-Session-Token');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json());

  // Attach routes
  const routes = createRoutes({
    phaseMachine,
    registry,
    wsHub,
    orchestrator,
    config,
    sessionId,
    startTime,
    uploadDir,
    storage,
  });
  app.use(routes);

  // Wire WsHub onDisconnect to registry removal + broadcast NODE_DISCONNECTED
  wsHub.onDisconnect = (nodeId: string) => {
    registry.removeNode(nodeId, phaseMachine.getCurrentPhase());
    const envelope: WsEnvelope = {
      type: WsMessageType.NODE_DISCONNECTED,
      sessionId,
      ts: Date.now(),
      payload: { nodeId },
    };
    wsHub.broadcast(envelope);
  };

  // Wire phase transitions to broadcast PHASE_CHANGE within 100ms
  let lastBroadcastPhase = phaseMachine.getCurrentPhase();
  const phaseCheckInterval = setInterval(() => {
    const currentPhase = phaseMachine.getCurrentPhase();
    if (currentPhase !== lastBroadcastPhase) {
      const envelope: WsEnvelope = {
        type: WsMessageType.PHASE_CHANGE,
        sessionId,
        ts: Date.now(),
        payload: { phase: currentPhase },
      };
      wsHub.broadcast(envelope);
      lastBroadcastPhase = currentPhase;
    }
  }, 50); // Poll every 50ms to meet 100ms broadcast requirement

  // Create HTTP server
  const httpServer = createHttpServer(app);

  // Create HTTPS server if certificates are available
  let httpsServer: ReturnType<typeof createHttpsServer> | null = null;
  if (existsSync(config.server.certPath) && existsSync(config.server.keyPath)) {
    const cert = readFileSync(config.server.certPath);
    const key = readFileSync(config.server.keyPath);
    httpsServer = createHttpsServer({ cert, key }, app);
  }

  // WebSocket server setup (attached to HTTP server)
  const wssHttp = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const nodeId = url.searchParams.get('nodeId') || randomUUID();
    const isObserver = url.searchParams.get('observer') === 'true';

    wssHttp.handleUpgrade(request, socket, head, (ws) => {
      wsHub.addConnection(ws, nodeId, isObserver);
    });
  });

  // WebSocket server for HTTPS (if available)
  let wssHttps: WebSocketServer | null = null;
  if (httpsServer) {
    wssHttps = new WebSocketServer({ noServer: true });

    httpsServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '/', `https://${request.headers.host}`);
      const nodeId = url.searchParams.get('nodeId') || randomUUID();
      const isObserver = url.searchParams.get('observer') === 'true';

      wssHttps!.handleUpgrade(request, socket, head, (ws) => {
        wsHub.addConnection(ws, nodeId, isObserver);
      });
    });
  }

  // Graceful shutdown
  function shutdown() {
    clearInterval(phaseCheckInterval);
    wsHub.stop();
    httpServer.close();
    if (httpsServer) {
      httpsServer.close();
    }
  }

  return {
    app,
    httpServer,
    httpsServer,
    phaseMachine,
    registry,
    wsHub,
    stitcher,
    orchestrator,
    sessionId,
    startTime,
    config,
    storage,
    shutdown,
  };
}

// Start servers only when this file is the entry point
const isMainModule = process.argv[1]?.includes('index');

if (isMainModule) {
  const { httpServer, httpsServer, config } = createApp();
  const { host, httpPort, httpsPort } = config.server;

  httpServer.listen(httpPort, host, () => {
    console.log(`[ARGUS] HTTP server listening on http://${host}:${httpPort}`);
  });

  if (httpsServer) {
    httpsServer.listen(httpsPort, host, () => {
      console.log(`[ARGUS] HTTPS server listening on https://${host}:${httpsPort}`);
    });
  } else {
    console.log('[ARGUS] No TLS certificates found — HTTPS disabled');
    console.log(`[ARGUS] To enable HTTPS, place cert.pem and key.pem in ./certs/`);
  }

  // Handle graceful shutdown signals
  process.on('SIGINT', () => {
    console.log('\n[ARGUS] Shutting down...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[ARGUS] Shutting down...');
    process.exit(0);
  });
}
