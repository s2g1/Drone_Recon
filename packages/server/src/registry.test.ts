import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from './registry';
import { NodeStatus, Phase } from '@argus/shared';
import type { DeviceCapabilities } from '@argus/shared';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const defaultCapabilities: DeviceCapabilities = {
  camera: true,
  ble: true,
  gyroscope: true,
};

describe('Registry', () => {
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
  });

  describe('register()', () => {
    it('assigns a UUID v4 nodeId', () => {
      const node = registry.register('192.168.1.10', 'Mozilla/5.0', 'android', defaultCapabilities);
      expect(node.nodeId).toMatch(UUID_V4_REGEX);
    });

    it('captures IP, user agent, device type, and capabilities', () => {
      const caps: DeviceCapabilities = { camera: true, ble: false, gyroscope: true };
      const node = registry.register('10.0.0.5', 'Safari/15', 'ios', caps);
      expect(node.ip).toBe('10.0.0.5');
      expect(node.userAgent).toBe('Safari/15');
      expect(node.deviceType).toBe('ios');
      expect(node.capabilities).toEqual(caps);
    });

    it('generates a session token as UUID v4', () => {
      const node = registry.register('192.168.1.10', 'UA', 'android', defaultCapabilities);
      expect(node.sessionToken).toMatch(UUID_V4_REGEX);
    });

    it('sets initial status to REGISTERED', () => {
      const node = registry.register('192.168.1.10', 'UA', 'android', defaultCapabilities);
      expect(node.status).toBe(NodeStatus.REGISTERED);
    });

    it('sets connectedAt and lastHeartbeat to current timestamp', () => {
      const before = Date.now();
      const node = registry.register('192.168.1.10', 'UA', 'android', defaultCapabilities);
      const after = Date.now();
      expect(node.connectedAt).toBeGreaterThanOrEqual(before);
      expect(node.connectedAt).toBeLessThanOrEqual(after);
      expect(node.lastHeartbeat).toBe(node.connectedAt);
    });

    it('sets position to null initially', () => {
      const node = registry.register('192.168.1.10', 'UA', 'android', defaultCapabilities);
      expect(node.position).toBeNull();
    });

    it('increments node count on registration', () => {
      expect(registry.getNodeCount()).toBe(0);
      registry.register('10.0.0.1', 'UA1', 'android', defaultCapabilities);
      expect(registry.getNodeCount()).toBe(1);
      registry.register('10.0.0.2', 'UA2', 'ios', defaultCapabilities);
      expect(registry.getNodeCount()).toBe(2);
    });
  });

  describe('getNode()', () => {
    it('returns the registered node by ID', () => {
      const node = registry.register('10.0.0.1', 'UA', 'android', defaultCapabilities);
      expect(registry.getNode(node.nodeId)).toEqual(node);
    });

    it('returns undefined for unknown nodeId', () => {
      expect(registry.getNode('non-existent')).toBeUndefined();
    });
  });

  describe('getAllNodes()', () => {
    it('returns empty array when no nodes registered', () => {
      expect(registry.getAllNodes()).toEqual([]);
    });

    it('returns all registered nodes', () => {
      const n1 = registry.register('10.0.0.1', 'UA1', 'android', defaultCapabilities);
      const n2 = registry.register('10.0.0.2', 'UA2', 'ios', defaultCapabilities);
      const all = registry.getAllNodes();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual(n1);
      expect(all).toContainEqual(n2);
    });
  });

  describe('updateStatus()', () => {
    it('updates the status of an existing node', () => {
      const node = registry.register('10.0.0.1', 'UA', 'android', defaultCapabilities);
      registry.updateStatus(node.nodeId, NodeStatus.MESHED);
      expect(registry.getNode(node.nodeId)!.status).toBe(NodeStatus.MESHED);
    });

    it('does nothing for unknown nodeId', () => {
      // Should not throw
      registry.updateStatus('unknown', NodeStatus.ERROR);
    });
  });

  describe('updatePosition()', () => {
    it('updates the position of an existing node', () => {
      const node = registry.register('10.0.0.1', 'UA', 'android', defaultCapabilities);
      registry.updatePosition(node.nodeId, { x: 100, y: 200 });
      expect(registry.getNode(node.nodeId)!.position).toEqual({ x: 100, y: 200 });
    });

    it('does nothing for unknown nodeId', () => {
      registry.updatePosition('unknown', { x: 0, y: 0 });
    });
  });

  describe('removeNode()', () => {
    it('removes a node and returns true', () => {
      const node = registry.register('10.0.0.1', 'UA', 'android', defaultCapabilities);
      expect(registry.removeNode(node.nodeId, Phase.MESH)).toBe(true);
      expect(registry.getNode(node.nodeId)).toBeUndefined();
      expect(registry.getNodeCount()).toBe(0);
    });

    it('returns false for unknown nodeId', () => {
      expect(registry.removeNode('non-existent')).toBe(false);
    });
  });

  describe('getNodeCount()', () => {
    it('returns 0 for empty registry', () => {
      expect(registry.getNodeCount()).toBe(0);
    });

    it('reflects registrations and removals', () => {
      const n1 = registry.register('10.0.0.1', 'UA1', 'android', defaultCapabilities);
      registry.register('10.0.0.2', 'UA2', 'ios', defaultCapabilities);
      expect(registry.getNodeCount()).toBe(2);
      registry.removeNode(n1.nodeId, Phase.REGISTER);
      expect(registry.getNodeCount()).toBe(1);
    });
  });

  describe('restoreNode()', () => {
    it('restores a disconnected node if phase has not advanced', () => {
      const node = registry.register('10.0.0.1', 'UA', 'android', defaultCapabilities);
      registry.updatePosition(node.nodeId, { x: 50, y: 75 });
      registry.updateStatus(node.nodeId, NodeStatus.MESHED);

      registry.removeNode(node.nodeId, Phase.MESH);
      expect(registry.getNodeCount()).toBe(0);

      const restored = registry.restoreNode(node.nodeId, Phase.MESH);
      expect(restored).toBeDefined();
      expect(restored!.nodeId).toBe(node.nodeId);
      expect(restored!.status).toBe(NodeStatus.MESHED);
      expect(restored!.position).toEqual({ x: 50, y: 75 });
      expect(registry.getNodeCount()).toBe(1);
    });

    it('returns undefined if phase has advanced beyond disconnection phase', () => {
      const node = registry.register('10.0.0.1', 'UA', 'android', defaultCapabilities);
      registry.removeNode(node.nodeId, Phase.REGISTER);

      const restored = registry.restoreNode(node.nodeId, Phase.MESH);
      expect(restored).toBeUndefined();
      expect(registry.getNodeCount()).toBe(0);
    });

    it('returns undefined for an unknown nodeId', () => {
      expect(registry.restoreNode('non-existent', Phase.IDLE)).toBeUndefined();
    });

    it('updates lastHeartbeat on restoration', () => {
      const node = registry.register('10.0.0.1', 'UA', 'android', defaultCapabilities);
      registry.removeNode(node.nodeId, Phase.REGISTER);

      const before = Date.now();
      const restored = registry.restoreNode(node.nodeId, Phase.REGISTER);
      const after = Date.now();

      expect(restored!.lastHeartbeat).toBeGreaterThanOrEqual(before);
      expect(restored!.lastHeartbeat).toBeLessThanOrEqual(after);
    });

    it('removes from disconnectedNodes after successful restore', () => {
      const node = registry.register('10.0.0.1', 'UA', 'android', defaultCapabilities);
      registry.removeNode(node.nodeId, Phase.REGISTER);
      registry.restoreNode(node.nodeId, Phase.REGISTER);

      // Second restore attempt should fail since it was already restored
      const second = registry.restoreNode(node.nodeId, Phase.REGISTER);
      expect(second).toBeUndefined();
    });
  });
});
