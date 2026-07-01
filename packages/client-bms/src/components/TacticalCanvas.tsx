import React, { useRef, useEffect, useCallback } from 'react';
import type { DeviceNode, MeshEdge, Vec2, Rect } from '@argus/shared';
import { Phase, NodeStatus } from '@argus/shared';

export interface TacticalCanvasProps {
  nodes: DeviceNode[];
  meshEdges: MeshEdge[];
  phase: Phase;
  roomBounds: Rect;
  videoTiles?: Map<string, string>; // nodeId → image URL
}

// Colors
const COLOR_BG = '#050D1A';
const COLOR_GRID = '#1a2d3d';
const COLOR_NODE_CONNECTED = '#00FF9C';
const COLOR_NODE_WARNING = '#FFB800';
const COLOR_EDGE = '#00FF9C40';
const COLOR_HUD_TEXT = '#00BFFF';
const GRID_SPACING_CM = 100; // grid line every 100cm (1 meter)
const NODE_RADIUS = 8;

/**
 * Maps room coordinates (cm) to canvas screen pixels.
 */
export function roomToScreen(
  pos: Vec2,
  roomBounds: Rect,
  canvasWidth: number,
  canvasHeight: number
): Vec2 {
  const padding = 40; // px padding around edges
  const drawWidth = canvasWidth - padding * 2;
  const drawHeight = canvasHeight - padding * 2;

  const scaleX = drawWidth / roomBounds.width;
  const scaleY = drawHeight / roomBounds.height;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (drawWidth - roomBounds.width * scale) / 2;
  const offsetY = padding + (drawHeight - roomBounds.height * scale) / 2;

  return {
    x: offsetX + (pos.x - roomBounds.x) * scale,
    y: offsetY + (pos.y - roomBounds.y) * scale,
  };
}

/**
 * Maps canvas screen pixels back to room coordinates (cm).
 */
export function screenToRoom(
  pos: Vec2,
  roomBounds: Rect,
  canvasWidth: number,
  canvasHeight: number
): Vec2 {
  const padding = 40;
  const drawWidth = canvasWidth - padding * 2;
  const drawHeight = canvasHeight - padding * 2;

  const scaleX = drawWidth / roomBounds.width;
  const scaleY = drawHeight / roomBounds.height;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (drawWidth - roomBounds.width * scale) / 2;
  const offsetY = padding + (drawHeight - roomBounds.height * scale) / 2;

  return {
    x: (pos.x - offsetX) / scale + roomBounds.x,
    y: (pos.y - offsetY) / scale + roomBounds.y,
  };
}

function renderGrid(
  ctx: CanvasRenderingContext2D,
  roomBounds: Rect,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.save();
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);

  // Draw vertical grid lines at regular room coordinate intervals
  const startX = Math.ceil(roomBounds.x / GRID_SPACING_CM) * GRID_SPACING_CM;
  for (let rx = startX; rx <= roomBounds.x + roomBounds.width; rx += GRID_SPACING_CM) {
    const top = roomToScreen({ x: rx, y: roomBounds.y }, roomBounds, canvasWidth, canvasHeight);
    const bottom = roomToScreen(
      { x: rx, y: roomBounds.y + roomBounds.height },
      roomBounds,
      canvasWidth,
      canvasHeight
    );
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.stroke();
  }

  // Draw horizontal grid lines
  const startY = Math.ceil(roomBounds.y / GRID_SPACING_CM) * GRID_SPACING_CM;
  for (let ry = startY; ry <= roomBounds.y + roomBounds.height; ry += GRID_SPACING_CM) {
    const left = roomToScreen({ x: roomBounds.x, y: ry }, roomBounds, canvasWidth, canvasHeight);
    const right = roomToScreen(
      { x: roomBounds.x + roomBounds.width, y: ry },
      roomBounds,
      canvasWidth,
      canvasHeight
    );
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }

  ctx.restore();
}

function renderMeshEdges(
  ctx: CanvasRenderingContext2D,
  edges: MeshEdge[],
  nodes: DeviceNode[],
  roomBounds: Rect,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.save();
  ctx.strokeStyle = COLOR_EDGE;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);

  const nodeMap = new Map<string, DeviceNode>();
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node);
  }

  for (const edge of edges) {
    const nodeA = nodeMap.get(edge.nodeA);
    const nodeB = nodeMap.get(edge.nodeB);
    if (!nodeA?.position || !nodeB?.position) continue;

    const screenA = roomToScreen(nodeA.position, roomBounds, canvasWidth, canvasHeight);
    const screenB = roomToScreen(nodeB.position, roomBounds, canvasWidth, canvasHeight);

    ctx.beginPath();
    ctx.moveTo(screenA.x, screenA.y);
    ctx.lineTo(screenB.x, screenB.y);
    ctx.stroke();
  }

  ctx.restore();
}

