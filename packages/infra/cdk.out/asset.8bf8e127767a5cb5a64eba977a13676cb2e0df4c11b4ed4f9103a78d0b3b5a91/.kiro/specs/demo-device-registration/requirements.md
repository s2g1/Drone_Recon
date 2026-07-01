# Requirements Document

## Introduction

ARGUS Live Demo is a multi-agent demonstration system that transforms audience mobile devices into simulated drone swarm nodes during a live presentation. The system operates across 5 sequential phases (IDLE, REGISTER, MESH, DEPLOY, STITCH), coordinated by a Presenter/Operator through a Battle Management Station (BMS). Audience members register via QR code scan, participate in mesh network formation, contribute synchronized video captures, and observe a final composite stitched video. The system runs on a local WiFi hotspot (ARGUS-NET) with optional AWS cloud deployment, supporting Chrome Android and Safari iOS browsers.

## Glossary

- **ARGUS_System**: The complete multi-agent live demo system comprising server, BMS client, registration client, and infrastructure packages
- **Phase_State_Machine**: The sequential 5-phase controller governing system state transitions (IDLE→REGISTER→MESH→DEPLOY→STITCH→IDLE)
- **BMS**: Battle Management Station — the operator-facing tactical display showing node map, mesh overlay, phase HUD, and video tile grid
- **Registration_Client**: The audience-facing mobile web application accessed via QR code scan
- **Operator_Console**: The keyboard-driven control interface for phase advancement, node management, and emergency operations
- **Node**: A registered audience device acting as a simulated drone swarm participant, identified by a UUID nodeId
- **Mesh_Network**: The virtual topology formed by BLE RSSI measurements and camera-based ranging between registered nodes
- **WebSocket_Server**: The ws-based real-time communication layer using JSON envelope protocol with heartbeat monitoring
- **Video_Stitcher**: The FFmpeg-based pipeline that composites captured video segments into a position-based 1920x1080 output
- **ARGUS_NET**: The local WiFi hotspot providing offline network connectivity for all system participants
- **Operator**: The presenter controlling the demo via the Operator Console and BMS
- **Audience_Member**: A participant who registers a mobile device as a swarm node
- **AprilTag**: A fiducial marker system used for camera-based position refinement via solvePnP
- **MDS**: Multi-Dimensional Scaling — the algorithm used to derive 2D positions from pairwise BLE distance measurements
- **Procrustes_Alignment**: A geometric transformation that aligns MDS-derived positions to camera-based reference coordinates

## Requirements

### Requirement 1: Phase State Machine Control

**User Story:** As an Operator, I want to advance the demo through sequential phases, so that the audience experience is orchestrated in a controlled manner.

#### Acceptance Criteria

1. THE Phase_State_Machine SHALL support exactly five phases: IDLE, REGISTER, MESH, DEPLOY, and STITCH.
2. WHEN the Operator issues a phase-advance command via REST API, THE Phase_State_Machine SHALL validate that the requested transition follows the sequence IDLE→REGISTER→MESH→DEPLOY→STITCH→IDLE.
3. IF the Operator requests an out-of-sequence phase transition, THEN THE Phase_State_Machine SHALL reject the request with HTTP 400 and a descriptive error message.
4. WHEN the Phase_State_Machine transitions to a new phase, THE WebSocket_Server SHALL broadcast the new phase state to all connected clients within 100ms.
5. THE Phase_State_Machine SHALL persist the current phase in memory and expose the current phase via a GET endpoint.
6. WHEN the ARGUS_System starts, THE Phase_State_Machine SHALL initialize to the IDLE phase.

### Requirement 2: QR Code Registration

**User Story:** As an Audience_Member, I want to scan a QR code displayed on the BMS to register my device as a swarm node, so that I can participate in the demo.

#### Acceptance Criteria

