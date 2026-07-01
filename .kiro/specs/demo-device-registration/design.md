# Design Document

## Overview

This document defines the architecture and detailed design for the ARGUS Live Demo system — a multi-agent demonstration platform that transforms audience mobile devices into simulated drone swarm nodes during a live presentation. The system orchestrates 5 sequential phases (IDLE, REGISTER, MESH, DEPLOY, STITCH) coordinated by an Operator via a Battle Management Station (BMS), with audience devices contributing ranging measurements, mesh formation data, and synchronized video captures.

## Architecture

### Monorepo Structure

The system uses a pnpm workspace monorepo managed by Turborepo:

```
argus-live-demo/
├── packages/
│   ├── shared/          # @argus/shared — TypeScript types, enums, config schema
│   ├── server/          # Node.js 20 Express + ws server
│   ├── client-register/ # React 18 + Vite 5 SPA (audience devices)
│   ├── client-bms/      # React 18 + Vite 5 SPA (operator display)
│   └── infra/           # AWS CDK v2 TypeScript stack
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 (server), Browser (clients) |
| Server Framework | Express 4 |
| WebSocket | ws library |
| Client Framework | React 18 + Vite 5 |
| Shared Types | TypeScript 5, @argus/shared |
| Video Processing | FFmpeg (frame extraction), sharp (compositing) |
| File Upload | multer (multipart) |
| Infrastructure | AWS CDK v2, ECS Fargate, S3, CloudFront, ALB |
| QR Scanning | jsQR |
| BLE | Web Bluetooth API |
| Canvas | HTML5 Canvas 2D |

## Data Models

### Enums

```typescript
export enum Phase {
  IDLE = 'IDLE',
  REGISTER = 'REGISTER',
  MESH = 'MESH',
  DEPLOY = 'DEPLOY',
  STITCH = 'STITCH',
}

export enum NodeStatus {
  REGISTERED = 'REGISTERED',
  RANGED = 'RANGED',
  MESHED = 'MESHED',
  DEPLOYED = 'DEPLOYED',
  UPLOADED = 'UPLOADED',
  ERROR = 'ERROR',
}

export enum WsMessageType {
  PING = 'PING',
  PONG = 'PONG',
  PHASE_CHANGE = 'PHASE_CHANGE',
  NODE_REGISTERED = 'NODE_REGISTERED',
  NODE_DISCONNECTED = 'NODE_DISCONNECTED',
  RANGING_RESULT = 'RANGING_RESULT',
  RSSI_RESULT = 'RSSI_RESULT',
  MESH_UPDATE = 'MESH_UPDATE',
  CAPTURE_START = 'CAPTURE_START',
  UPLOAD_COMPLETE = 'UPLOAD_COMPLETE',
  STITCH_COMPLETE = 'STITCH_COMPLETE',
  DEPLOY_ORDER = 'DEPLOY_ORDER',
  KILL = 'KILL',
  KICK = 'KICK',
}
```

### Core Types

```typescript
export interface DeviceNode {
  nodeId: string;           // UUID v4
  ip: string;
  userAgent: string;
  deviceType: 'android' | 'ios';
  status: NodeStatus;
  position: Vec2 | null;
  capabilities: DeviceCapabilities;
  connectedAt: number;     // Unix timestamp ms
  lastHeartbeat: number;   // Unix timestamp ms
  sessionToken: string;
}

