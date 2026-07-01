// @argus/shared — TypeScript types, enums, config schema
export { Phase, NodeStatus, WsMessageType } from './enums';
export type {
  DeviceNode,
  DeviceCapabilities,
  Vec2,
  Rect,
  RangingResult,
  AprilTagDetection,
  RssiResult,
  RssiMeasurement,
  MeshEdge,
  StitchProgress,
} from './types';
export type { WsEnvelope } from './ws-envelope';
export type { ArgusConfig } from './config';
export { defaultConfig } from './config';
