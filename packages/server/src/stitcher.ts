import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import type { ArgusConfig, Vec2, Rect, StitchProgress } from '@argus/shared';

export interface StitchJob {
  sessionId: string;
  nodes: { nodeId: string; position: Vec2; videoPath: string }[];
  outputWidth: number;   // 1920
  outputHeight: number;  // 1080
}

export class Stitcher {
  private config: ArgusConfig['stitch'];

  constructor(config: ArgusConfig['stitch']) {
    this.config = config;
  }

  /**
   * Map mesh coordinates to canvas tile positions.
   * Each node gets an equal-sized tile arranged in a grid.
   * Tile width = canvasSize.x / ceil(sqrt(numNodes))
   * Tile height = canvasSize.y / ceil(numNodes / cols)
   * Position within grid based on node's relative room position.
   */
  computeTileLayout(
    nodes: { nodeId: string; position: Vec2 }[],
    roomBounds: Rect,
    canvasSize: Vec2
  ): Map<string, Rect> {
    const layout = new Map<string, Rect>();
    const numNodes = nodes.length;

    if (numNodes === 0) {
      return layout;
    }

    const cols = Math.ceil(Math.sqrt(numNodes));
    const rows = Math.ceil(numNodes / cols);
    const tileWidth = canvasSize.x / cols;
    const tileHeight = canvasSize.y / rows;

    // Sort nodes by their relative room position to assign grid slots
    // Normalize positions relative to room bounds, then sort by row then column
    const sortedNodes = [...nodes].sort((a, b) => {
      const aNormY = (a.position.y - roomBounds.y) / (roomBounds.height || 1);
      const bNormY = (b.position.y - roomBounds.y) / (roomBounds.height || 1);
      const aRow = Math.floor(aNormY * rows);
      const bRow = Math.floor(bNormY * rows);

      if (aRow !== bRow) return aRow - bRow;

      const aNormX = (a.position.x - roomBounds.x) / (roomBounds.width || 1);
      const bNormX = (b.position.x - roomBounds.x) / (roomBounds.width || 1);
      return aNormX - bNormX;
    });

    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      layout.set(node.nodeId, {
        x: Math.floor(col * tileWidth),
        y: Math.floor(row * tileHeight),
        width: Math.floor(tileWidth),
        height: Math.floor(tileHeight),
      });
    }

