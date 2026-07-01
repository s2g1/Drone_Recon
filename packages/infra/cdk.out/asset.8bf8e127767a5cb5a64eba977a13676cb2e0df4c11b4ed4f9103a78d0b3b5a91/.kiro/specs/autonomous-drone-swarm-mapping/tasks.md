# Implementation Plan: Autonomous Drone Swarm Battlefield Mapping System (ADSBMS)

## Overview

This implementation plan breaks down the ADSBMS (Project ARGUS) into incremental coding tasks across the three-tier architecture: Cloud Control, Edge Swarm, and GCS Integration. Tasks are organized to build foundational interfaces and data models first, then implement each major component, followed by integration wiring and property-based test suites validating all 42 correctness properties.

## Tasks

- [ ] 1. Set up project structure, core interfaces, and shared data models
  - [ ] 1.1 Create project directory structure and initialize TypeScript configuration
    - Create monorepo structure with packages: `core-types`, `cloud-control`, `edge-swarm`, `gcs-integration`, `tests`
    - Configure TypeScript with strict mode, path aliases, and shared tsconfig base
    - Set up fast-check as PBT library, Jest as test runner
    - _Requirements: 15.1, 17.4_

  - [ ] 1.2 Define core shared type interfaces and enums
    - Implement `WGS84Position`, `Vector3D`, `Quaternion`, `GeoPolygon`, `ISO8601Timestamp` types
    - Implement `MissionStatus`, `ThreatClassification`, `DataPriority`, `SensorStatus` enums
    - Implement `MissionPlan`, `SectorAssignment`, `FlightPath`, `ContingencyPlan` interfaces
    - Implement `NavigationState`, `ThreatReport`, `ConsolidatedThreatTrack` interfaces
    - Implement `FusedFrame`, `MeshNetworkConfig`, `LinkStatus` interfaces
    - Implement `SwarmState`, `AgentStatus`, `ReconfigEvent` interfaces
    - Implement `TelemetryFrame`, `PowerState`, `SensorState`, `CommState` interfaces
    - Implement `SecurityConfig`, `AuditEntry` interfaces
    - _Requirements: 17.4, 17.5_

  - [ ] 1.3 Define versioned inter-tier API contracts
    - Implement `CloudToEdgeAPI_v1` interface (distributeMissionPlan, deployModel, issueCommand)
    - Implement `EdgeToCloudAPI_v1` interface (uploadTelemetry, uploadImagery, reportMissionStatus, reportThreat)
    - Implement `EdgeToGCSAPI_v1` interface (publishSwarmState, publishThreat, acknowledgCommand)
    - _Requirements: 17.4_

  - [ ] 1.4 Implement data model validation utilities
    - Write validators for `GeoPolygon` (valid coordinates, closure, max area 10 km²)
    - Write validators for `MissionConfiguration` (swarm size 4-50, duration max 7200s)
    - Write validators for battery percentage (0-100, ±2% accuracy)
    - Write validators for confidence scores (0.0-1.0 range)
    - _Requirements: 17.1, 17.6_

  - [ ]* 1.5 Write property tests for data model validation
    - **Property 39: Swarm Size Scalability** — verify acceptance of sizes 4-50 and rejection >50
    - **Validates: Requirements 17.1, 17.6**

