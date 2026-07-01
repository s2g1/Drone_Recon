import WebSocket from 'ws';
import { WsEnvelope, WsMessageType, ArgusConfig } from '@argus/shared';

export interface WsConnection {
  ws: WebSocket;
  nodeId: string;
  isObserver: boolean;
  missedPings: number;
  lastPong: number;
}

export type DisconnectCallback = (nodeId: string) => void;

export class WsHub {
  private connections: Map<string, WsConnection> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly maxMissed: number;

  /** External callback invoked when a node is disconnected due to missed heartbeats. */
  public onDisconnect: DisconnectCallback | null = null;

  constructor(config: ArgusConfig['heartbeat']) {
    this.intervalMs = config.intervalMs;
    this.maxMissed = config.maxMissed;
    this.startHeartbeat();
  }

  /**
   * Register a new WebSocket connection.
   * Sets up message handling for PONG responses and close/error cleanup.
   */
  addConnection(ws: WebSocket, nodeId: string, isObserver: boolean): void {
    const connection: WsConnection = {
      ws,
      nodeId,
      isObserver,
      missedPings: 0,
      lastPong: Date.now(),
    };

    this.connections.set(nodeId, connection);

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const envelope: WsEnvelope = JSON.parse(data.toString());
        if (envelope.type === WsMessageType.PONG) {
          this.handlePong(nodeId);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.connections.delete(nodeId);
    });

    ws.on('error', () => {
      this.connections.delete(nodeId);
    });
  }

  /**
   * Remove a connection by nodeId and close the underlying WebSocket.
   */
  removeConnection(nodeId: string): void {
    const connection = this.connections.get(nodeId);
    if (connection) {
      this.connections.delete(nodeId);
      if (connection.ws.readyState === WebSocket.OPEN || connection.ws.readyState === WebSocket.CONNECTING) {
        connection.ws.close();
      }
    }
  }

  /**
   * Broadcast an envelope to ALL connected WebSockets (including observers).
   */
  broadcast(envelope: WsEnvelope): void {
    const message = JSON.stringify(envelope);
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(message);
      }
    }
  }

  /**
   * Send an envelope to a specific nodeId.
   */
  sendTo(nodeId: string, envelope: WsEnvelope): void {
    const connection = this.connections.get(nodeId);
    if (connection && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify(envelope));
    }
  }

  /**
   * Get a connection by nodeId.
   */
  getConnection(nodeId: string): WsConnection | undefined {
    return this.connections.get(nodeId);
  }

  /**
   * Get the count of active connections.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Stop the heartbeat interval for clean shutdown.
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Start the heartbeat interval.
   * On each tick: send PING to non-observer connections, increment missedPings.
   * If missedPings >= maxMissed: close connection and invoke onDisconnect callback.
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const toDisconnect: string[] = [];

      for (const [nodeId, connection] of this.connections) {
        // Observers are exempt from heartbeat disconnection
        if (connection.isObserver) {
          continue;
        }

        // Check if this connection has exceeded the missed ping threshold
        if (connection.missedPings >= this.maxMissed) {
          toDisconnect.push(nodeId);
          continue;
        }

        // Increment missed pings and send PING
        connection.missedPings += 1;

        const pingEnvelope: WsEnvelope = {
          type: WsMessageType.PING,
          sessionId: 'server',
          ts: Date.now(),
          payload: null,
        };

        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.send(JSON.stringify(pingEnvelope));
        }
      }

      // Disconnect nodes that exceeded the threshold
      for (const nodeId of toDisconnect) {
        const connection = this.connections.get(nodeId);
        if (connection) {
          this.connections.delete(nodeId);
          if (connection.ws.readyState === WebSocket.OPEN || connection.ws.readyState === WebSocket.CONNECTING) {
            connection.ws.close();
          }
          if (this.onDisconnect) {
            this.onDisconnect(nodeId);
          }
        }
      }
    }, this.intervalMs);
  }

  /**
   * Handle a PONG response from a node — reset missedPings and update lastPong.
   */
  private handlePong(nodeId: string): void {
    const connection = this.connections.get(nodeId);
    if (connection) {
      connection.missedPings = 0;
      connection.lastPong = Date.now();
    }
  }
}
