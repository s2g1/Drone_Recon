import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { DeviceNode, MeshEdge, WsEnvelope, Rect } from '@argus/shared';
import { Phase, WsMessageType } from '@argus/shared';
import TacticalCanvas from './TacticalCanvas';
import QRDisplay from './QRDisplay';

interface NodeMapProps {
  phase: Phase;
  serverUrl: string;
  roomBounds: Rect;
}

/**
 * NodeMap integrates with TacticalCanvas and provides the data layer for node rendering.
 * Listens for WebSocket events to maintain real-time node and mesh edge state,
 * updating within 500ms on connect/disconnect events.
 */
const NodeMap: React.FC<NodeMapProps> = ({ phase, serverUrl, roomBounds }) => {
  const [nodes, setNodes] = useState<DeviceNode[]>([]);
  const [meshEdges, setMeshEdges] = useState<MeshEdge[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 5;

  /**
   * Handle incoming WebSocket messages and update node/mesh state.
   */
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const envelope: WsEnvelope = JSON.parse(event.data);

      switch (envelope.type) {
        case WsMessageType.NODE_REGISTERED: {
          const newNode = envelope.payload as DeviceNode;
          setNodes((prev) => {
            // Avoid duplicates
            const exists = prev.some((n) => n.nodeId === newNode.nodeId);
            if (exists) {
              return prev.map((n) =>
                n.nodeId === newNode.nodeId ? newNode : n
              );
            }
            return [...prev, newNode];
          });
          break;
        }

        case WsMessageType.NODE_DISCONNECTED: {
          const { nodeId } = envelope.payload as { nodeId: string };
          setNodes((prev) => prev.filter((n) => n.nodeId !== nodeId));
          // Also remove edges involving disconnected node
          setMeshEdges((prev) =>
            prev.filter((e) => e.nodeA !== nodeId && e.nodeB !== nodeId)
          );
          break;
        }

        case WsMessageType.MESH_UPDATE: {
          const { nodes: updatedNodes, edges } = envelope.payload as {
            nodes?: DeviceNode[];
            edges?: MeshEdge[];
          };
          if (updatedNodes) {
            setNodes(updatedNodes);
          }
          if (edges) {
            setMeshEdges(edges);
          }
          break;
        }

        case WsMessageType.RANGING_RESULT: {
          const ranging = envelope.payload as {
            fromNodeId: string;
            toNodeId: string;
            distance: number;
            confidence: number;
          };
          // Add or update the mesh edge for this ranging measurement
          setMeshEdges((prev) => {
            const existingIdx = prev.findIndex(
              (e) =>
                (e.nodeA === ranging.fromNodeId && e.nodeB === ranging.toNodeId) ||
                (e.nodeA === ranging.toNodeId && e.nodeB === ranging.fromNodeId)
            );
            const newEdge: MeshEdge = {
              nodeA: ranging.fromNodeId,
              nodeB: ranging.toNodeId,
              distance: ranging.distance,
              confidence: ranging.confidence,
            };
            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx] = newEdge;
              return updated;
            }
            return [...prev, newEdge];
          });
          break;
        }

        case WsMessageType.PHASE_CHANGE: {
          // Phase changes are handled by parent - but if phase goes to IDLE,
          // clear all nodes and edges
          const { phase: newPhase } = envelope.payload as { phase: Phase };
          if (newPhase === Phase.IDLE) {
            setNodes([]);
            setMeshEdges([]);
          }
          break;
        }

        default:
          // Ignore other message types
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }, []);

  /**
   * Establish WebSocket connection in observer mode.
   */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = serverUrl.replace(/^http/, 'ws') + '?observer=true';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        wsRef.current = null;
        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttemptsRef.current),
            30000
          );
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // Error will trigger onclose
      };

      wsRef.current = ws;
    } catch {
      // Connection failed, will retry via onclose handler
    }
  }, [serverUrl, handleMessage]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
      }}
    >
      {/* Tactical Canvas for rendering nodes and mesh */}
      <TacticalCanvas
        nodes={nodes}
        meshEdges={meshEdges}
        phase={phase}
        roomBounds={roomBounds}
      />

      {/* QR code display during REGISTER phase */}
      {phase === Phase.REGISTER && (
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '24px',
            zIndex: 10,
          }}
        >
          <QRDisplay
            nodeCount={nodes.length}
            registrationUrl={serverUrl}
          />
        </div>
      )}
    </div>
  );
};

export default NodeMap;