- [ ] 2. Implement Mission_Planner (Cloud Control Tier)
  - [ ] 2.1 Implement flight path generation algorithm
    - Create `MissionPlanner` class with `generatePlan(missionArea, agents, envParams)` method
    - Implement sector decomposition of mission area polygon into agent assignments
    - Implement flight path computation ensuring 100% coverage with ≥30% image overlap
    - Implement altitude/speed optimization based on environmental parameters
    - Generate waypoints for each agent's assigned sector
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 2.2 Write property test for flight path coverage completeness
    - **Property 1: Flight Path Coverage Completeness** — verify 100% area coverage with ≥30% overlap for any valid area/agent combination
    - **Validates: Requirements 1.2**

  - [ ]* 2.3 Write property test for environmental adjustment preserves coverage
    - **Property 2: Environmental Adjustment Preserves Coverage Invariant** — verify adjusted paths maintain ≥30% overlap and remain within flight envelope
    - **Validates: Requirements 1.4**

  - [ ] 2.4 Implement contingency plan generation
    - Implement `generateContingencyPlans()` for agent loss scenarios up to 30%
    - Generate sector reassignments for remaining agents with ≥15% overlap guarantee
    - Validate that all sectors have coverage under contingency scenarios
    - _Requirements: 1.5_

  - [ ]* 2.5 Write property test for contingency plan coverage
    - **Property 3: Contingency Plan Coverage Under Agent Loss** — verify complete coverage with ≥15% overlap for up to 30% agent loss
    - **Validates: Requirements 1.5**

  - [ ] 2.6 Implement energy-optimized path planning
    - Implement optimization pass over generated flight paths (altitude, speed, turn frequency)
    - Ensure optimized paths consume ≥15% less energy than straight-line constant-altitude traversal
    - _Requirements: 8.4_

  - [ ]* 2.7 Write property test for energy-optimized flight paths
    - **Property 21: Energy-Optimized Flight Paths** — verify ≥15% energy reduction vs straight-line traversal
    - **Validates: Requirements 8.4**

  - [ ] 2.8 Implement plan distribution and acknowledgment via IoT Core
    - Implement `distributePlan(plan, agentList)` using MQTT QoS 1
    - Implement acknowledgment collection with 2-minute timeout
    - Handle non-responsive agents: notify operator, allow launch with confirmed agents
    - Report failure causes when plan generation exceeds 5-minute limit
    - _Requirements: 1.3, 1.6, 1.7_

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement Navigation_Module (Edge Swarm Tier)
  - [ ] 4.1 Implement VIO-primary navigation with drift tracking
    - Create `NavigationModule` class with `getPosition()` returning `NavigationState` at 10 Hz
    - Implement VIO drift accumulator tracking accumulated error
    - Implement GPS anomaly detection (VIO vs GPS comparison, >10m threshold)
    - Implement autonomous VIO-primary transition within 2 seconds on GPS anomaly
    - _Requirements: 3.1, 3.4, 3.5_

  - [ ] 4.2 Implement terrain matching correction
    - Implement `TerrainMatchRequest` processing against pre-loaded terrain models
    - Trigger terrain matching when VIO drift exceeds 1 meter
    - Reduce position error below 0.5 meters within 5 seconds
    - Report degraded navigation if terrain matching fails within timeout
    - _Requirements: 3.2, 3.7_

  - [ ] 4.3 Implement acoustic beacon trilateration fusion
    - Implement `injectAcousticMeasurement(range, beaconId)` method
    - Implement trilateration when ≥3 beacons are in range
    - Bound position uncertainty to within 1 meter using acoustic fusion
    - _Requirements: 3.3_

  - [ ] 4.4 Implement weighted estimation filter for sensor fusion
    - Implement multi-source fusion (VIO, terrain-match, acoustic beacon) using weighted filter
    - Produce unified position solution bounded by best available sensor input
    - Output valid WGS-84 coordinates at ≥10 Hz rate
    - _Requirements: 3.5, 3.6_

  - [ ]* 4.5 Write property test for VIO navigation accuracy
    - **Property 7: VIO Navigation Accuracy Under Drift** — verify <2m CEP and terrain matching reduces to <0.5m
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 4.6 Write property test for acoustic beacon position bounding
    - **Property 8: Acoustic Beacon Position Bounding** — verify ≤1m uncertainty with ≥3 beacons
    - **Validates: Requirements 3.3**

  - [ ]* 4.7 Write property test for navigation filter fusion
    - **Property 9: Navigation Filter Fusion Produces Valid Output** — verify valid WGS-84 output bounded by best sensor
    - **Validates: Requirements 3.5**

  - [ ]* 4.8 Write property test for GPS spoofing detection
    - **Property 28: GPS Spoofing Detection via VIO Comparison** — verify flagging when discrepancy >10m
    - **Validates: Requirements 11.3**