function renderNodes(
  ctx: CanvasRenderingContext2D,
  nodes: DeviceNode[],
  roomBounds: Rect,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.save();
  ctx.setLineDash([]);

  for (const node of nodes) {
    if (!node.position) continue;

    const screen = roomToScreen(node.position, roomBounds, canvasWidth, canvasHeight);

    // Determine color based on status
    const isWarning = node.status === NodeStatus.ERROR;
    const color = isWarning ? COLOR_NODE_WARNING : COLOR_NODE_CONNECTED;

    // Draw outer glow
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, NODE_RADIUS + 3, 0, Math.PI * 2);
    ctx.fillStyle = color + '30'; // 30 = ~19% opacity
    ctx.fill();

    // Draw node circle
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Draw node label (truncated nodeId)
    ctx.fillStyle = color;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(node.nodeId.substring(0, 6), screen.x, screen.y + NODE_RADIUS + 4);
  }

  ctx.restore();
}

function renderPhaseHUD(
  ctx: CanvasRenderingContext2D,
  phase: Phase,
  nodeCount: number,
  canvasWidth: number
): void {
  ctx.save();
  ctx.setLineDash([]);

  // Phase label top-right
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLOR_HUD_TEXT;
  ctx.fillText(`PHASE: ${phase}`, canvasWidth - 16, 16);

  // Node count below phase
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillStyle = COLOR_NODE_CONNECTED;
  ctx.fillText(`NODES: ${nodeCount}`, canvasWidth - 16, 36);

  // System title top-left
  ctx.textAlign = 'left';
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillStyle = COLOR_NODE_CONNECTED;
  ctx.fillText('ARGUS BMS', 16, 16);

  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = COLOR_HUD_TEXT + '99';
  ctx.fillText('TACTICAL DISPLAY', 16, 36);

  ctx.restore();
}

function renderVideoTiles(
  ctx: CanvasRenderingContext2D,
  videoTiles: Map<string, string>,
  nodes: DeviceNode[],
  roomBounds: Rect,
  canvasWidth: number,
  canvasHeight: number,
  imageCache: Map<string, HTMLImageElement>
): void {
  ctx.save();
  ctx.setLineDash([]);

  const tileSize = 80; // px per tile

  for (const node of nodes) {
    if (!node.position) continue;

    const screen = roomToScreen(node.position, roomBounds, canvasWidth, canvasHeight);
    const tileUrl = videoTiles.get(node.nodeId);

    // Draw tile frame
    const tileX = screen.x - tileSize / 2;
    const tileY = screen.y - tileSize / 2;

    ctx.strokeStyle = COLOR_NODE_CONNECTED + '80';
    ctx.lineWidth = 1;
    ctx.strokeRect(tileX, tileY, tileSize, tileSize);

    if (tileUrl) {
      const cached = imageCache.get(node.nodeId);
      if (cached && cached.complete) {
        ctx.drawImage(cached, tileX, tileY, tileSize, tileSize);
      } else {
        // Black placeholder while loading
        ctx.fillStyle = '#000000';
        ctx.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
      }
    } else {
      // No tile available — black fill
      ctx.fillStyle = '#000000';
      ctx.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
    }
  }

  ctx.restore();
}

const TacticalCanvas: React.FC<TacticalCanvasProps> = ({
  nodes,
  meshEdges,
  phase,
  roomBounds,
  videoTiles,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Preload video tile images
  useEffect(() => {
    if (!videoTiles) return;
    const cache = imageCacheRef.current;

    for (const [nodeId, url] of videoTiles.entries()) {
      if (!cache.has(nodeId) || cache.get(nodeId)!.src !== url) {
        const img = new Image();
        img.src = url;
        cache.set(nodeId, img);
      }
    }

    // Remove stale entries
    for (const key of cache.keys()) {
      if (!videoTiles.has(key)) {
        cache.delete(key);
      }
    }
  }, [videoTiles]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Clear to dark background
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, width, height);

    // 2. Dashed grid overlay
    renderGrid(ctx, roomBounds, width, height);

    // 3. Mesh edges
    renderMeshEdges(ctx, meshEdges, nodes, roomBounds, width, height);

    // 4. Nodes
    renderNodes(ctx, nodes, roomBounds, width, height);

    // 5. Phase HUD
    renderPhaseHUD(ctx, phase, nodes.length, width);

    // 6. Video tiles (during STITCH phase)
    if (phase === Phase.STITCH && videoTiles && videoTiles.size > 0) {
      renderVideoTiles(ctx, videoTiles, nodes, roomBounds, width, height, imageCacheRef.current);
    }

    // Schedule next frame
    animFrameRef.current = requestAnimationFrame(draw);
  }, [nodes, meshEdges, phase, roomBounds, videoTiles]);

  // Resize handling via ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }
      }
    });

    resizeObserver.observe(parent);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Animation loop
  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
      }}
      aria-label="Tactical display canvas showing node positions and mesh topology"
    />
  );
};

export default TacticalCanvas;
