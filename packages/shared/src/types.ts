import { NodeStatus } from './enums';

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