- [ ] 5. Implement Mesh_Network (Edge Swarm Tier)
  - [ ] 5.1 Implement FSOC mesh topology management and routing
    - Create `MeshNetwork` class with EMCON/RF/Hybrid mode support
    - Implement link health monitoring (heartbeat, BER, signal quality)
    - Implement topology graph with link status tracking
    - Implement alternate path discovery and relay routing within 500ms on link failure
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 5.2 Write property test for FSOC mesh rerouting
    - **Property 10: FSOC Mesh Rerouting on Link Failure** — verify alternate path activation when direct link interrupted
    - **Validates: Requirements 4.3**

  - [ ] 5.3 Implement priority-based data transmission with preemption
    - Implement `DataPriority` queue (threat > nav correction > health > imagery)
    - Implement preemption of lower-priority data when link utilization >80%
    - Implement progressive compression for imagery under bandwidth constraints (<10 Mbps)
    - _Requirements: 9.1, 9.2_

  - [ ]* 5.4 Write property test for priority-based transmission
    - **Property 22: Priority-Based Data Transmission with Preemption** — verify priority ordering and preemption at >80% utilization
    - **Validates: Requirements 9.1**

  - [ ]* 5.5 Write property test for progressive compression
    - **Property 23: Progressive Compression Under Bandwidth Constraint** — verify compression applied to imagery only, threat/nav at full fidelity
    - **Validates: Requirements 9.2**

  - [ ] 5.6 Implement data buffering during isolation and priority-ordered sync
    - Implement local data buffering with zero data loss when agent is isolated
    - Implement delivery of buffered items in priority order upon path restoration
    - Implement bandwidth-triggered local storage mode (<2 Mbps threshold)
    - _Requirements: 4.7, 9.4, 9.6_

  - [ ]* 5.7 Write property test for data buffering integrity
    - **Property 11: Data Buffering Integrity During Isolation** — verify zero data loss and priority-ordered delivery on restoration
    - **Validates: Requirements 4.7**

  - [ ]* 5.8 Write property test for bandwidth-triggered storage mode
    - **Property 25: Bandwidth-Triggered Local Storage Mode** — verify local storage below 2 Mbps and sync during Consolidation
    - **Validates: Requirements 9.4**

  - [ ]* 5.9 Write property test for priority-ordered reconnection sync
    - **Property 26: Priority-Ordered Data Synchronization on Reconnection** — verify sync in priority order upon GCS restoration
    - **Validates: Requirements 10.2**

  - [ ] 5.10 Implement EW resilience (jamming detection, optical dazzle rerouting)
    - Implement RF jamming detection (SNR drop ≥20dB for >200ms) with FSOC-only switch within 1s
    - Implement optical dazzle detection (BER >10⁻³ for >100ms) with reroute within 500ms
    - Implement NSA Type 1 encryption for all inter-agent communications
    - _Requirements: 11.2, 11.4, 4.5_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement Threat_Detector (Edge Swarm Tier)
  - [ ] 7.1 Implement edge ML inference pipeline
    - Create `ThreatDetector` class with `processFrame(fusedFrame)` at 5 fps
    - Implement Rekognition Custom Labels inference on Greengrass Core
    - Implement confidence threshold gate (≥85% for dissemination)
    - Retain sub-threshold detections locally for 30 seconds for correlation
    - _Requirements: 5.1, 5.2, 5.5, 5.7_

  - [ ] 7.2 Implement threat report generation and dissemination
    - Generate geo-tagged `ThreatReport` with all required fields
    - Disseminate to all reachable agents via Mesh_Network within 2 seconds
    - _Requirements: 5.3_

  - [ ]* 7.3 Write property test for confidence threshold gate
    - **Property 12: Threat Detection Confidence Threshold Gate** — verify ≥85% disseminated, <85% retained locally for 30s
    - **Validates: Requirements 5.2, 5.7**

  - [ ]* 7.4 Write property test for threat report completeness
    - **Property 13: Threat Report Completeness** — verify all required fields present in every report
    - **Validates: Requirements 5.3**

- [ ] 8. Implement Sensor_Fusion_Engine (Edge Swarm Tier)
  - [ ] 8.1 Implement multi-sensor fusion (EO, IR, LIDAR)
    - Create `SensorFusionEngine` class producing `FusedFrame` output
    - Implement sensor data alignment and unified scene representation
    - Implement degraded-mode operation on single sensor failure (continue with remaining sensors)
    - Flag output as degraded-fidelity when a sensor is unavailable
    - _Requirements: 5.4, 5.8_

  - [ ]* 8.2 Write property test for sensor fusion degraded mode
    - **Property 14: Sensor Fusion Degraded Mode Continuity** — verify valid output continues on any single sensor failure
    - **Validates: Requirements 5.8**

  - [ ] 8.3 Implement on-board image compression
    - Implement compression achieving ≥10:1 reduction
    - Maintain SSIM ≥0.7 and 10cm GSD preservation
    - _Requirements: 9.3_

  - [ ]* 8.4 Write property test for image compression quality
    - **Property 24: On-Board Image Compression Quality Preservation** — verify ≥10:1 reduction with SSIM ≥0.7 and 10cm GSD
    - **Validates: Requirements 9.3**