1. WHILE the Phase_State_Machine is in REGISTER phase, THE BMS SHALL display a QR code containing the registration URL.
2. WHEN an Audience_Member scans the QR code and loads the Registration_Client, THE ARGUS_System SHALL assign a UUID v4 nodeId to the device.
3. WHEN a device registers, THE ARGUS_System SHALL capture the device IP address, user agent string, and device type (Android or iOS).
4. WHEN registration completes, THE Registration_Client SHALL establish a WebSocket connection to the WebSocket_Server using the assigned nodeId.
5. IF a device attempts to register while the Phase_State_Machine is not in REGISTER phase, THEN THE ARGUS_System SHALL reject the registration with an appropriate error message.
6. WHEN a new Node registers, THE BMS SHALL display the Node on the tactical map within 500ms.

### Requirement 3: Camera-Based Ranging

**User Story:** As an Audience_Member, I want my device to estimate distance and bearing to other nodes using the camera, so that the system can determine spatial relationships.

#### Acceptance Criteria

1. WHILE the Phase_State_Machine is in MESH phase, THE Registration_Client SHALL activate the rear camera and scan for QR codes displayed by neighboring devices.
2. WHEN the Registration_Client detects a QR code, THE Registration_Client SHALL compute distance using the pinhole camera model with known QR code physical dimensions.
3. WHEN the Registration_Client detects a QR code, THE Registration_Client SHALL compute bearing using DeviceOrientationEvent gyroscope data.
4. WHEN an AprilTag is detected, THE Registration_Client SHALL refine position using solvePnP and report a confidence score between 0.0 and 1.0.
5. IF DeviceOrientationEvent is unavailable due to HTTP context, THEN THE Registration_Client SHALL fall back to QR-only ranging without bearing data.
6. IF camera access is denied by the Audience_Member, THEN THE Registration_Client SHALL display an instructional message and disable ranging for that Node.

### Requirement 4: BLE RSSI Mesh Formation

**User Story:** As an Audience_Member, I want my device to measure distances to nearby nodes using Bluetooth, so that the system can build a mesh network topology.

#### Acceptance Criteria

1. WHILE the Phase_State_Machine is in MESH phase, THE Registration_Client SHALL initiate Web Bluetooth RSSI probes to discover neighboring Nodes.
2. WHEN the Registration_Client receives RSSI measurements, THE Registration_Client SHALL convert RSSI to distance using a path loss model with calibrated reference values.
3. WHEN sufficient pairwise distances are collected (minimum 3 per Node), THE ARGUS_System SHALL compute 2D positions using Multi-Dimensional Scaling.
4. WHEN camera-based reference coordinates are available, THE ARGUS_System SHALL apply Procrustes_Alignment to align MDS positions to camera-derived coordinates.
5. IF Web Bluetooth is unavailable (iOS Safari), THEN THE Registration_Client SHALL report the limitation to the WebSocket_Server and rely on camera-based ranging only.
6. WHEN mesh positions are computed, THE WebSocket_Server SHALL broadcast updated positions to the BMS for map rendering.

### Requirement 5: BMS Tactical Display

**User Story:** As an Operator, I want a military tactical aesthetic display showing real-time node positions and system status, so that I can monitor the demo state.

#### Acceptance Criteria

1. THE BMS SHALL render the tactical display using HTML5 Canvas 2D with a military aesthetic (dark background, grid overlay, green/amber indicators).
2. THE BMS SHALL display a real-time node map showing all registered Nodes at their computed mesh positions.
3. THE BMS SHALL render mesh connectivity lines between Nodes that have established ranging measurements.
4. THE BMS SHALL display a phase HUD showing the current Phase_State_Machine state and transition controls.
5. WHILE the Phase_State_Machine is in STITCH phase, THE BMS SHALL display a video tile grid showing captured segments from each Node.
6. WHEN a Node connects or disconnects, THE BMS SHALL update the node map within 500ms.
7. THE BMS SHALL connect to the WebSocket_Server in observer mode, receiving all broadcasts without being counted as a swarm Node.

### Requirement 6: Synchronized Video Capture

**User Story:** As an Audience_Member, I want my device to capture a 10-second video segment synchronized with other nodes, so that the system can create a composite view.

