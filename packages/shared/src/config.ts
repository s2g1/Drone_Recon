import type { Vec2 } from './types';

export interface ArgusConfig {
  server: {
    httpPort: number;
    httpsPort: number;
    host: string;
    certPath: string;
    keyPath: string;
  };
  room: {
    width: number;
    height: number;
    qrAnchors: Vec2[];
    aprilTags: { tagId: number; position: Vec2 }[];
  };
  capture: {
    duration: number;
    maxResolution: number;
    codec: string;
  };
  stitch: {
    outputWidth: number;
    outputHeight: number;
    uploadThreshold: number;
    timeoutMs: number;
  };
  ranging: {
    qrSizeCm: number;
    focalPxDefault: number;
  };
  rssi: {
    rssi0: number;
    d0: number;
    n: number;
    blendWeightCap: number;
  };
  heartbeat: {
    intervalMs: number;
    timeoutMs: number;
    maxMissed: number;
  };
  upload: {
    maxSizeMb: number;
    retryCount: number;
    retryBaseMs: number;
  };
  aws: {
    enabled: boolean;
    region: string;
    s3Bucket: string;
    lifecycleDays: number;
  };
  features: {
    bleEnabled: boolean;
    aprilTagEnabled: boolean;
    cloudMode: boolean;
  };
}

export const defaultConfig: ArgusConfig = {
  server: {
    httpPort: 3000,
    httpsPort: 3443,
    host: '0.0.0.0',
    certPath: './certs/cert.pem',
    keyPath: './certs/key.pem',
  },
  room: {
    width: 1000,
    height: 800,
    qrAnchors: [],
    aprilTags: [],
  },
  capture: {
    duration: 10,
    maxResolution: 480,
    codec: 'video/webm;codecs=vp8',
  },
  stitch: {
    outputWidth: 1920,
    outputHeight: 1080,
    uploadThreshold: 0.6,
    timeoutMs: 30000,
  },
  ranging: {
    qrSizeCm: 18,
    focalPxDefault: 600,
  },
  rssi: {
    rssi0: -40,
    d0: 100,
    n: 2.0,
    blendWeightCap: 0.3,
  },
  heartbeat: {
    intervalMs: 15000,
    timeoutMs: 5000,
    maxMissed: 2,
  },
  upload: {
    maxSizeMb: 50,
    retryCount: 3,
    retryBaseMs: 1000,
  },
  aws: {
    enabled: false,
    region: 'us-east-1',
    s3Bucket: 'argus-demo',
    lifecycleDays: 1,
  },
  features: {
    bleEnabled: true,
    aprilTagEnabled: true,
    cloudMode: false,
  },
};
