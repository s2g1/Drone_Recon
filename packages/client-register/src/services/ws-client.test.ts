import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsMessageType } from '@argus/shared';
import type { WsEnvelope } from '@argus/shared';
import { WsClient } from './ws-client';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url: string;
  sentMessages: string[] = [];
  closed: boolean = false;

  constructor(url: string) {
    this.url = url;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
  }
}

// Store references to created mock WebSockets
let mockInstances: MockWebSocket[] = [];

beforeEach(() => {
  mockInstances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      mockInstances.push(this);
    }
  });
  // Expose WebSocket constants
  (globalThis as any).WebSocket.OPEN = MockWebSocket.OPEN;
  (globalThis as any).WebSocket.CONNECTING = MockWebSocket.CONNECTING;
  (globalThis as any).WebSocket.CLOSING = MockWebSocket.CLOSING;
  (globalThis as any).WebSocket.CLOSED = MockWebSocket.CLOSED;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WsClient', () => {
  describe('connect', () => {
    it('creates a WebSocket connection with nodeId query param', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'test-node-123');

      expect(mockInstances).toHaveLength(1);
      expect(mockInstances[0].url).toBe('ws://localhost:3000?nodeId=test-node-123');
    });

    it('resets reconnect attempts on successful open', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      // Force a close to start reconnection
      mockInstances[0].onclose?.();
      vi.advanceTimersByTime(1000); // 1s backoff for attempt 0

      // New connection created
      expect(mockInstances).toHaveLength(2);

      // Open the second connection (simulates successful reconnect)
      mockInstances[1].simulateOpen();

      // Force another close - backoff should be reset to attempt 0 (1s)
      mockInstances[1].onclose?.();
      vi.advanceTimersByTime(1000);
      expect(mockInstances).toHaveLength(3);
    });
  });

  describe('send', () => {
    it('sends serialized JSON when connected', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      const envelope: WsEnvelope = {
        type: WsMessageType.RANGING_RESULT,
        sessionId: 'node-1',
        ts: Date.now(),
        payload: { distance: 100 },
      };

      client.send(envelope);
      expect(mockInstances[0].sentMessages).toHaveLength(1);
      expect(JSON.parse(mockInstances[0].sentMessages[0])).toEqual(envelope);
    });

    it('does not send when WebSocket is not open', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      // Don't call simulateOpen - still CONNECTING

      const envelope: WsEnvelope = {
        type: WsMessageType.PONG,
        sessionId: 'node-1',
        ts: Date.now(),
        payload: null,
      };

      client.send(envelope);
      expect(mockInstances[0].sentMessages).toHaveLength(0);
    });
  });

  describe('PING/PONG handling', () => {
    it('responds with PONG when receiving PING', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      const pingEnvelope: WsEnvelope = {
        type: WsMessageType.PING,
        sessionId: 'server',
        ts: Date.now(),
        payload: null,
      };

      mockInstances[0].onmessage?.({ data: JSON.stringify(pingEnvelope) });

      expect(mockInstances[0].sentMessages).toHaveLength(1);
      const pong = JSON.parse(mockInstances[0].sentMessages[0]);
      expect(pong.type).toBe(WsMessageType.PONG);
      expect(pong.sessionId).toBe('node-1');
    });

    it('does not dispatch PING to event handlers', () => {
      const client = new WsClient();
      const handler = vi.fn();
      client.on(WsMessageType.PING, handler);
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      const pingEnvelope: WsEnvelope = {
        type: WsMessageType.PING,
        sessionId: 'server',
        ts: Date.now(),
        payload: null,
      };

      mockInstances[0].onmessage?.({ data: JSON.stringify(pingEnvelope) });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    it('dispatches messages to registered handlers', () => {
      const client = new WsClient();
      const handler = vi.fn();
      client.on(WsMessageType.PHASE_CHANGE, handler);
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      const envelope: WsEnvelope = {
        type: WsMessageType.PHASE_CHANGE,
        sessionId: 'server',
        ts: Date.now(),
        payload: { phase: 'MESH' },
      };

      mockInstances[0].onmessage?.({ data: JSON.stringify(envelope) });
      expect(handler).toHaveBeenCalledWith(envelope);
    });

    it('supports multiple handlers for same message type', () => {
      const client = new WsClient();
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      client.on(WsMessageType.PHASE_CHANGE, handler1);
      client.on(WsMessageType.PHASE_CHANGE, handler2);
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      const envelope: WsEnvelope = {
        type: WsMessageType.PHASE_CHANGE,
        sessionId: 'server',
        ts: Date.now(),
        payload: { phase: 'DEPLOY' },
      };

      mockInstances[0].onmessage?.({ data: JSON.stringify(envelope) });
      expect(handler1).toHaveBeenCalledWith(envelope);
      expect(handler2).toHaveBeenCalledWith(envelope);
    });

    it('removes handler with off()', () => {
      const client = new WsClient();
      const handler = vi.fn();
      client.on(WsMessageType.PHASE_CHANGE, handler);
      client.off(WsMessageType.PHASE_CHANGE, handler);
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      const envelope: WsEnvelope = {
        type: WsMessageType.PHASE_CHANGE,
        sessionId: 'server',
        ts: Date.now(),
        payload: { phase: 'MESH' },
      };

      mockInstances[0].onmessage?.({ data: JSON.stringify(envelope) });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('reconnection', () => {
    it('attempts reconnection on close with exponential backoff', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      // Close connection
      mockInstances[0].onclose?.();

      // After 1s (attempt 0: 1000 * 2^0 = 1000ms)
      vi.advanceTimersByTime(999);
      expect(mockInstances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(mockInstances).toHaveLength(2);
    });

    it('uses correct backoff delays: 1s, 2s, 4s, 8s, 16s', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      // Close attempt 0 → wait 1s
      mockInstances[0].onclose?.();
      vi.advanceTimersByTime(1000);
      expect(mockInstances).toHaveLength(2);

      // Close attempt 1 → wait 2s (no open, so attempts keep incrementing)
      mockInstances[1].onclose?.();
      vi.advanceTimersByTime(2000);
      expect(mockInstances).toHaveLength(3);

      // Close attempt 2 → wait 4s
      mockInstances[2].onclose?.();
      vi.advanceTimersByTime(4000);
      expect(mockInstances).toHaveLength(4);

      // Close attempt 3 → wait 8s
      mockInstances[3].onclose?.();
      vi.advanceTimersByTime(8000);
      expect(mockInstances).toHaveLength(5);

      // Close attempt 4 → wait 16s
      mockInstances[4].onclose?.();
      vi.advanceTimersByTime(16000);
      expect(mockInstances).toHaveLength(6);
    });

    it('stops reconnecting after 5 attempts', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      // Fail 5 consecutive reconnection attempts (without opening)
      for (let i = 0; i < 5; i++) {
        const delay = Math.min(1000 * Math.pow(2, i), 30000);
        mockInstances[mockInstances.length - 1].onclose?.();
        vi.advanceTimersByTime(delay);
      }

      // 6th close should not reconnect
      mockInstances[mockInstances.length - 1].onclose?.();
      vi.advanceTimersByTime(60000);

      // Initial + 5 reconnection attempts = 6 total
      expect(mockInstances).toHaveLength(6);
    });

    it('caps backoff delay at 30s', () => {
      const client = new WsClient();
      // Access private method for testing the formula
      const getBackoff = (client as any).getBackoffDelay.bind(client);

      expect(getBackoff(0)).toBe(1000);
      expect(getBackoff(1)).toBe(2000);
      expect(getBackoff(2)).toBe(4000);
      expect(getBackoff(3)).toBe(8000);
      expect(getBackoff(4)).toBe(16000);
      expect(getBackoff(5)).toBe(30000); // capped at 30000
      expect(getBackoff(10)).toBe(30000); // still capped
    });
  });

  describe('disconnect', () => {
    it('closes WebSocket without reconnecting', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      client.disconnect();

      expect(mockInstances[0].closed).toBe(true);

      // Wait well beyond any reconnection interval
      vi.advanceTimersByTime(60000);
      expect(mockInstances).toHaveLength(1); // No new connections
    });

    it('clears pending reconnection timer', () => {
      const client = new WsClient();
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      // Trigger reconnection
      mockInstances[0].onclose?.();

      // Disconnect before the reconnection timer fires
      client.disconnect();

      // Advance past the backoff delay
      vi.advanceTimersByTime(60000);
      expect(mockInstances).toHaveLength(1); // No reconnection attempt
    });
  });

  describe('malformed messages', () => {
    it('ignores invalid JSON messages', () => {
      const client = new WsClient();
      const handler = vi.fn();
      client.on(WsMessageType.PHASE_CHANGE, handler);
      client.connect('ws://localhost:3000', 'node-1');
      mockInstances[0].simulateOpen();

      // Should not throw
      mockInstances[0].onmessage?.({ data: 'not valid json{{{' });
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
