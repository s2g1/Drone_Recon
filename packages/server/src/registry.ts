import { randomUUID } from 'node:crypto';
import type { DeviceNode, DeviceCapabilities, Vec2 } from '@argus/shared';
import { NodeStatus, Phase } from '@argus/shared';

/**
 * In-memory registry for all registered device nodes.
 * Manages node lifecycle: registration, status updates, removal, and restoration.
 */
export class Registry {
  private nodes: Map<string, DeviceNode> = new Map();
  private disconnectedNodes: Map<string, { node: DeviceNode; phase: Phase }> = new Map();

  /**
   * Register a new device node.
   * Assigns UUID v4 nodeId, captures device info, generates session token.
   * Note: Phase guard (REGISTER-only) is enforced by the routes layer, not here.
   */
  register(
    ip: string,
    userAgent: string,
    deviceType: 'android' | 'ios',
    capabilities: DeviceCapabilities,
  ): DeviceNode {
    const now = Date.now();
    const node: DeviceNode = {
      nodeId: randomUUID(),
      ip,
      userAgent,
      deviceType,
      status: NodeStatus.REGISTERED,
      position: null,
      capabilities,
      connectedAt: now,
      lastHeartbeat: now,
      sessionToken: randomUUID(),
    };
    this.nodes.set(node.nodeId, node);
    return node;
  }

  /** Retrieve a single node by ID. */
  getNode(nodeId: string): DeviceNode | undefined {
    return this.nodes.get(nodeId);
  }

  /** Retrieve all currently registered nodes. */
  getAllNodes(): DeviceNode[] {
    return Array.from(this.nodes.values());
  }

  /** Update the status of a registered node. */
  updateStatus(nodeId: string, status: NodeStatus): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
    }
  }

  /** Update the mesh position of a registered node. */
  updatePosition(nodeId: string, position: Vec2): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.position = position;
    }
  }

  /**
   * Remove a node from the active registry.
   * Stores the node in disconnectedNodes for potential restoration.
   */
  removeNode(nodeId: string, currentPhase?: Phase): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return false;
    }
    this.disconnectedNodes.set(nodeId, {
      node: { ...node },
      phase: currentPhase ?? Phase.IDLE,
    });
    this.nodes.delete(nodeId);
    return true;
  }

  /** Get the count of currently registered nodes. */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Restore a previously disconnected node if the phase hasn't advanced.
   * Returns the restored node if successful, undefined otherwise.
   */
  restoreNode(nodeId: string, currentPhase: Phase): DeviceNode | undefined {
    const entry = this.disconnectedNodes.get(nodeId);
    if (!entry) {
      return undefined;
    }

    // Only restore if phase hasn't advanced beyond the disconnection phase
    if (phaseIndex(currentPhase) > phaseIndex(entry.phase)) {
      return undefined;
    }

    const restoredNode: DeviceNode = {
      ...entry.node,
      lastHeartbeat: Date.now(),
    };
    this.nodes.set(nodeId, restoredNode);
    this.disconnectedNodes.delete(nodeId);
    return restoredNode;
  }
}

/** Helper: get the ordinal index of a phase in the sequence. */
const PHASE_ORDER: Phase[] = [
  Phase.IDLE,
  Phase.REGISTER,
  Phase.MESH,
  Phase.DEPLOY,
  Phase.STITCH,
];

function phaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}
