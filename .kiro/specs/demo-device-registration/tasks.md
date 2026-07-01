# Implementation Plan: ARGUS Live Demo System

## Overview

Multi-agent implementation of the ARGUS Live Demo system organized by agent responsibility (A-01 through A-09). Each agent corresponds to a package or subsystem in the monorepo. Build order respects the dependency chain: shared types first, then pure function libraries, server, and finally clients and infrastructure.

## Tasks

- [x] 1. A-01: Shared Types & Config (packages/shared)
  - [x] 1.1 Initialize monorepo structure with pnpm workspaces and turborepo
    - Create root `pnpm-workspace.yaml`, `turbo.json`, root `package.json`
    - Create `packages/shared/`, `packages/server/`, `packages/client-register/`, `packages/client-bms/`, `packages/infra/` directory stubs
    - Configure TypeScript 5.4 strict mode in root `tsconfig.json` and per-package configs
    - _Requirements: 10.1, 10.2_

  - [x] 1.2 Implement shared enums and core type definitions
    - Create `packages/shared/src/enums.ts` with `Phase`, `NodeStatus`, `WsMessageType` enums
    - Create `packages/shared/src/types.ts` with `DeviceNode`, `Vec2`, `Rect`, `RangingResult`, `AprilTagDetection`, `RssiResult`, `RssiMeasurement`, `MeshEdge`, `StitchProgress`, `DeviceCapabilities` interfaces
    - Create `packages/shared/src/ws-envelope.ts` with `WsEnvelope<T>` interface
    - Export all from `packages/shared/src/index.ts`
    - _Requirements: 2.2, 2.3, 3.2, 3.4, 4.2, 4.3, 8.1, 12.6_

  - [x] 1.3 Implement ArgusConfig schema and default configuration
    - Create `packages/shared/src/config.ts` with full `ArgusConfig` interface and `defaultConfig` constant
    - Include all subsections: server, room, capture, stitch, ranging, rssi, heartbeat, upload, aws, features
    - _Requirements: 10.5, 6.3, 7.4, 8.2, 8.3_

  - [x]* 1.4 Write property test for WebSocket envelope serialization round-trip
    - **Property 16: WebSocket Envelope Serialization Round-Trip**
    - Generate arbitrary `WsEnvelope` objects, serialize to JSON and deserialize, assert deep equality
    - **Validates: Requirements 8.1**

- [x] 2. Checkpoint — Shared types complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. A-05: Ranging Engine (packages/server/src/ranging.ts)
  - [x] 3.1 Implement pure ranging functions
    - Create `packages/server/src/ranging.ts` with `computeDistance`, `computeBearing`, `computePosition`, `solvePnP`, `averageTagPositions`, `computeConfidence`
    - All functions are pure with no side effects
    - `computeDistance`: `focalPx * qrSizeCm / qrPixelWidth`
    - `computeBearing`: `Math.atan2(offsetPx, focalPx) + gyroAlpha`
    - `computePosition`: `{ x: anchor.x + distance * Math.sin(bearing), y: anchor.y + distance * Math.cos(bearing) }`
    - `computeConfidence`: `clamp(0.4 + 0.15 * tagCount - tiltPenalty + proximityBonus, 0, 1)`
    - _Requirements: 3.2, 3.3, 3.4_

  - [x]* 3.2 Write property test for pinhole distance positivity and monotonicity
    - **Property 6: Pinhole Distance Positivity and Monotonicity**
    - For any positive focalPx, positive qrSizeCm, and positive qrPixelWidth, assert distance > 0
    - For increasing qrPixelWidth, assert distance strictly decreases
    - **Validates: Requirements 3.2**

  - [x]* 3.3 Write property test for bearing angle bounds
    - **Property 7: Bearing Angle Bounds**
    - For any pixel offset, positive focal length, and gyroscope alpha, assert normalized bearing ∈ [-π, π]
    - **Validates: Requirements 3.3**

  - [x]* 3.4 Write property test for confidence score bounds
    - **Property 8: Confidence Score Bounds**
    - For any tagCount ≥ 0, tilt angle, and proximity factor, assert confidence ∈ [0.0, 1.0]
    - **Validates: Requirements 3.4**