export interface DeviceCapabilities {
  camera: boolean;
  ble: boolean;
  gyroscope: boolean;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RangingResult {
  fromNodeId: string;
  toNodeId: string;
  distance: number;       // cm
  bearing: number | null; // radians, null if gyro unavailable
  confidence: number;     // 0.0 - 1.0
  method: 'qr' | 'apriltag';
}

export interface AprilTagDetection {
  tagId: number;
  corners: [Vec2, Vec2, Vec2, Vec2];
  pose: { rotation: number[][]; translation: number[] };
}

export interface RssiResult {
  fromNodeId: string;
  measurements: RssiMeasurement[];
}

export interface RssiMeasurement {
  toNodeId: string;
  rssi: number;         // dBm
  distance: number;     // cm (computed)
}

export interface MeshEdge {
  nodeA: string;
  nodeB: string;
  distance: number;
  confidence: number;
}

export interface StitchProgress {
  phase: 'extracting' | 'compositing' | 'encoding' | 'complete' | 'failed';
  progress: number;     // 0.0 - 1.0
  nodesProcessed: number;
  totalNodes: number;
}
```

### WebSocket Envelope

```typescript
export interface WsEnvelope<T = unknown> {
  type: WsMessageType;
  sessionId: string;
  ts: number;           // Unix timestamp ms
  payload: T;
}
```

### Configuration Schema

```typescript
export interface ArgusConfig {
  server: {
    httpPort: number;       // default 3000
    httpsPort: number;      // default 3443
    host: string;           // default '0.0.0.0'
    certPath: string;
    keyPath: string;
  };
  room: {
    width: number;          // cm
    height: number;         // cm
    qrAnchors: Vec2[];      // known QR position anchors in room coords
    aprilTags: { tagId: number; position: Vec2 }[];
  };
  capture: {
    duration: number;       // seconds, default 10
    maxResolution: number;  // pixels height, default 480
    codec: string;          // default 'video/webm;codecs=vp8'
  };
  stitch: {
    outputWidth: number;    // default 1920
    outputHeight: number;   // default 1080
    uploadThreshold: number; // default 0.6 (60%)
    timeoutMs: number;      // default 30000
  };
  ranging: {
    qrSizeCm: number;      // physical QR code size
    focalPxDefault: number; // default focal length estimate
  };
  rssi: {
    rssi0: number;          // reference RSSI at D0, default -40
    d0: number;             // reference distance cm, default 100
    n: number;              // path loss exponent, default 2.0
    blendWeightCap: number; // max MDS blend weight, default 0.3
  };
  heartbeat: {
    intervalMs: number;     // default 15000
    timeoutMs: number;      // default 5000
    maxMissed: number;      // default 2
  };
  upload: {
    maxSizeMb: number;      // default 50
    retryCount: number;     // default 3
    retryBaseMs: number;    // default 1000
  };
  aws: {
    enabled: boolean;
    region: string;
    s3Bucket: string;
    lifecycleDays: number;  // default 1 (24h)
  };
  features: {
    bleEnabled: boolean;
    aprilTagEnabled: boolean;
    cloudMode: boolean;
  };
}
```

## Components and Interfaces

### ws-hub.ts — WebSocket Event Bus

Manages all WebSocket connections, message routing, and heartbeat monitoring.

```typescript
// Connection management
interface WsConnection {
  ws: WebSocket;
  nodeId: string;
  isObserver: boolean;
  missedPings: number;
  lastPong: number;
}

class WsHub {
  private connections: Map<string, WsConnection>;
  private heartbeatInterval: NodeJS.Timer;

  constructor(config: ArgusConfig['heartbeat']);

  // Connection lifecycle
  addConnection(ws: WebSocket, nodeId: string, isObserver: boolean): void;
  removeConnection(nodeId: string): void;

  // Messaging
  broadcast(envelope: WsEnvelope): void;
  sendTo(nodeId: string, envelope: WsEnvelope): void;

  // Heartbeat: PING every 15s, expect PONG within 5s
  // 2 missed PINGs → mark disconnected, notify BMS
  // Observer connections exempt from heartbeat disconnection
  private startHeartbeat(): void;
  private handlePong(nodeId: string): void;
}
```

**Key behaviors:**
- PING/PONG heartbeat cycle: 15s interval, 5s response window
- 2 consecutive missed PINGs triggers disconnection + BMS notification
- Observer mode (BMS): receives all broadcasts, exempt from heartbeat timeout
- JSON envelope protocol enforced on all messages

### registry.ts — Node Registry

In-memory store for all registered device nodes.

```typescript
class Registry {
  private nodes: Map<string, DeviceNode>;

  register(ip: string, userAgent: string, deviceType: 'android' | 'ios',
           capabilities: DeviceCapabilities): DeviceNode;
  getNode(nodeId: string): DeviceNode | undefined;
  getAllNodes(): DeviceNode[];
  updateStatus(nodeId: string, status: NodeStatus): void;
  updatePosition(nodeId: string, position: Vec2): void;
  removeNode(nodeId: string): boolean;
  getNodeCount(): number;