#### Acceptance Criteria

1. WHEN the Phase_State_Machine transitions to DEPLOY phase, THE WebSocket_Server SHALL broadcast a capture-start command with a synchronized timestamp to all Nodes.
2. WHEN a Node receives the capture-start command, THE Registration_Client SHALL begin recording video using MediaRecorder with webm/vp8 codec at 480p maximum resolution.
3. THE Registration_Client SHALL record for exactly 10 seconds from the synchronized start timestamp.
4. WHEN recording completes, THE Registration_Client SHALL upload the video segment via multipart HTTP POST to the ARGUS_System server.
5. IF camera access is unavailable during DEPLOY phase, THEN THE Registration_Client SHALL report capture failure to the WebSocket_Server and skip upload.
6. IF a video upload fails, THEN THE Registration_Client SHALL retry the upload up to 3 times with exponential backoff (1s, 2s, 4s intervals).

### Requirement 7: Video Stitching

**User Story:** As an Operator, I want captured video segments composited into a single panoramic view based on node positions, so that the audience sees the swarm result.

#### Acceptance Criteria

1. WHEN the Phase_State_Machine transitions to STITCH phase, THE Video_Stitcher SHALL begin compositing received video segments.
2. THE Video_Stitcher SHALL arrange video segments in a position-based layout using each Node's computed mesh coordinates mapped to a 1920x1080 output canvas.
3. THE Video_Stitcher SHALL extract frames from uploaded webm files using FFmpeg.
4. THE Video_Stitcher SHALL complete stitching within 30 seconds for up to 20 Node video segments.
5. IF fewer than 60% of registered Nodes have uploaded video segments, THEN THE Video_Stitcher SHALL proceed with available segments and leave missing tile positions as black.
6. WHEN stitching completes, THE WebSocket_Server SHALL broadcast the composite video URL to all connected clients.

### Requirement 8: WebSocket Communication Protocol

**User Story:** As an Audience_Member, I want reliable real-time communication with the server, so that my device stays synchronized with the demo.

#### Acceptance Criteria

1. THE WebSocket_Server SHALL use a JSON envelope protocol with fields: type, payload, timestamp, and senderId.
2. THE WebSocket_Server SHALL send PING messages to each connected client every 15 seconds.
3. WHEN a client receives a PING message, THE Registration_Client SHALL respond with a PONG message within 5 seconds.
4. IF a client fails to respond to 2 consecutive PING messages, THEN THE WebSocket_Server SHALL mark the Node as disconnected and notify the BMS.
5. WHEN the Phase_State_Machine state changes, THE WebSocket_Server SHALL broadcast the new state to all connected clients.
6. THE BMS SHALL connect in observer mode, receiving all broadcast messages without triggering heartbeat-based disconnection.
7. IF a WebSocket connection drops, THEN THE Registration_Client SHALL attempt automatic reconnection with exponential backoff (1s, 2s, 4s, 8s intervals) up to 5 attempts.

### Requirement 9: Operator Console Controls

**User Story:** As an Operator, I want keyboard shortcuts and visual controls for managing the demo, so that I can operate the system efficiently during a live presentation.

#### Acceptance Criteria

1. THE Operator_Console SHALL provide phase-advance buttons for each valid transition from the current phase.
2. THE Operator_Console SHALL display a node table listing all registered Nodes with nodeId, IP, device type, connection status, and last heartbeat time.
3. THE Operator_Console SHALL provide a kick button for each Node to forcibly disconnect a specific device.
4. THE Operator_Console SHALL provide a kill switch that immediately transitions the Phase_State_Machine to IDLE and disconnects all Nodes.
5. THE Operator_Console SHALL support keyboard shortcuts for phase advance (Space), kill switch (Escape), and node table focus (Tab).
6. WHEN the Operator activates the kill switch, THE ARGUS_System SHALL transition to IDLE phase and broadcast disconnect commands to all Nodes within 200ms.

### Requirement 10: Local Network Operation

