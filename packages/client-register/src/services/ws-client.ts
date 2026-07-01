import type { WsEnvelope } from '@argus/shared';
import { WsMessageType } from '@argus/shared';

export type WsEventHandler = (envelope: WsEnvelope) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private url: string = '';
  private nodeId: string = '';
  private handlers: Map<WsMessageType, WsEventHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose: boolean = false;

  connect(url: string, nodeId: string): void {
    this.url = url;
    this.nodeId = nodeId;
    this.intentionalClose = false;
    this.createConnection();
  }

  send(envelope: WsEnvelope): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
    }
  }

  on(type: WsMessageType, handler: WsEventHandler): void {
    const existing = this.handlers.get(type) ?? [];
    existing.push(handler);
    this.handlers.set(type, existing);
  }

  off(type: WsMessageType, handler: WsEventHandler): void {
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

  private createConnection(): void {
    const connectionUrl = `${this.url}?nodeId=${encodeURIComponent(this.nodeId)}`;
    this.ws = new WebSocket(connectionUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const envelope: WsEnvelope = JSON.parse(event.data as string);

        if (envelope.type === WsMessageType.PING) {
          this.handlePing();
          return;
        }

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

  private handlePing(): void {
    const pong: WsEnvelope = {
      type: WsMessageType.PONG,
      sessionId: this.nodeId,
      ts: Date.now(),
      payload: null,
    };
    this.send(pong);
  }

  private dispatch(envelope: WsEnvelope): void {
    const handlers = this.handlers.get(envelope.type);
    if (handlers) {
      for (const handler of handlers) {
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