  // State restoration for reconnecting nodes
  restoreNode(nodeId: string, currentPhase: Phase): DeviceNode | undefined;
}
```

**Key behaviors:**
- Assigns UUID v4 nodeId on registration
- Captures IP, user agent, device type, capabilities
- Registration only allowed during REGISTER phase
- Supports node removal for kick/disconnect operations
- State restoration for reconnecting nodes (same phase only)

### phase.ts — Phase State Machine

```typescript
const PHASE_SEQUENCE: Phase[] = [
  Phase.IDLE, Phase.REGISTER, Phase.MESH, Phase.DEPLOY, Phase.STITCH
];

class PhaseMachine {
  private currentPhase: Phase = Phase.IDLE;

  getCurrentPhase(): Phase;

  // Validates transition follows IDLE→REGISTER→MESH→DEPLOY→STITCH→IDLE
  advance(requestedPhase: Phase): { success: boolean; error?: string };

  // Kill switch: any phase → IDLE
  reset(): void;

  // Returns valid next phase(s) from current
  getValidTransitions(): Phase[];
}
```

**Key behaviors:**
- Initializes to IDLE on system start
- Only sequential transitions are valid (returns HTTP 400 for invalid)
- STITCH→IDLE wraps the cycle
- Kill switch bypasses sequence validation (any phase → IDLE)
- Current phase exposed via GET endpoint

### ranging.ts — Pure Ranging Functions

All functions are pure (no side effects), making them highly testable.

```typescript
// Pinhole model distance estimation
function computeDistance(focalPx: number, qrSizeCm: number, qrPixelWidth: number): number;
// Result: focalPx * qrSizeCm / qrPixelWidth

// Bearing from gyro + QR offset
function computeBearing(offsetPx: number, focalPx: number, gyroAlpha: number): number;
// Result: Math.atan2(offsetPx, focalPx) + gyroAlpha

// Position from anchor + polar coordinates
function computePosition(anchor: Vec2, distance: number, bearing: number): Vec2;
// Result: { x: anchor.x + distance * Math.sin(bearing),
//           y: anchor.y + distance * Math.cos(bearing) }

// AprilTag DLT homography → pose estimation
function solvePnP(detections: AprilTagDetection[], tagPositions: Vec2[]): Vec2;

// Multi-tag average position
function averageTagPositions(positions: Vec2[]): Vec2;

// Confidence scoring
function computeConfidence(params: {
  tagCount: number;
  tiltAngle: number;
  proximityFactor: number;
}): number;
// Result: clamp(0.4 + 0.15 * tagCount - tiltPenalty + proximityBonus, 0, 1)
```

### rssi.ts — RSSI Processing & MDS

```typescript
// Path loss model: distance from RSSI
function rssiToDistance(rssi: number, rssi0: number, d0: number, n: number): number;
// Result: d0 * Math.pow(10, (rssi0 - rssi) / (10 * n))

// Classical Multi-Dimensional Scaling
function computeMDS(distanceMatrix: number[][]): Vec2[];
// Double-center, eigendecomposition (Jacobi), top 2 eigenvectors

// Procrustes alignment to reference coordinates
function procrustes(mdsPositions: Vec2[], referencePositions: Vec2[]): Vec2[];
// Translation + rotation + scale alignment

// Blended position: QR + MDS
function blendPositions(
  posQr: Vec2, posMds: Vec2, measurementCount: number, totalNodes: number,
  weightCap: number
): Vec2;
// weight = min(weightCap, measurementCount / totalNodes * 0.5)
// Result: { x: (1 - w) * posQr.x + w * posMds.x,
//           y: (1 - w) * posQr.y + w * posMds.y }
```

### stitcher.ts — Video Compositing Pipeline

```typescript
interface StitchJob {
  sessionId: string;
  nodes: { nodeId: string; position: Vec2; videoPath: string }[];
  outputWidth: number;   // 1920
  outputHeight: number;  // 1080
}

class Stitcher {
  constructor(config: ArgusConfig['stitch']);

  // Map mesh coordinates to canvas tile positions
  computeTileLayout(nodes: { nodeId: string; position: Vec2 }[],
                    roomBounds: Rect, canvasSize: Vec2): Map<string, Rect>;

