import type { WsEnvelope } from '@argus/shared';
import { WsMessageType } from '@argus/shared';

export type WsObserverHandler = (envelope: WsEnvelope) => void;

/**
 * WebSocket client for BMS observer mode.
 *
 * Differences from the registration client WsClient:
 * - Connects with ?observer=true (not counted as a swarm node)
 * - Does NOT respond to PING messages (observers exempt from heartbeat disconnection)
 * - Supports wildcard '*' handler that receives all message types
 * - Higher reconnection limit (10 attempts) for persistent BMS connectivity
 */
export class WsObserver {
  private ws: WebSocket | null = null;
  private handlers: Map<WsMessageType | '*', WsObserverHandler[]> = new Map();
  private url: string = '';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose: boolean = false;

  connect(url: string): void {
    this.url = url;
    this.intentionalClose = false;
    this.createConnection();
  }

  on(type: WsMessageType | '*', handler: WsObserverHandler): void {
    const existing = this.handlers.get(type) ?? [];
    existing.push(handler);
    this.handlers.set(type, existing);
  }

  off(type: WsMessageType | '*', handler: WsObserverHandler): void {
    const existing = this.handlers.get(type);
    if (!existing) return;
    const index = existing.indexOf(handler);
    if (index !== -1) {
      existing.splice(index, 1);
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private createConnection(): void {
    const connectionUrl = `${this.url}?observer=true`;
    this.ws = new WebSocket(connectionUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const envelope: WsEnvelope = JSON.parse(event.data as string);
        // Observers do NOT respond to PING — exempt from heartbeat
        this.dispatch(envelope);
      } catch {
        // Ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      if (!this.intentionalClose) {
        this.reconnect();
      }
    };

    this.ws.onerror = () => {
      // The close event will fire after error, triggering reconnection
    };
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const delay = this.getBackoffDelay(this.reconnectAttempts);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  private getBackoffDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  }

  private dispatch(envelope: WsEnvelope): void {
    // Dispatch to type-specific handlers
    const typeHandlers = this.handlers.get(envelope.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(envelope);
      }
    }

    // Dispatch to wildcard handlers (receive ALL messages)
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler(envelope);
      }
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
