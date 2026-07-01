import { Phase, WsMessageType } from '@argus/shared';
import type { WsEnvelope, ArgusConfig } from '@argus/shared';
import type { PhaseMachine } from './phase';
import type { Registry } from './registry';
import type { WsHub } from './ws-hub';
import type { Stitcher } from './stitcher';

export interface OrchestratorDeps {
  phaseMachine: PhaseMachine;
  registry: Registry;
  wsHub: WsHub;
  stitcher: Stitcher;
  config: ArgusConfig;
  sessionId: string;
}

/**
 * Orchestrator wires phase transitions to server-side actions:
 * - DEPLOY: broadcasts CAPTURE_START with synchronized timestamp
 * - STITCH: triggers the stitcher pipeline
 * - Kill switch: broadcasts KILL, disconnects all, resets to IDLE
 */
export class Orchestrator {
  private deps: OrchestratorDeps;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
  }

  /**
   * Called when the phase changes — triggers side effects based on the new phase.
   */
  onPhaseChange(newPhase: Phase): void {
    switch (newPhase) {
      case Phase.DEPLOY:
        this.handleDeploy();
        break;
      case Phase.STITCH:
        this.handleStitch();
        break;
      default:
        // No side effects for other phase transitions
        break;
    }
  }

  /**
   * Kill switch: broadcast KILL, disconnect all non-observer connections,
   * reset phase machine to IDLE, and broadcast PHASE_CHANGE with IDLE.
   */
  killSwitch(): void {
    const { phaseMachine, registry, wsHub, sessionId } = this.deps;

    // 1. Broadcast KILL envelope to all connections
    const killEnvelope: WsEnvelope = {
      type: WsMessageType.KILL,
      sessionId,
      ts: Date.now(),
      payload: null,
    };
    wsHub.broadcast(killEnvelope);

    // 2. Disconnect all non-observer connections
    const allNodes = registry.getAllNodes();
    for (const node of allNodes) {
      wsHub.removeConnection(node.nodeId);
      registry.removeNode(node.nodeId, phaseMachine.getCurrentPhase());
    }

    // 3. Reset phase machine to IDLE
    phaseMachine.reset();

    // 4. Broadcast PHASE_CHANGE with IDLE
    const phaseEnvelope: WsEnvelope = {
      type: WsMessageType.PHASE_CHANGE,
      sessionId,
      ts: Date.now(),
      payload: { phase: Phase.IDLE },
    };
    wsHub.broadcast(phaseEnvelope);
  }

  /**
   * DEPLOY phase handler:
   * Compute syncTs = Date.now() + 3000 (3s delay for synchronization)
   * Broadcast CAPTURE_START with { syncTs, duration } to all nodes.
   */
  private handleDeploy(): void {
    const { wsHub, config, sessionId } = this.deps;

    const syncTs = Date.now() + 3000;
    const duration = config.capture.duration;

    const envelope: WsEnvelope = {
      type: WsMessageType.CAPTURE_START,
      sessionId,
      ts: Date.now(),
      payload: { syncTs, duration },
    };
    wsHub.broadcast(envelope);
  }

  /**
   * STITCH phase handler:
   * Gather all nodes with uploaded video paths, call stitcher, broadcast result.
   */
  private handleStitch(): void {
    const { registry, wsHub, stitcher, config, sessionId } = this.deps;

    const allNodes = registry.getAllNodes();

    // Gather nodes that have uploaded video (status === UPLOADED)
    // For now, we build the job from all nodes — those without video will get black tiles
    const stitchNodes = allNodes.map((node) => ({
      nodeId: node.nodeId,
      position: node.position ?? { x: 0, y: 0 },
      videoPath: `uploads/${sessionId}/${node.nodeId}.webm`,
    }));

    if (stitchNodes.length === 0) {
      return;
    }

    const job = {
      sessionId,
      nodes: stitchNodes,
      outputWidth: config.stitch.outputWidth,
      outputHeight: config.stitch.outputHeight,
    };

    // Fire and forget — stitch runs asynchronously
    stitcher
      .stitch(job)
      .then(({ outputPath }) => {
        const envelope: WsEnvelope = {
          type: WsMessageType.STITCH_COMPLETE,
          sessionId,
          ts: Date.now(),
          payload: { compositeUrl: `/composite/${sessionId}` },
        };
        wsHub.broadcast(envelope);
      })
      .catch((err) => {
        // Log stitching error but don't crash the server
        console.error('[ARGUS] Stitching failed:', err);
      });
  }
}