  // Extract frames from webm using FFmpeg
  extractFrames(videoPath: string, outputDir: string): Promise<string[]>;

  // Compose tiles into final PNG using sharp
  compositeFrame(tiles: Map<string, Buffer>, layout: Map<string, Rect>,
                 canvasSize: Vec2): Promise<Buffer>;

  // Full pipeline: extract → layout → composite → export
  stitch(job: StitchJob): Promise<{ outputPath: string; progress: StitchProgress }>;
}
```

**Key behaviors:**
- Upload via multer (max 50MB per file)
- FFmpeg extracts frames from webm uploads
- Position-based tile layout maps room coordinates to 1920x1080 canvas
- Proceeds at ≥60% upload threshold; missing tiles render as black
- Falls back to node map export if FFmpeg fails
- 30-second timeout for up to 20 segments

### Express Routes & REST API

```typescript
// Health & session
GET  /healthz                    → { status: 'ok', phase, nodeCount, uptime }
GET  /api/session                → { sessionId, phase, config }

// Node management (operator key required)
GET  /api/nodes                  → DeviceNode[]
POST /api/operator/phase         → { phase: Phase } // body: { phase: string }
POST /api/operator/kick/:nodeId  → { success: boolean }

// Upload (session token required)
POST /upload/:nodeId             → { success: boolean, path: string }
                                   // multipart, max 50MB

// Composite retrieval
GET  /composite/:sessionId       → PNG file

// Client serving
GET  /                           → serves client-register SPA
GET  /bms                        → serves client-bms SPA
```

**Auth:**
- Operator endpoints require `X-Operator-Key` header
- Upload endpoint requires valid session token from registration
- No external auth (local network trust model)

## Client-Register (packages/client-register)

### Phase Flow

The registration client progresses through sub-phases aligned with the server phase machine:

```
1. QRScan    → User scans BMS-displayed QR, registers device
2. Ranging   → Camera-based distance/bearing measurement
3. RSSI      → BLE probe for mesh distance data
4. Standby   → Display nodeId, await DEPLOY_ORDER
5. Capture   → Record 10s video, upload to server
```

### QRScan Phase

```typescript
// jsQR scanning in requestAnimationFrame loop
function startQrScanning(videoElement: HTMLVideoElement): Observable<string> {
  // 1. Draw video frame to offscreen canvas
  // 2. Extract ImageData
  // 3. Pass to jsQR for detection
  // 4. Validate argus:// protocol URL
  // 5. On success: POST /register with device info
}
```

### Ranging Phase

```typescript
// Freeze frame analysis
async function performRanging(): Promise<RangingResult> {
  // 1. Capture current frame
  // 2. Extract QR code pixel metrics (width in pixels)
  // 3. Read gyroscope snapshot (DeviceOrientationEvent)
  // 4. Scan for AprilTags (if enabled)
  // 5. Compute distance via pinhole model
  // 6. Compute bearing via gyro + offset
  // 7. Refine via solvePnP if AprilTags detected
  // 8. Report RangingResult to server
}
```

### RSSI Phase

```typescript
async function performRssiProbe(timeoutMs: number = 5000): Promise<RssiResult> {
  // 1. Request Web Bluetooth device scan
  // 2. Collect RSSI for discovered ARGUS nodes (5s timeout)
  // 3. Convert RSSI → distance via path loss model
  // 4. Report RssiResult to server
  // Fallback: if BLE unavailable, report empty measurements
}
```

### Standby Phase

Displays node ID badge, connection status, and waits for `DEPLOY_ORDER` WebSocket message.

### Capture Phase

```typescript
async function captureVideo(syncTs: number, duration: number): Promise<Blob> {
  // 1. Wait until syncTs (server-synchronized start time)
  // 2. Start MediaRecorder (webm/vp8, 480p max)
  // 3. Record for exactly `duration` seconds
  // 4. Stop recording, return Blob
  // 5. Upload via multipart POST with progress tracking
  // Retry: 3x exponential backoff (1s, 2s, 4s)
}
```

### WebSocket Client

```typescript
class WsClient {
  private ws: WebSocket | null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  connect(url: string, nodeId: string): void;
  send(envelope: WsEnvelope): void;