- [x] 4. A-06: RSSI Mesh Layer (packages/server/src/rssi.ts)
  - [x] 4.1 Implement RSSI path loss model and MDS algorithm
    - Create `packages/server/src/rssi.ts` with `rssiToDistance`, `computeMDS`, `procrustes`, `blendPositions`
    - `rssiToDistance`: `d0 * Math.pow(10, (rssi0 - rssi) / (10 * n))`
    - `computeMDS`: Classical MDS with double-centering and eigendecomposition
    - `procrustes`: Translation + rotation + uniform scale alignment
    - `blendPositions`: Weighted average of QR and MDS positions with weight cap
    - _Requirements: 4.2, 4.3, 4.4_

  - [x]* 4.2 Write property test for RSSI distance positivity and monotonicity
    - **Property 9: RSSI Distance Positivity and Monotonicity**
    - For any RSSI value, rssi0, d0 > 0, n > 0, assert distance > 0 and decreasing RSSI → increasing distance
    - **Validates: Requirements 4.2**

  - [x]* 4.3 Write property test for MDS relative distance preservation
    - **Property 10: MDS Relative Distance Preservation**
    - For any valid symmetric distance matrix with ≥ 3 nodes, assert rank ordering of pairwise distances is preserved in output
    - **Validates: Requirements 4.3**

  - [x]* 4.4 Write property test for Procrustes rigid transformation
    - **Property 11: Procrustes Rigid Transformation**
    - For any set of 2D points and references, assert pairwise distance ratios are preserved after alignment
    - **Validates: Requirements 4.4**

  - [x]* 4.5 Write property test for MDS node removal stability
    - **Property 19: MDS Node Removal Stability**
    - For any mesh with N ≥ 4 nodes, remove one node, recompute MDS, assert rank ordering preserved for remaining nodes
    - **Validates: Requirements 13.5**

- [x] 5. Checkpoint — Pure function libraries complete (A-05, A-06)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. A-02: BMS Server (packages/server)
  - [x] 6.1 Implement Phase State Machine (packages/server/src/phase.ts)
    - Create `PhaseMachine` class with `currentPhase`, `advance()`, `reset()`, `getValidTransitions()`, `getCurrentPhase()`
    - Validate sequential transitions: IDLE→REGISTER→MESH→DEPLOY→STITCH→IDLE
    - Kill switch: any phase → IDLE bypassing validation
    - Initialize to IDLE on construction
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [x]* 6.2 Write property test for phase transition validity
    - **Property 1: Phase Transition Validity**
    - For any current phase and requested phase, assert transition accepted iff requested is immediate successor in sequence
    - **Validates: Requirements 1.2, 1.3, 9.1**

  - [x]* 6.3 Write property test for phase persistence round-trip
    - **Property 2: Phase Persistence Round-Trip**
    - For any valid transition, assert getCurrentPhase() returns the new phase after advance
    - **Validates: Requirements 1.5**

  - [x]* 6.4 Write property test for kill switch universal reset
    - **Property 18: Kill Switch Universal Reset**
    - For any current phase, activating kill switch → phase becomes IDLE
    - **Validates: Requirements 9.4, 9.6**

  - [x] 6.5 Implement Node Registry (packages/server/src/registry.ts)
    - Create `Registry` class with in-memory `Map<string, DeviceNode>` store
    - `register()`: assign UUID v4, capture IP/UA/deviceType/capabilities, only during REGISTER phase
    - `getNode()`, `getAllNodes()`, `updateStatus()`, `updatePosition()`, `removeNode()`, `getNodeCount()`
    - `restoreNode()`: restore previous state if phase hasn't advanced
    - _Requirements: 2.2, 2.3, 2.5, 13.5, 13.7_

  - [x]* 6.6 Write property test for registration produces valid node identity
    - **Property 3: Registration Produces Valid Node Identity**
    - For any valid registration during REGISTER phase, assert nodeId matches UUID v4 format
    - **Validates: Requirements 2.2**

  - [x]* 6.7 Write property test for registration data completeness
    - **Property 4: Registration Data Completeness**
    - For any successful registration, assert non-empty IP, non-empty user agent, valid device type, capabilities present
    - **Validates: Requirements 2.3, 12.6**

  - [x]* 6.8 Write property test for registration phase guard
    - **Property 5: Registration Phase Guard**
    - For any registration attempt outside REGISTER phase, assert rejection and node count unchanged
    - **Validates: Requirements 2.5**

  - [x]* 6.9 Write property test for state restoration on reconnect
    - **Property 20: State Restoration on Reconnect**
    - For any node that disconnects and reconnects in same phase, assert status and position preserved
    - **Validates: Requirements 13.7**

  - [x] 6.10 Implement WebSocket Hub (packages/server/src/ws-hub.ts)
    - Create `WsHub` class managing connections map, heartbeat timer, message routing
    - `addConnection()`, `removeConnection()`, `broadcast()`, `sendTo()`
    - PING every 15s, expect PONG within 5s, 2 missed → disconnect + notify BMS
    - Observer mode: receives broadcasts, exempt from heartbeat disconnection
    - JSON envelope protocol enforced on all messages
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 1.4_

  - [x]* 6.11 Write property test for observer mode isolation
    - **Property 12: Observer Mode Isolation**
    - For any number of observer connections, assert node registry unchanged and observers not disconnected regardless of PONG behavior
    - **Validates: Requirements 5.7, 8.6**

  - [x]* 6.12 Write property test for heartbeat disconnection threshold
    - **Property 17: Heartbeat Disconnection Threshold**
    - For any non-observer client, assert disconnection iff ≥ 2 consecutive missed PINGs; assert connected if responds to at least 1 of every 2
    - **Validates: Requirements 8.4**

  - [x]* 6.13 Write property test for exponential backoff correctness
    - **Property 13: Exponential Backoff Correctness**
    - For any attempt n, assert delay = baseMs * 2^n clamped to max. Test both WebSocket (base=1000, max=30000, attempts=5) and upload (base=1000, attempts=3) scenarios
    - **Validates: Requirements 6.6, 8.7, 13.1, 13.2**

  - [x] 6.14 Implement Express routes and REST API (packages/server/src/routes.ts)
    - GET `/healthz` → status, phase, nodeCount, uptime
    - GET `/api/session` → sessionId, phase, config
    - GET `/api/nodes` → DeviceNode[] (operator key required)
    - POST `/api/operator/phase` → validate and advance phase (operator key required)
    - POST `/api/operator/kick/:nodeId` → kick node (operator key required)
    - POST `/upload/:nodeId` → multer multipart upload, max 50MB, session token required
    - GET `/composite/:sessionId` → serve composite PNG
    - Serve client SPAs at `/` and `/bms`
    - _Requirements: 1.2, 1.3, 1.5, 2.2, 2.5, 9.3, 10.2_

  - [x] 6.15 Implement server entry point and HTTPS setup (packages/server/src/index.ts)
    - Create Express app, attach WsHub, Registry, PhaseMachine
    - HTTPS with self-signed certificate support
    - Bind to 0.0.0.0 on configurable ports (default 3000/3443)
    - Wire phase transitions to WsHub broadcasts (within 100ms)
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 1.4, 1.6_