- [ ] 9. Implement Swarm_Controller (Distributed Edge Tier)
  - [ ] 9.1 Implement mission phase state machine
    - Create `SwarmController` class managing `SwarmState`
    - Implement three-phase state machine: Pre-Mission → EMCON Execution → Consolidation
    - Enforce sequential-only transitions (no skip, no reverse)
    - _Requirements: 2.1_

  - [ ]* 9.2 Write property test for mission phase ordering
    - **Property 4: Mission Phase Ordering Invariant** — verify only forward transitions, no skip or reverse
    - **Validates: Requirements 2.1**

  - [ ] 9.3 Implement phase transition logic with quorum requirements
    - Implement Pre-Mission → EMCON transition requiring BIT pass + ≥70% agent readiness
    - Implement EMCON → Consolidation transition on sector completion OR path completion OR recall
    - Implement abort logic when <70% agents ready within 10-minute timeout
    - _Requirements: 2.2, 2.4, 2.6, 2.7_

  - [ ]* 9.4 Write property test for phase transition quorum
    - **Property 5: Phase Transition Requires Agent Quorum** — verify BIT pass + ≥70% quorum required
    - **Validates: Requirements 2.2, 2.6, 2.7**

  - [ ]* 9.5 Write property test for EMCON-to-Consolidation conditions
    - **Property 6: EMCON-to-Consolidation Transition Conditions** — verify transition IFF sectors complete OR paths done OR recall
    - **Validates: Requirements 2.4**

  - [ ] 9.6 Implement agent loss detection and sector redistribution
    - Implement heartbeat monitoring with 5-second timeout for lost declaration
    - Implement sector redistribution to remaining agents within 30 seconds
    - Ensure all previously assigned sectors have a new assignee
    - _Requirements: 6.1_

  - [ ]* 9.7 Write property test for agent loss detection and redistribution
    - **Property 17: Agent Loss Detection and Sector Redistribution** — verify lost declaration at 5s timeout and full sector reassignment
    - **Validates: Requirements 6.1**

  - [ ] 9.8 Implement tiered graceful degradation
    - Implement ≤10% loss: maintain 30% overlap, full 10cm GSD
    - Implement 10-30% loss: complete coverage with ≥15% overlap at 10cm GSD
    - Implement >30% loss: prioritize high-priority sectors, ≥50% total coverage
    - _Requirements: 7.1, 7.2, 7.3, 6.2_

  - [ ]* 9.9 Write property test for tiered graceful degradation
    - **Property 16: Tiered Graceful Degradation Under Agent Loss** — verify correct behavior at each loss tier
    - **Validates: Requirements 7.1, 7.2, 7.3, 6.2**

  - [ ] 9.10 Implement threat-driven sector re-prioritization
    - When threat ≥85% confidence in unmapped sector, reassign agent within 60s
    - Increase sector priority above previously assigned lower-priority sectors
    - _Requirements: 6.3_

  - [ ]* 9.11 Write property test for threat-driven re-prioritization
    - **Property 18: Threat-Driven Sector Re-Prioritization** — verify reassignment and priority elevation
    - **Validates: Requirements 6.3**

  - [ ] 9.12 Implement degraded agent reassignment
    - Detect sensor frame rate <50% nominal or image quality below threshold
    - Reassign degraded agent to lower-priority sector
    - Allocate healthy agent as replacement within 30 seconds
    - _Requirements: 6.4_

  - [ ]* 9.13 Write property test for degraded agent reassignment
    - **Property 19: Degraded Agent Reassignment** — verify reassignment on sensor degradation
    - **Validates: Requirements 6.4**

  - [ ] 9.14 Implement multi-agent threat correlation
    - Correlate detections within 50m radius and 10s temporal window
    - Produce consolidated track: confidence = min(max_individual + 0.05, 0.99)
    - _Requirements: 5.6_

  - [ ]* 9.15 Write property test for multi-agent threat correlation
    - **Property 15: Multi-Agent Threat Correlation Confidence Boost** — verify correlation logic and confidence formula
    - **Validates: Requirements 5.6**

  - [ ] 9.16 Implement command validation against mission state
    - Validate operator commands received after connectivity gaps
    - Execute if no conflict with active reconfiguration or safety constraints
    - Reject with specific reason if conflict detected
    - _Requirements: 10.4, 10.5_

  - [ ]* 9.17 Write property test for command validation
    - **Property 27: Command Validation Against Current Mission State** — verify execute/reject logic based on state conflicts
    - **Validates: Requirements 10.4, 10.5**

  - [ ] 9.18 Implement sector assignment computation with time proportionality
    - Ensure computation time ≤2 seconds per agent (total ≤2N seconds for N agents)
    - Support swarm sizes 4-50
    - _Requirements: 17.2_

  - [ ]* 9.19 Write property test for sector assignment computation time
    - **Property 40: Sector Assignment Computation Time Proportionality** — verify ≤2s per agent for sizes 4-50
    - **Validates: Requirements 17.2**