**User Story:** As an Operator, I want the system to function entirely on a local WiFi hotspot without internet, so that the demo works in any venue.

#### Acceptance Criteria

1. THE ARGUS_System SHALL operate without internet connectivity when connected to the ARGUS_NET local hotspot.
2. THE ARGUS_System SHALL serve all client assets (Registration_Client, BMS) from the local Express server without external CDN dependencies.
3. THE ARGUS_System SHALL use HTTPS with a self-signed certificate to enable iOS camera and gyroscope access via secure context.
4. WHEN a client connects via HTTPS with a self-signed certificate, THE Registration_Client SHALL display instructions for accepting the certificate on first connection.
5. THE ARGUS_System SHALL bind to all network interfaces (0.0.0.0) on a configurable port (default 3000 for HTTP, 3443 for HTTPS).

### Requirement 11: AWS Cloud Deployment

**User Story:** As an Operator, I want optional cloud deployment for larger audiences or remote demos, so that the system scales beyond local network limitations.

#### Acceptance Criteria

1. WHERE AWS cloud mode is enabled, THE ARGUS_System SHALL deploy to ECS Fargate using a CDK v2 stack defined in the infra package.
2. WHERE AWS cloud mode is enabled, THE ARGUS_System SHALL store uploaded video segments in an S3 bucket with lifecycle rules.
3. WHERE AWS cloud mode is enabled, THE ARGUS_System SHALL serve the Registration_Client and BMS SPA assets via CloudFront distribution.
4. WHERE AWS cloud mode is enabled, THE ARGUS_System SHALL use Application Load Balancer for WebSocket connection routing with sticky sessions.
5. THE ARGUS_System SHALL function identically in local mode and AWS cloud mode without client-side code changes.

### Requirement 12: Cross-Browser Compatibility

**User Story:** As an Audience_Member, I want to participate using either Chrome on Android or Safari on iOS, so that any modern smartphone can join the demo.

#### Acceptance Criteria

1. THE Registration_Client SHALL support Chrome 90+ on Android devices.
2. THE Registration_Client SHALL support Safari 15+ on iOS devices.
3. IF Web Bluetooth is unavailable on the device browser, THEN THE Registration_Client SHALL disable BLE ranging and display a notification that mesh contribution is camera-only.
4. IF DeviceOrientationEvent requires explicit permission (iOS Safari), THEN THE Registration_Client SHALL prompt the Audience_Member for motion sensor permission before MESH phase.
5. IF AprilTag detection fails due to device performance constraints, THEN THE Registration_Client SHALL fall back to QR-code-only distance estimation without solvePnP refinement.
6. THE Registration_Client SHALL detect device capabilities on registration and report supported sensors (camera, BLE, gyroscope) to the WebSocket_Server.

### Requirement 13: System Resilience

**User Story:** As an Operator, I want the system to handle device disconnections, upload failures, and sensor unavailability gracefully, so that the demo continues despite individual device issues.

#### Acceptance Criteria

1. IF a WebSocket connection drops unexpectedly, THEN THE Registration_Client SHALL attempt reconnection with exponential backoff (1s, 2s, 4s, 8s) for up to 5 attempts.
2. IF a video upload fails, THEN THE Registration_Client SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s intervals) before reporting failure.
3. WHEN the Video_Stitcher receives uploads from 60% or more of registered Nodes, THE Video_Stitcher SHALL proceed with stitching using available segments.
4. IF fewer than 60% of registered Nodes upload video, THEN THE Video_Stitcher SHALL proceed with stitching and fill missing positions with black tiles.
5. IF a Node disconnects during MESH phase, THEN THE ARGUS_System SHALL remove the Node from mesh calculations and recompute positions for remaining Nodes.
6. IF all sensor inputs (camera, BLE, gyroscope) are unavailable on a Node, THEN THE Registration_Client SHALL remain connected in passive mode and participate in video capture only.
7. WHEN a Node reconnects after disconnection, THE ARGUS_System SHALL restore the Node to its previous state if the Phase_State_Machine has not advanced beyond the phase at disconnection.