- [x] 7. Checkpoint — Server complete (A-02)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. A-07: Video Ingest & Stitcher (packages/server/src/stitcher.ts)
  - [x] 8.1 Implement video stitcher pipeline
    - Create `Stitcher` class with `computeTileLayout()`, `extractFrames()`, `compositeFrame()`, `stitch()`
    - `computeTileLayout`: map mesh coordinates to 1920x1080 canvas tile positions
    - `extractFrames`: invoke FFmpeg to extract frames from webm files
    - `compositeFrame`: use sharp to composite tiles into final PNG
    - `stitch`: full pipeline with 30s timeout, ≥60% threshold, black tiles for missing
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 8.2 Write property test for tile position within canvas bounds
    - **Property 14: Tile Position Within Canvas Bounds**
    - For any valid mesh coordinate within room bounds, assert mapped tile rectangle falls entirely within 1920x1080 canvas
    - **Validates: Requirements 7.2**

  - [x]* 8.3 Write property test for stitch threshold and completeness
    - **Property 15: Stitch Threshold and Completeness**
    - For any N registered nodes and M uploaded segments, assert output contains exactly N tile positions with M filled and N-M black
    - **Validates: Requirements 7.5, 13.3, 13.4**

- [x] 9. Checkpoint — Server + Stitcher complete (A-02, A-07)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. A-03: Registration Client (packages/client-register)
  - [x] 10.1 Scaffold React 18 + Vite 5 registration client project
    - Initialize `packages/client-register` with Vite 5, React 18, TypeScript strict
    - Configure dependency on `@argus/shared` package
    - Set up project structure: `src/components/`, `src/hooks/`, `src/services/`
    - _Requirements: 12.1, 12.2_

  - [x] 10.2 Implement WebSocket client with reconnection logic
    - Create `src/services/ws-client.ts` with `WsClient` class
    - `connect()`, `send()`, `reconnect()` with exponential backoff (1s, 2s, 4s, 8s, max 30s, 5 attempts)
    - PONG response to PING messages
    - Phase change event handling
    - _Requirements: 8.7, 13.1, 8.3, 2.4_

  - [x] 10.3 Implement QRScan phase component
    - Create `src/components/QRScan.tsx` using jsQR library
    - requestAnimationFrame loop: draw video frame to offscreen canvas, extract ImageData, pass to jsQR
    - Validate `argus://` protocol URL on detection
    - On success: POST /register with device info (IP, UA, device type, capabilities)
    - Handle camera permission request with instructional fallback
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 12.6_

  - [x] 10.4 Implement Ranging phase component
    - Create `src/components/Ranging.tsx` with camera frame analysis
    - Compute distance via pinhole model using QR pixel width
    - Compute bearing via DeviceOrientationEvent gyroscope data
    - Scan for AprilTags (if enabled) and refine via solvePnP
    - Report RangingResult to server via WebSocket
    - Fallback: QR-only if gyroscope unavailable, display message if camera denied
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 10.5 Implement RSSI phase component
    - Create `src/components/Rssi.tsx` with Web Bluetooth scanning
    - Request BLE device scan, collect RSSI measurements (5s timeout)
    - Convert RSSI → distance via path loss model
    - Report RssiResult to server via WebSocket
    - Fallback: report empty measurements if BLE unavailable (iOS Safari)
    - _Requirements: 4.1, 4.2, 4.5, 12.3_

  - [x] 10.6 Implement Standby and Capture phase components
    - Create `src/components/Standby.tsx`: display nodeId badge, connection status, await DEPLOY_ORDER
    - Create `src/components/Capture.tsx`: wait until syncTs, start MediaRecorder (webm/vp8, 480p max), record 10s, upload multipart POST with retry (3x, 1s/2s/4s backoff)
    - Handle camera unavailable: report failure, skip upload
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 13.2_

  - [x] 10.7 Implement sensor capability detection and fallback chain
    - Create `src/services/capabilities.ts`: detect camera, BLE, gyroscope availability
    - Implement fallback chain: camera denied → passive mode, gyro unavailable → QR-only, BLE unavailable → camera-only
    - Request iOS DeviceOrientationEvent permission explicitly
    - Report capabilities to server on registration
    - _Requirements: 12.3, 12.4, 12.5, 12.6, 13.6_

  - [x] 10.8 Wire phase-based view routing in registration client
    - Create main `App.tsx` with phase-driven component switching
    - Listen to WebSocket PHASE_CHANGE events to transition views
    - QRScan → Ranging → RSSI → Standby → Capture flow
    - Certificate acceptance instructions on first HTTPS connection
    - _Requirements: 2.4, 10.4_