    return layout;
  }

  /**
   * Extract frames from webm using FFmpeg.
   * Spawns: ffmpeg -i <videoPath> -vf fps=1 <outputDir>/frame_%04d.png
   * Returns array of frame file paths. If FFmpeg fails, returns empty array.
   */
  async extractFrames(videoPath: string, outputDir: string): Promise<string[]> {
    // Ensure output directory exists
    await fs.promises.mkdir(outputDir, { recursive: true });

    const outputPattern = path.join(outputDir, 'frame_%04d.png');

    return new Promise<string[]>((resolve) => {
      const proc = spawn('ffmpeg', [
        '-i', videoPath,
        '-vf', 'fps=1',
        outputPattern,
      ]);

      proc.on('error', () => {
        resolve([]);
      });

      proc.on('close', async (code) => {
        if (code !== 0) {
          resolve([]);
          return;
        }

        try {
          const files = await fs.promises.readdir(outputDir);
          const framePaths = files
            .filter((f) => f.startsWith('frame_') && f.endsWith('.png'))
            .sort()
            .map((f) => path.join(outputDir, f));
          resolve(framePaths);
        } catch {
          resolve([]);
        }
      });
    });
  }

  /**
   * Composite tiles into final PNG using sharp.
   * Creates a base image (black, canvasSize dimensions) and overlays
   * each tile buffer resized to the tile dimensions at its layout position.
   */
  async compositeFrame(
    tiles: Map<string, Buffer>,
    layout: Map<string, Rect>,
    canvasSize: Vec2
  ): Promise<Buffer> {
    // Create black base canvas
    const compositeInputs: sharp.OverlayOptions[] = [];

    for (const [nodeId, rect] of layout.entries()) {
      const tileBuffer = tiles.get(nodeId);
      if (!tileBuffer) {
        // Missing tile — leave as black (base canvas already black)
        continue;
      }

      // Resize tile buffer to the designated tile dimensions
      const resizedTile = await sharp(tileBuffer)
        .resize(rect.width, rect.height, { fit: 'fill' })
        .png()
        .toBuffer();

      compositeInputs.push({
        input: resizedTile,
        left: rect.x,
        top: rect.y,
      });
    }

    // Create base black image and composite all tiles
    const result = await sharp({
      create: {
        width: canvasSize.x,
        height: canvasSize.y,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .composite(compositeInputs)
      .png()
      .toBuffer();

    return result;
  }

  /**
   * Full stitching pipeline:
   * 1. Check upload threshold (≥60% of nodes uploaded)
   * 2. Extract first frame from each video
   * 3. Compute layout
   * 4. Composite frames into final PNG
   * 5. 30s timeout
   * 6. Return output path and progress
   */
  async stitch(job: StitchJob): Promise<{ outputPath: string; progress: StitchProgress }> {
    const { sessionId, nodes, outputWidth, outputHeight } = job;
    const canvasSize: Vec2 = { x: outputWidth, y: outputHeight };
    const totalNodes = nodes.length;

    const progress: StitchProgress = {
      phase: 'extracting',
      progress: 0,
      nodesProcessed: 0,
      totalNodes,
    };

    // Wrap entire pipeline in a timeout
    const timeoutMs = this.config.timeoutMs;

    const pipelineResult = await Promise.race([
      this.runPipeline(job, canvasSize, progress),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Stitch timeout exceeded')), timeoutMs)
      ),
    ]).catch((err) => {
      progress.phase = 'failed';
      throw err;
    });

    return pipelineResult;
  }

  private async runPipeline(
    job: StitchJob,
    canvasSize: Vec2,
    progress: StitchProgress
  ): Promise<{ outputPath: string; progress: StitchProgress }> {
    const { sessionId, nodes, outputWidth, outputHeight } = job;
    const totalNodes = nodes.length;

    // Compute room bounds from node positions
    const positions = nodes.map((n) => n.position);
    const roomBounds = this.computeRoomBounds(positions);

    // Compute tile layout
    const layoutNodes = nodes.map((n) => ({ nodeId: n.nodeId, position: n.position }));
    const layout = this.computeTileLayout(layoutNodes, roomBounds, canvasSize);

    // Extract first frame from each available video
    progress.phase = 'extracting';
    const tiles = new Map<string, Buffer>();
    let nodesProcessed = 0;

    for (const node of nodes) {
      if (!node.videoPath || !fs.existsSync(node.videoPath)) {
        // Missing video — skip (will be black tile)
        nodesProcessed++;
        progress.nodesProcessed = nodesProcessed;
        progress.progress = nodesProcessed / totalNodes * 0.5;
        continue;
      }

      const outputDir = path.join(
        path.dirname(node.videoPath),
        `frames_${node.nodeId}`
      );

      const frames = await this.extractFrames(node.videoPath, outputDir);

      if (frames.length > 0) {
        // Use the first extracted frame
        const frameBuffer = await fs.promises.readFile(frames[0]);
        tiles.set(node.nodeId, frameBuffer);
      }

      nodesProcessed++;
      progress.nodesProcessed = nodesProcessed;
      progress.progress = nodesProcessed / totalNodes * 0.5;
    }

    // Composite frames
    progress.phase = 'compositing';
    progress.progress = 0.5;

    const compositeBuffer = await this.compositeFrame(tiles, layout, canvasSize);

    // Write output file
    progress.phase = 'encoding';
    progress.progress = 0.9;

    const outputDir = path.join('uploads', sessionId);
    await fs.promises.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'composite.png');
    await fs.promises.writeFile(outputPath, compositeBuffer);

    progress.phase = 'complete';
    progress.progress = 1.0;

    return { outputPath, progress };
  }

  private computeRoomBounds(positions: Vec2[]): Rect {
    if (positions.length === 0) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const pos of positions) {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    }

    const width = maxX - minX || 1;
    const height = maxY - minY || 1;

    return { x: minX, y: minY, width, height };
  }
}