- [ ] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement Power_Manager (Edge Swarm Tier)
  - [ ] 11.1 Implement battery monitoring and mode transitions
    - Create `PowerManager` class tracking battery state and power consumption
    - Report battery % to Swarm_Controller every 30 seconds (±2% accuracy)
    - Implement <25% → reduced-power mode (≥2fps, ≥30% speed reduction)
    - Implement <15% → recall agent, redistribute tasks
    - Implement <10% → transmit position/data-index, initiate RTB
    - _Requirements: 8.2, 8.3, 7.5, 8.6_

  - [ ]* 11.2 Write property test for battery threshold mode transitions
    - **Property 20: Battery Threshold Mode Transitions** — verify correct mode at each threshold (25%, 15%, 10%)
    - **Validates: Requirements 8.3, 7.5, 8.6**

  - [ ] 11.3 Implement SWAP power budget monitoring
    - Monitor total power consumption across subsystems (compute, sensors, comms, flight controller)
    - Generate SWAP margin warning when component exceeds 90% budget for >10s
    - Reduce non-critical processing to stay within budget
    - Enforce total ≤25W (excluding propulsion), ≤15W for software stack
    - _Requirements: 12.1, 12.6, 12.7_

  - [ ]* 11.4 Write property test for SWAP power budget warning
    - **Property 30: SWAP Power Budget Warning** — verify warning generation and load reduction at 90% threshold
    - **Validates: Requirements 12.6**