- [x] 11. Checkpoint — Registration client complete (A-03)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. A-04: BMS Display (packages/client-bms)
  - [x] 12.1 Scaffold React 18 + Vite 5 BMS client project
    - Initialize `packages/client-bms` with Vite 5, React 18, TypeScript strict
    - Configure dependency on `@argus/shared` package
    - Set up JetBrains Mono font, military tactical color scheme (#050D1A, #00FF9C, #00BFFF)
    - _Requirements: 5.1_

  - [x] 12.2 Implement Canvas 2D tactical display renderer
    - Create `src/components/TacticalCanvas.tsx` with `TacticalCanvas` class
    - `roomToScreen()` / `screenToRoom()` coordinate mapping
    - Render layers in order: grid, mesh edges, nodes, phase HUD, video tiles
    - Dark background, dashed grid overlay, green/amber node indicators
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 12.3 Implement node map and mesh overlay rendering
    - Render registered nodes at mesh positions with status indicators
    - Draw mesh connectivity lines between nodes with ranging measurements
    - Update within 500ms on node connect/disconnect events
    - Display QR code during REGISTER phase with node count badge
    - _Requirements: 5.2, 5.3, 5.6, 2.1, 2.6_

  - [x] 12.4 Implement phase HUD and video tile grid
    - Phase HUD: show current phase state, transition controls for operator
    - Video tile grid: display captured segments during STITCH phase
    - Show recording countdown and per-node progress during DEPLOY
    - Display composite result when stitching completes
    - _Requirements: 5.4, 5.5, 7.6_

  - [x] 12.5 Implement BMS WebSocket connection in observer mode
    - Connect to WebSocket server as observer (not counted as node)
    - Receive all broadcasts: phase changes, node events, mesh updates, stitch progress
    - No heartbeat disconnection for observer connections
    - _Requirements: 5.7, 8.6_

- [x] 13. A-09: Operator Console (packages/client-bms operator panel)
  - [x] 13.1 Implement operator console slide-in panel
    - Create `src/components/OperatorConsole.tsx`: slide-in panel toggled by 'O' key
    - Phase-advance buttons showing only valid transitions from current phase
    - Node table: nodeId, IP, device type, connection status, last heartbeat
    - Per-node kick button calling POST `/api/operator/kick/:nodeId`
    - Kill switch button: IDLE + disconnect all within 200ms
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_

  - [x] 13.2 Implement keyboard shortcuts for operator controls
    - Space → advance to next valid phase
    - Escape → kill switch (IDLE + disconnect all)
    - Tab → focus node table
    - 'O' → toggle operator console panel
    - Require `X-Operator-Key` header on all control API calls
    - _Requirements: 9.5, 9.6_

- [x] 14. Checkpoint — All clients complete (A-03, A-04, A-09)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. A-08: AWS Infrastructure (packages/infra)
  - [x] 15.1 Implement CDK v2 stack for ECS Fargate deployment
    - Create `packages/infra/lib/argus-stack.ts` extending `cdk.Stack`
    - ECS Cluster + Fargate Service: 2 vCPU, 4GB RAM, node:20-alpine + ffmpeg Docker image
    - ECR repository for Docker image
    - VPC with public subnets for ALB
    - _Requirements: 11.1_

  - [x] 15.2 Implement S3 bucket and CloudFront distribution
    - S3 bucket for video uploads and composite output with 24h lifecycle rule
    - CloudFront distribution serving client-register and client-bms SPA assets
    - Origin access identity for S3 bucket
    - _Requirements: 11.2, 11.3_

  - [x] 15.3 Implement ALB with WebSocket sticky sessions
    - Application Load Balancer with target group pointing to Fargate service
    - Sticky session configuration for WebSocket connection routing
    - Health check on `/healthz` endpoint
    - Feature flag switching between local filesystem and S3 storage
    - _Requirements: 11.4, 11.5_

- [x] 16. Integration and Wiring
  - [x] 16.1 Wire local vs cloud mode feature flags
    - Implement conditional storage (local filesystem vs S3) in server based on `config.aws.enabled`
    - Implement conditional asset serving (Express static vs CloudFront) based on mode
    - Ensure client code is identical in both modes
    - _Requirements: 11.5, 10.1, 10.2_

  - [x] 16.2 Implement end-to-end phase orchestration flow
    - Wire phase transitions → WebSocket broadcasts → client view changes
    - DEPLOY phase: broadcast CAPTURE_START with synchronized timestamp to all nodes
    - STITCH phase: trigger stitcher pipeline on phase entry
    - Kill switch: broadcast KILL, disconnect all, reset phase
    - _Requirements: 1.4, 6.1, 7.1, 9.6_

  - [x]* 16.3 Write integration tests for full registration and phase flow
    - Test: server starts in IDLE, advance through all phases
    - Test: registration during REGISTER phase, rejection outside REGISTER
    - Test: WebSocket heartbeat cycle (PING/PONG/disconnect)
    - Test: upload pipeline (multipart → storage)
    - Test: BMS observer mode receives broadcasts without counting as node
    - _Requirements: 1.1, 1.2, 2.2, 2.5, 8.4, 5.7_

- [x] 17. Final Checkpoint — Full system integration complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each agent group
- Property tests validate the 20 universal correctness properties from the design document
- All pure function libraries (A-05, A-06) are built first to enable thorough testing before server integration
- TypeScript 5.4 strict mode is enforced across all packages
- The system must function offline on ARGUS-NET local hotspot — no external CDN dependencies

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 4, "tasks": ["6.1", "6.5", "6.10"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4", "6.6", "6.7", "6.8", "6.9", "6.11", "6.12", "6.13"] },
    { "id": 6, "tasks": ["6.14", "6.15", "8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3"] },
    { "id": 8, "tasks": ["10.1", "12.1", "15.1"] },
    { "id": 9, "tasks": ["10.2", "10.3", "12.2", "15.2"] },
    { "id": 10, "tasks": ["10.4", "10.5", "10.6", "10.7", "12.3", "12.4", "12.5", "15.3"] },
    { "id": 11, "tasks": ["10.8", "13.1", "13.2"] },
    { "id": 12, "tasks": ["16.1", "16.2"] },
    { "id": 13, "tasks": ["16.3"] }
  ]
}
```
