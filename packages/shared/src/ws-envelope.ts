import { WsMessageType } from './enums';

export interface WsEnvelope<T = unknown> {
  type: WsMessageType;
  sessionId: string;
  ts: number;           // Unix timestamp ms
  payload: T;
}