  // Exponential backoff: 1s, 2s, 4s, 8s (capped at 30s)
  private reconnect(): void;
  private getBackoffDelay(attempt: number): number;
  // Result: Math.min(1000 * Math.pow(2, attempt), 30000)

  // Heartbeat response
  private handlePing(): void; // respond with PONG immediately
}
```

### Sensor Fallback Chain

```
Camera available? → Yes → QR ranging + AprilTag
                  → No  → Display instructions, disable ranging

Gyroscope available? → Yes → Bearing computation
                     → No  → QR-only (bearing = null)

BLE available? → Yes → RSSI probe
               → No  → Camera-only mesh contribution

All sensors unavailable? → Passive mode (video capture only)
```

## Client-BMS (packages/client-bms)

### Visual Design

- Background: `#050D1A` (deep navy)
- Primary accent: `#00FF9C` (tactical green)
- Secondary accent: `#00BFFF` (info blue)
- Font: JetBrains Mono
- Grid overlay: subtle dashed lines at room coordinate intervals

### Canvas 2D Rendering

```typescript
class TacticalCanvas {
  private ctx: CanvasRenderingContext2D;
  private roomBounds: Rect;

  // Coordinate mapping: room coords → screen pixels
  roomToScreen(pos: Vec2): Vec2;
  screenToRoom(pos: Vec2): Vec2;

  // Render layers (drawn in order)
  renderGrid(): void;
  renderMeshEdges(edges: MeshEdge[]): void;
  renderNodes(nodes: DeviceNode[]): void;
  renderPhaseHUD(phase: Phase): void;
  renderVideoTiles(tiles: Map<string, string>): void; // STITCH phase
}
```

### Phase-to-Screen Mapping

| Phase | BMS Display |
|-------|------------|
| IDLE | System logo, waiting indicator |
| REGISTER (P0) | QR code display, node count badge |
| MESH (P1) | Node map + roster, mesh edges forming |
| DEPLOY (P3) | Recording countdown, progress bars per node |
| STITCH (P4) | Video tile grid, composite progress |

### Operator Console

```typescript
class OperatorConsole {
  private isOpen: boolean = false;

  // Toggle: 'O' key
  toggle(): void;

  // Phase controls: only show valid transitions
  renderPhaseButtons(currentPhase: Phase, validTransitions: Phase[]): void;

  // Node table: nodeId, IP, device type, status, last heartbeat
  renderNodeTable(nodes: DeviceNode[]): void;

  // Per-node kick button
  kickNode(nodeId: string): Promise<void>;

  // Kill switch: Escape key → IDLE + disconnect all
  activateKillSwitch(): Promise<void>;

  // Keyboard shortcuts
  // Space → advance phase
  // Escape → kill switch
  // Tab → focus node table
  // O → toggle console
}
```

**Key behaviors:**
- Slide-in panel activated by 'O' key
- Operator key required for all control actions
- Phase buttons dynamically show only valid next transitions
- Kill switch immediately transitions to IDLE and disconnects all nodes

## Error Handling

### WebSocket Reconnection

```
Connection drops → attempt 1 (wait 1s) → attempt 2 (wait 2s) →
attempt 3 (wait 4s) → attempt 4 (wait 8s) → attempt 5 (wait 16s) → give up
```

Formula: `delay = min(baseMs * 2^attempt, maxMs)` where baseMs=1000, maxMs=30000

### Upload Retry

```
Upload fails → retry 1 (wait 1s) → retry 2 (wait 2s) → retry 3 (wait 4s) → report failure
```

Formula: `delay = baseMs * 2^(attempt-1)` where baseMs=1000, max attempts=3

### Phase Transition Errors

- Invalid transition requests: HTTP 400 with `{ error: 'Invalid transition from X to Y' }`
- Operator key missing/invalid: HTTP 401

### Sensor Fallback Chain

| Sensor | Fallback | Impact |
|--------|----------|--------|
| Camera denied | Disable ranging entirely | Node has no position, passive mode |
| Gyroscope unavailable | QR-only ranging (bearing=null) | Reduced position accuracy |
| BLE unavailable | Camera-only mesh | No RSSI contribution |
| All sensors unavailable | Passive mode | Video capture only |

### Stitching Failures

- FFmpeg failure: Fall back to static node map PNG export
- <60% uploads: Proceed with available segments, black tiles for missing
- Timeout (30s): Return partial composite if possible

## AWS Cloud Deployment (packages/infra)

### CDK Stack Architecture

```typescript
// packages/infra/lib/argus-stack.ts
class ArgusStack extends cdk.Stack {
  // ECS Fargate: 2 vCPU, 4GB RAM, single task
  // Docker: node:20-alpine + ffmpeg
  private readonly cluster: ecs.Cluster;
  private readonly service: ecs.FargateService;

  // S3: video uploads + composite output, 24h lifecycle
  private readonly bucket: s3.Bucket;

  // CloudFront: SPA assets (client-register, client-bms)
  private readonly distribution: cloudfront.Distribution;

  // ALB: WebSocket routing with sticky sessions
  private readonly alb: elbv2.ApplicationLoadBalancer;

  // ECR: Docker image repository
  private readonly repository: ecr.Repository;
}
```

### Local vs Cloud Mode

The system uses feature flags to switch between local and cloud operation:

```typescript
if (config.aws.enabled) {
  // S3 for video storage
  // CloudFront for asset serving
  // ALB for WebSocket routing
} else {
  // Local filesystem for video storage
  // Express static serving for assets
  // Direct WebSocket connections
}
```

Client code remains identical — only server-side storage and routing differ.

## Testing Strategy

### Unit Tests
- Phase state machine: valid/invalid transitions, initialization, kill switch
- Ranging pure functions: pinhole distance, bearing, confidence scoring
- RSSI pure functions: path loss model, MDS, Procrustes alignment, blending
- Registry: CRUD operations, phase guard, state restoration
- WebSocket envelope: serialization/deserialization
- Backoff computation: delay sequences for retry and reconnect
- Tile layout: coordinate mapping, bounds checking

### Property-Based Tests
- All pure mathematical functions (ranging, RSSI, MDS, Procrustes)
- State machine transition logic
- Serialization round-trips
- Registry invariants

### Integration Tests
- WebSocket heartbeat cycle (PING/PONG/disconnect)
- Phase broadcast to connected clients
- Upload pipeline (multipart → storage → stitcher)
- End-to-end registration flow
- BMS observer mode connectivity

### Smoke Tests
- Server starts and initializes to IDLE
- HTTPS with self-signed certificate serves clients
- Health endpoint responds
- Local mode operates without internet

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Phase Transition Validity

*For any* current phase and requested next phase, the phase state machine SHALL accept the transition if and only if the requested phase is the immediate successor in the sequence IDLE→REGISTER→MESH→DEPLOY→STITCH→IDLE. All other transitions SHALL be rejected with an error.

**Validates: Requirements 1.2, 1.3, 9.1**

### Property 2: Phase Persistence Round-Trip

*For any* valid phase transition that is accepted, querying the current phase via the GET endpoint SHALL return the newly transitioned phase.

**Validates: Requirements 1.5**

### Property 3: Registration Produces Valid Node Identity

*For any* registration request received during REGISTER phase with valid device information, the system SHALL assign a nodeId that conforms to UUID v4 format (8-4-4-4-12 hex pattern with version 4 indicator).

**Validates: Requirements 2.2**

### Property 4: Registration Data Completeness

*For any* successful registration, the resulting DeviceNode SHALL contain a non-empty IP address, a non-empty user agent string, a valid device type (android or ios), and a capabilities object reflecting the device's available sensors.

**Validates: Requirements 2.3, 12.6**

### Property 5: Registration Phase Guard

*For any* registration attempt received while the phase state machine is in a phase other than REGISTER, the system SHALL reject the request with an error and the node registry count SHALL remain unchanged.

**Validates: Requirements 2.5**

### Property 6: Pinhole Distance Positivity and Monotonicity

*For any* positive focal length, positive QR physical size, and positive QR pixel width, the computed distance SHALL be positive and SHALL decrease monotonically as QR pixel width increases (object appears larger when closer).

**Validates: Requirements 3.2**

### Property 7: Bearing Angle Bounds

*For any* pixel offset, positive focal length, and gyroscope alpha value, the computed bearing SHALL produce a value that, when normalized to [-π, π], represents a valid directional angle.

**Validates: Requirements 3.3**

### Property 8: Confidence Score Bounds

*For any* combination of tag count (≥0), tilt angle, and proximity factor, the computed confidence score SHALL be clamped within the range [0.0, 1.0] inclusive.

**Validates: Requirements 3.4**

### Property 9: RSSI Distance Positivity and Monotonicity

*For any* RSSI measurement value, reference RSSI (rssi0), reference distance (d0 > 0), and path loss exponent (n > 0), the computed distance SHALL be positive and SHALL increase monotonically as the RSSI value decreases (weaker signal = farther away).

**Validates: Requirements 4.2**

### Property 10: MDS Relative Distance Preservation

*For any* valid symmetric distance matrix with at least 3 nodes, the MDS-computed 2D positions SHALL preserve the rank ordering of pairwise distances — if node A is closer to node B than to node C in the input matrix, then the Euclidean distance between A and B in the output SHALL be less than or equal to the distance between A and C.

**Validates: Requirements 4.3**

### Property 11: Procrustes Rigid Transformation

*For any* set of 2D points and reference coordinates, applying Procrustes alignment SHALL preserve the pairwise distance ratios between all point pairs (the transformation is similarity-preserving: translation + rotation + uniform scale).

**Validates: Requirements 4.4**

### Property 12: Observer Mode Isolation

*For any* number of observer-mode connections (BMS clients), the node registry count SHALL remain unchanged, and observer connections SHALL NOT be subject to heartbeat-based disconnection regardless of PONG response behavior.

**Validates: Requirements 5.7, 8.6**

### Property 13: Exponential Backoff Correctness

*For any* retry attempt number n (0-indexed), the computed backoff delay SHALL equal `baseMs * 2^n` clamped to a maximum value. For WebSocket reconnection: base=1000ms, max=30000ms, maxAttempts=5. For upload retry: base=1000ms, maxAttempts=3.

**Validates: Requirements 6.6, 8.7, 13.1, 13.2**

### Property 14: Tile Position Within Canvas Bounds

*For any* valid mesh coordinate within the room bounds, the mapped tile rectangle SHALL fall entirely within the 1920x1080 output canvas (no tile extends beyond canvas boundaries).

**Validates: Requirements 7.2**

### Property 15: Stitch Threshold and Completeness

*For any* combination of N registered nodes and M uploaded segments (where M ≥ 0), the stitcher SHALL always produce an output composite. The output SHALL contain exactly N tile positions: M tiles with video content and (N-M) tiles filled with black.

**Validates: Requirements 7.5, 13.3, 13.4**

### Property 16: WebSocket Envelope Serialization Round-Trip

*For any* valid WsEnvelope object (with type, sessionId, timestamp, and payload), serializing to JSON and deserializing back SHALL produce an object equal to the original envelope.

**Validates: Requirements 8.1**

### Property 17: Heartbeat Disconnection Threshold

*For any* non-observer client connection, if and only if the client misses 2 or more consecutive PING responses, the server SHALL mark the node as disconnected. A client that responds to at least one of every 2 consecutive PINGs SHALL remain connected.

**Validates: Requirements 8.4**

### Property 18: Kill Switch Universal Reset

*For any* current phase (IDLE, REGISTER, MESH, DEPLOY, or STITCH), activating the kill switch SHALL transition the phase state machine to IDLE and the resulting node registry SHALL be empty (all nodes disconnected).

**Validates: Requirements 9.4, 9.6**

### Property 19: MDS Node Removal Stability

*For any* valid mesh with N ≥ 4 nodes and valid positions, removing one node and recomputing MDS for the remaining N-1 nodes SHALL produce valid 2D positions that preserve the rank ordering of pairwise distances among the remaining nodes.

**Validates: Requirements 13.5**

### Property 20: State Restoration on Reconnect

*For any* node that disconnects and subsequently reconnects while the phase state machine has NOT advanced beyond the phase at the time of disconnection, the restored node SHALL have the same status and position as before disconnection.

**Validates: Requirements 13.7**
