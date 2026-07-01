import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsHub } from './ws-hub';
import { WsMessageType } from '@argus/shared';
import { EventEmitter } from 'events';

// Mock WebSocket that simulates the ws library's WebSocket interface
class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  sentMessages: string[] = [];
  closed = false;

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.closed = true;
    this.readyState = MockWebSocket.CLOSED;
  }
}

// Patch the WebSocket static constants used in ws-hub.ts
vi.mock('ws', () => {
  return {
    default: class {
      static OPEN = 1;
      static CONNECTING = 0;
      static CLOSING = 2;
      static CLOSED = 3;
    },
  };
});

describe('WsHub', () => {
  let hub: WsHub;
  const defaultConfig = { intervalMs: 100, timeoutMs: 50, maxMissed: 2 };

  beforeEach(() => {
    vi.useFakeTimers();
    hub = new WsHub(defaultConfig);
  });

  afterEach(() => {
    hub.stop();
    vi.useRealTimers();
  });

  describe('addConnection', () => {
    it('should store a connection and make it retrievable', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'node-1', false);
      expect(hub.getConnection('node-1')).toBeDefined();
      expect(hub.getConnectionCount()).toBe(1);
    });

    it('should store observer connections', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'bms-1', true);
      const conn = hub.getConnection('bms-1');
      expect(conn).toBeDefined();
      expect(conn!.isObserver).toBe(true);
    });
  });

  describe('removeConnection', () => {
    it('should remove and close the connection', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'node-1', false);
      hub.removeConnection('node-1');
      expect(hub.getConnection('node-1')).toBeUndefined();
      expect(hub.getConnectionCount()).toBe(0);
      expect(ws.closed).toBe(true);
    });

    it('should be a no-op for unknown nodeId', () => {
      hub.removeConnection('unknown');
      expect(hub.getConnectionCount()).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should send envelope to all connected WebSockets', () => {
      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      hub.addConnection(ws1, 'node-1', false);
      hub.addConnection(ws2, 'node-2', false);

      const envelope = {
        type: WsMessageType.PHASE_CHANGE,
        sessionId: 'test',
        ts: Date.now(),
        payload: { phase: 'REGISTER' },
      };

      hub.broadcast(envelope);

      expect(ws1.sentMessages).toHaveLength(1);
      expect(ws2.sentMessages).toHaveLength(1);
      expect(JSON.parse(ws1.sentMessages[0])).toEqual(envelope);
    });

    it('should include observer connections in broadcasts', () => {
      const wsNode = new MockWebSocket() as any;
      const wsObserver = new MockWebSocket() as any;
      hub.addConnection(wsNode, 'node-1', false);
      hub.addConnection(wsObserver, 'bms-1', true);

      const envelope = {
        type: WsMessageType.PHASE_CHANGE,
        sessionId: 'test',
        ts: Date.now(),
        payload: { phase: 'MESH' },
      };

      hub.broadcast(envelope);

      expect(wsNode.sentMessages).toHaveLength(1);
      expect(wsObserver.sentMessages).toHaveLength(1);
    });

    it('should not send to closed WebSockets', () => {
      const ws = new MockWebSocket() as any;
      ws.readyState = MockWebSocket.CLOSED;
      hub.addConnection(ws, 'node-1', false);

      hub.broadcast({
        type: WsMessageType.PHASE_CHANGE,
        sessionId: 'test',
        ts: Date.now(),
        payload: null,
      });

      expect(ws.sentMessages).toHaveLength(0);
    });
  });

  describe('sendTo', () => {
    it('should send envelope to a specific nodeId', () => {
      const ws1 = new MockWebSocket() as any;
      const ws2 = new MockWebSocket() as any;
      hub.addConnection(ws1, 'node-1', false);
      hub.addConnection(ws2, 'node-2', false);

      const envelope = {
        type: WsMessageType.KICK,
        sessionId: 'test',
        ts: Date.now(),
        payload: { nodeId: 'node-1' },
      };

      hub.sendTo('node-1', envelope);

      expect(ws1.sentMessages).toHaveLength(1);
      expect(ws2.sentMessages).toHaveLength(0);
    });

    it('should be a no-op for unknown nodeId', () => {
      hub.sendTo('unknown', {
        type: WsMessageType.PING,
        sessionId: 'test',
        ts: Date.now(),
        payload: null,
      });
      // No error thrown
    });
  });

  describe('heartbeat', () => {
    it('should send PING to non-observer connections on each interval tick', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'node-1', false);

      vi.advanceTimersByTime(defaultConfig.intervalMs);

      expect(ws.sentMessages).toHaveLength(1);
      const msg = JSON.parse(ws.sentMessages[0]);
      expect(msg.type).toBe(WsMessageType.PING);
    });

    it('should NOT send PING to observer connections', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'bms-1', true);

      vi.advanceTimersByTime(defaultConfig.intervalMs);

      expect(ws.sentMessages).toHaveLength(0);
    });

    it('should disconnect a node after maxMissed consecutive missed PINGs', () => {
      const ws = new MockWebSocket() as any;
      const onDisconnect = vi.fn();
      hub.onDisconnect = onDisconnect;

      hub.addConnection(ws, 'node-1', false);

      // First tick: missedPings goes to 1, PING sent
      vi.advanceTimersByTime(defaultConfig.intervalMs);
      expect(ws.sentMessages).toHaveLength(1);

      // Second tick: missedPings goes to 2, PING sent
      vi.advanceTimersByTime(defaultConfig.intervalMs);
      expect(ws.sentMessages).toHaveLength(2);

      // Third tick: missedPings is 2 (>= maxMissed), connection is closed
      vi.advanceTimersByTime(defaultConfig.intervalMs);
      expect(ws.closed).toBe(true);
      expect(onDisconnect).toHaveBeenCalledWith('node-1');
      expect(hub.getConnection('node-1')).toBeUndefined();
    });

    it('should NOT disconnect observer connections regardless of PONG behavior', () => {
      const ws = new MockWebSocket() as any;
      const onDisconnect = vi.fn();
      hub.onDisconnect = onDisconnect;

      hub.addConnection(ws, 'bms-1', true);

      // Advance many intervals
      vi.advanceTimersByTime(defaultConfig.intervalMs * 10);

      expect(ws.closed).toBe(false);
      expect(onDisconnect).not.toHaveBeenCalled();
      expect(hub.getConnection('bms-1')).toBeDefined();
    });

    it('should reset missedPings when PONG is received', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'node-1', false);

      // First tick: missedPings = 1
      vi.advanceTimersByTime(defaultConfig.intervalMs);

      // Simulate PONG response
      const pongEnvelope = JSON.stringify({
        type: WsMessageType.PONG,
        sessionId: 'node-1',
        ts: Date.now(),
        payload: null,
      });
      ws.emit('message', Buffer.from(pongEnvelope));

      // Verify missedPings was reset
      const conn = hub.getConnection('node-1');
      expect(conn!.missedPings).toBe(0);

      // Continue with more ticks — should not disconnect
      vi.advanceTimersByTime(defaultConfig.intervalMs);
      expect(hub.getConnection('node-1')).toBeDefined();
    });

    it('should keep connection alive when PONG is received before maxMissed', () => {
      const ws = new MockWebSocket() as any;
      const onDisconnect = vi.fn();
      hub.onDisconnect = onDisconnect;
      hub.addConnection(ws, 'node-1', false);

      // Simulate responding to every PING
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(defaultConfig.intervalMs);
        const pongEnvelope = JSON.stringify({
          type: WsMessageType.PONG,
          sessionId: 'node-1',
          ts: Date.now(),
          payload: null,
        });
        ws.emit('message', Buffer.from(pongEnvelope));
      }

      expect(ws.closed).toBe(false);
      expect(onDisconnect).not.toHaveBeenCalled();
      expect(hub.getConnection('node-1')).toBeDefined();
    });
  });

  describe('WebSocket close/error cleanup', () => {
    it('should remove connection on WebSocket close event', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'node-1', false);

      ws.emit('close');

      expect(hub.getConnection('node-1')).toBeUndefined();
      expect(hub.getConnectionCount()).toBe(0);
    });

    it('should remove connection on WebSocket error event', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'node-1', false);

      ws.emit('error', new Error('connection reset'));

      expect(hub.getConnection('node-1')).toBeUndefined();
      expect(hub.getConnectionCount()).toBe(0);
    });
  });

  describe('stop', () => {
    it('should stop the heartbeat interval', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'node-1', false);

      hub.stop();

      vi.advanceTimersByTime(defaultConfig.intervalMs * 10);

      // No PING should have been sent after stop
      expect(ws.sentMessages).toHaveLength(0);
    });
  });

  describe('JSON envelope protocol', () => {
    it('should ignore malformed messages without crashing', () => {
      const ws = new MockWebSocket() as any;
      hub.addConnection(ws, 'node-1', false);

      // Send invalid JSON
      ws.emit('message', Buffer.from('not valid json'));
      ws.emit('message', Buffer.from('{incomplete'));
      ws.emit('message', Buffer.from(''));

      // Connection should still be alive
      expect(hub.getConnection('node-1')).toBeDefined();
    });
  });
});