- [ ] 12. Implement Security_Module (Edge Swarm Tier)
  - [ ] 12.1 Implement data-at-rest encryption
    - Implement AES-256 encryption for all data written to local storage
    - Ensure no plaintext data exists on persistent storage
    - _Requirements: 13.1_

  - [ ]* 12.2 Write property test for data-at-rest encryption
    - **Property 31: Data-at-Rest Encryption Invariant** — verify AES-256 encryption before any write
    - **Validates: Requirements 13.1**

  - [ ] 12.3 Implement message authentication (digital signatures)
    - Implement ECDSA P-384 signature generation on outbound messages
    - Implement signature verification on inbound messages
    - Discard failed messages, log event, notify Swarm_Controller
    - _Requirements: 13.2, 13.7_

  - [ ]* 12.4 Write property test for message authentication
    - **Property 32: Message Authentication Round-Trip** — verify sign/verify cycle and discard on failure
    - **Validates: Requirements 13.2, 13.7**

  - [ ] 12.5 Implement cryptographic audit trail
    - Generate `AuditEntry` for every data operation (collection, processing, export)
    - Include agent identity, timestamp, position, operation, and cryptographic hash
    - Form verifiable hash chain (each entry references previous entry's hash)
    - _Requirements: 13.5_

  - [ ]* 12.6 Write property test for audit trail integrity
    - **Property 33: Cryptographic Audit Trail Integrity** — verify hash chain integrity and all required fields
    - **Validates: Requirements 13.5**

  - [ ] 12.7 Implement key zeroization on agent loss
    - Remote trigger key zeroization within 5 seconds when agent reachable
    - Flag data as potentially compromised if unreachable within 15 seconds
    - _Requirements: 13.3, 13.4_

- [ ] 13. Implement Data_Consolidator (Cloud Control Tier)
  - [ ] 13.1 Implement parallel orthomosaic stitching via AWS Batch
    - Create `DataConsolidator` class managing `ConsolidationJob`
    - Implement scatter-gather parallelization across image sets by sector
    - Implement geo-registration to WGS-84 with ≤5m positional accuracy
    - Produce orthomosaic at ≤10cm GSD within 45-minute processing window
    - _Requirements: 2.5, 14.1, 14.4, 15.7_

  - [ ]* 13.2 Write property test for orthomosaic coverage completeness
    - **Property 34: Orthomosaic Coverage Completeness** — verify 100% mapped sector coverage at ≤10cm GSD
    - **Validates: Requirements 14.1**

  - [ ] 13.3 Implement multi-format export (NITF, GeoTIFF, KMZ)
    - Implement export in all three formats with identical geospatial content
    - Embed threat locations and classifications as metadata layers
    - _Requirements: 14.2, 14.6_

  - [ ]* 13.4 Write property test for export format equivalence
    - **Property 35: Export Format Content Equivalence** — verify identical content across NITF, GeoTIFF, KMZ
    - **Validates: Requirements 14.2**

  - [ ]* 13.5 Write property test for threat metadata embedding
    - **Property 37: Threat Metadata Embedding in Exports** — verify all threats appear in all export formats
    - **Validates: Requirements 14.6**

  - [ ] 13.6 Implement partial coverage and corrupted imagery handling
    - Produce partial orthomosaics for mapped sectors when coverage is incomplete
    - Generate boundary polygon layer indicating unmapped areas
    - Exclude corrupted/insufficient-overlap imagery, mark as unprocessable, log reason
    - _Requirements: 14.5, 14.7_

  - [ ]* 13.7 Write property test for partial coverage unmapped area marking
    - **Property 36: Partial Coverage Unmapped Area Marking** — verify correct boundary polygon for unmapped areas
    - **Validates: Requirements 14.5**

  - [ ]* 13.8 Write property test for corrupted imagery exclusion
    - **Property 38: Corrupted Imagery Exclusion** — verify exclusion, marking, and logging for corrupted data
    - **Validates: Requirements 14.7**

- [ ] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Implement GCS Integration Tier
  - [ ] 15.1 Implement Message_Broker using AWS IoT Core
    - Create `MessageBroker` class wrapping AWS IoT Core MQTT
    - Implement bidirectional message routing between swarm and GCS
    - Implement connectivity monitoring with 10-second no-ack timeout
    - Implement autonomous execution mode transition on connectivity loss
    - _Requirements: 16.4, 10.7_

  - [ ] 15.2 Implement ATAK Plugin interface
    - Create `ATAKPlugin` class publishing swarm position, health, and threats
    - Implement display updates ≥ every 5 seconds while connected
    - Publish threat reports within 5 seconds of receipt
    - Publish orthomosaic and threat overlay within 5 minutes of Consolidation completion
    - _Requirements: 16.1, 16.2, 14.3_

  - [ ] 15.3 Implement Export_Engine (NITF/GeoTIFF/KMZ)
    - Create `ExportEngine` class generating NITF-compliant packages with metadata headers
    - Support DCGS-A integration format
    - Complete export within 10 minutes of request
    - _Requirements: 16.5_

  - [ ] 15.4 Implement Command_Processor
    - Implement operator command handling (abort, sector re-priority, agent recall)
    - Acknowledge receipt within 2 seconds, forward to Swarm_Controller via IoT Core
    - Notify operator on delivery failure (30-second timeout)
    - _Requirements: 16.3, 16.6_

  - [ ] 15.5 Implement last-known-state display during connectivity gaps
    - Display last known swarm position, health status during GCS connectivity loss
    - Show estimated mission progress based on pre-loaded timeline and last completion %
    - _Requirements: 10.6_

- [ ] 16. Implement BIT_Module and Telemetry_Monitor
  - [ ] 16.1 Implement Built-In Test (BIT) module
    - Create `BITModule` class verifying sensor, nav, comm, compute subsystems
    - Complete all BIT checks within 120 seconds per agent
    - Report failure type and affected subsystem within 5 seconds
    - Exclude failed agent without adding >10 seconds to launch of healthy agents
    - _Requirements: 18.2, 18.3_

  - [ ]* 16.2 Write property test for BIT failure reporting
    - **Property 41: BIT Failure Reporting and Exclusion** — verify report within 5s and exclusion adds ≤10s delay
    - **Validates: Requirements 18.3**

  - [ ] 16.3 Implement Telemetry_Monitor and state transition logging
    - Implement millisecond-precision logging of all state transitions, decisions, inter-agent messages
    - Implement telemetry aggregation for CloudWatch (≤60s ingestion latency)
    - Ensure 2-hour local storage capacity at maximum swarm size
    - _Requirements: 18.4, 15.6_

  - [ ]* 16.4 Write property test for state transition logging completeness
    - **Property 42: State Transition Logging Completeness** — verify all transitions logged with ms-precision timestamp and metadata
    - **Validates: Requirements 18.4**

  - [ ]* 16.5 Write property test for EW event logging
    - **Property 29: EW Event Logging Completeness** — verify all EW events logged with required fields
    - **Validates: Requirements 11.5**

- [ ] 17. Implement Cloud Control Tier orchestration and infrastructure
  - [ ] 17.1 Implement Step Functions mission orchestration workflow
    - Create AWS Step Functions state machine for pre-mission planning workflow
    - Orchestrate path generation → model deployment → mission package assembly
    - Complete full workflow within 5-minute planning window
    - _Requirements: 15.1_

  - [ ] 17.2 Implement S3 data organization and lifecycle policies
    - Create S3 bucket structure per data model specification
    - Configure versioning, lifecycle policies (Standard → IA → Glacier)
    - Configure 7-year retention, Object Lock for audit trail
    - _Requirements: 15.2_

  - [ ] 17.3 Implement SageMaker model training and Greengrass OTA deployment
    - Implement model training pipeline using SageMaker
    - Implement OTA model deployment to edge agents via Greengrass within 30 minutes
    - Implement retry logic (up to 3 attempts) with stale-model flagging on failure
    - _Requirements: 15.4, 15.8_

  - [ ] 17.4 Implement Kinesis Video Streams ingest and AWS Batch processing
    - Implement video stream ingest from returning agents during Consolidation
    - Configure AWS Batch array jobs for parallel orthomosaic stitching
    - Ensure processing completes within 45 minutes
    - _Requirements: 15.5, 15.7_

  - [ ] 17.5 Implement auto-scaling and CloudWatch monitoring
    - Configure auto-scaling groups (scale up >70% CPU within 5 min, scale down <30% for 10 min)
    - Configure CloudWatch telemetry aggregation (≤60s ingestion latency)
    - _Requirements: 17.3, 15.6_

- [ ] 18. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Integration wiring and cross-tier communication
  - [ ] 19.1 Wire Cloud-to-Edge communication (plan distribution, model deployment)
    - Connect Mission_Planner output to IoT Core distribution
    - Connect SageMaker model artifacts to Greengrass OTA pipeline
    - Implement end-to-end plan distribution with acknowledgment flow
    - _Requirements: 1.3, 15.4_

  - [ ] 19.2 Wire Edge-to-Cloud communication (telemetry upload, imagery upload)
    - Connect telemetry pipeline to CloudWatch via IoT Core
    - Connect imagery pipeline to Kinesis Video Streams during Consolidation
    - Connect threat reports to GCS via IoT Core
    - _Requirements: 15.5, 15.6_

  - [ ] 19.3 Wire Edge-to-GCS communication (state publishing, command processing)
    - Connect SwarmState publishing to ATAK Plugin via IoT Core
    - Connect operator commands from ATAK through Command_Processor to Swarm_Controller
    - Implement TLS 1.3 mutual authentication on GCS transport
    - _Requirements: 13.6, 16.3, 16.4_

  - [ ] 19.4 Wire intra-Edge component communication
    - Connect Sensor_Fusion_Engine output to Threat_Detector input
    - Connect Navigation_Module to Swarm_Controller
    - Connect Mesh_Network to all components requiring inter-agent communication
    - Connect Power_Manager alerts to Swarm_Controller reconfiguration logic
    - Wire Security_Module encryption/signing into all data flows
    - _Requirements: 5.1, 5.3, 5.4, 6.5_

  - [ ] 19.5 Wire end-to-end three-phase mission flow
    - Implement complete Pre-Mission flow: plan generation → distribution → BIT → readiness confirmation
    - Implement complete EMCON Execution flow: autonomous navigation, mapping, threat detection, FSOC-only comms
    - Implement complete Consolidation flow: data upload → stitching → export → ATAK publish
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [ ]* 19.6 Write integration tests for cross-tier communication
    - Test IoT Core message delivery end-to-end
    - Test Kinesis Video Streams ingest pipeline
    - Test Step Functions workflow completion timing
    - _Requirements: 15.1, 15.5, 16.4_

- [ ] 20. Implement modularity and scalability features
  - [ ] 20.1 Implement configuration-only swarm scaling (4-50 agents)
    - Ensure no code changes needed for swarm size changes
    - Validate configuration accepts 4-50, rejects >50
    - Implement standardized sensor plugin interface for new sensor types
    - _Requirements: 17.1, 17.5, 17.6_

  - [ ] 20.2 Implement versioned API backward compatibility
    - Ensure v1 API contracts between tiers support adjacent version compatibility
    - Implement version negotiation between tiers
    - _Requirements: 17.4_

- [ ] 21. Implement simulation environment
  - [ ] 21.1 Create swarm simulation environment
    - Implement swarm behavior model for 4-50 agents
    - Implement environment model (terrain, wind, visibility)
    - Implement failure injection (agent loss, link degradation, EW interference)
    - Implement EW scenario injection (jamming, spoofing, optical dazzle)
    - _Requirements: 18.1_

  - [ ] 21.2 Implement mission replay capability
    - Reconstruct agent positions, comm events, threats, reconfiguration from logged data
    - Make replay available within 30 minutes of data upload
    - _Requirements: 18.5_

- [ ] 22. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical boundaries
- Property tests validate the 42 universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout; all implementations use TypeScript with fast-check for PBT
- AWS services (IoT Core, Step Functions, S3, Batch, SageMaker, Kinesis, CloudWatch) are the target infrastructure
- Edge components run on AWS IoT Greengrass Core with Rekognition Custom Labels for ML inference
- All inter-agent communication uses NSA Type 1 encryption
- The system operates across three phases: Pre-Mission (full connectivity), EMCON Execution (FSOC only), Consolidation (full connectivity)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5", "2.1", "4.1", "5.1", "9.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "2.4", "4.2", "4.3", "5.3", "5.6", "9.3", "9.6"] },
    { "id": 5, "tasks": ["2.5", "2.6", "4.4", "5.2", "5.4", "5.7", "5.8", "9.2", "9.4", "9.5", "9.7"] },
    { "id": 6, "tasks": ["2.7", "2.8", "4.5", "4.6", "4.7", "4.8", "5.5", "5.9", "5.10", "9.8", "9.10", "9.12"] },
    { "id": 7, "tasks": ["9.9", "9.11", "9.13", "9.14", "9.16", "9.18"] },
    { "id": 8, "tasks": ["9.15", "9.17", "9.19", "7.1", "8.1", "11.1", "12.1"] },
    { "id": 9, "tasks": ["7.2", "7.3", "7.4", "8.2", "8.3", "11.2", "11.3", "12.2", "12.3", "12.5"] },
    { "id": 10, "tasks": ["8.4", "11.4", "12.4", "12.6", "12.7", "13.1"] },
    { "id": 11, "tasks": ["13.2", "13.3", "13.6"] },
    { "id": 12, "tasks": ["13.4", "13.5", "13.7", "13.8", "15.1", "15.2", "15.3", "15.4", "15.5"] },
    { "id": 13, "tasks": ["16.1", "16.3", "17.1", "17.2", "17.3"] },
    { "id": 14, "tasks": ["16.2", "16.4", "16.5", "17.4", "17.5"] },
    { "id": 15, "tasks": ["19.1", "19.2", "19.3", "19.4"] },
    { "id": 16, "tasks": ["19.5", "19.6", "20.1", "20.2"] },
    { "id": 17, "tasks": ["21.1", "21.2"] }
  ]
}
```
