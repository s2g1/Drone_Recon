import { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import type { RangingResult, WsEnvelope } from '@argus/shared';
import { WsMessageType } from '@argus/shared';
import type { WsClient } from '../services/ws-client';

export interface RangingProps {
  nodeId: string;
  wsClient: WsClient;
  config: { qrSizeCm: number; focalPxDefault: number };
}

type RangingState = 'initializing' | 'scanning' | 'qr-only' | 'denied';

/**
 * Computes distance using the pinhole camera model.
 * distance = focalPx * qrSizeCm / qrPixelWidth
 */
function computeDistance(focalPx: number, qrSizeCm: number, qrPixelWidth: number): number {
  return focalPx * qrSizeCm / qrPixelWidth;
}

/**
 * Computes bearing from pixel offset and gyroscope heading.
 * bearing = Math.atan2(offsetPx, focalPx) + gyroAlpha
 */
function computeBearing(offsetPx: number, focalPx: number, gyroAlpha: number): number {
  return Math.atan2(offsetPx, focalPx) + gyroAlpha;
}

/**
 * Computes a confidence score based on detection quality.
 * Clamped to [0, 1].
 */
function computeConfidence(params: {
  tagCount: number;
  tiltAngle: number;
  proximityFactor: number;
}): number {
  const { tagCount, tiltAngle, proximityFactor } = params;
  const tiltPenalty = (tiltAngle / Math.PI) * 0.3;
  const proximityBonus = proximityFactor * 0.2;
  return Math.min(Math.max(0.4 + 0.15 * tagCount - tiltPenalty + proximityBonus, 0), 1);
}

/**
 * Ranging component — analyzes camera frames to detect QR codes, compute
 * distance via pinhole model, and bearing via DeviceOrientationEvent.
 * Reports RangingResult to the server via WebSocket.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
export function Ranging({ nodeId, wsClient, config }: RangingProps) {
  const [state, setState] = useState<RangingState>('initializing');
  const [lastResult, setLastResult] = useState<RangingResult | null>(null);
  const [gyroAvailable, setGyroAvailable] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const gyroAlphaRef = useRef<number>(0);

  const { qrSizeCm, focalPxDefault } = config;

  // --- Gyroscope handling ---
  useEffect(() => {
    let orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;

    function handleOrientation(event: DeviceOrientationEvent) {
      if (event.alpha !== null) {
        // Convert degrees to radians
        gyroAlphaRef.current = (event.alpha * Math.PI) / 180;
      }
    }

    // Check if DeviceOrientationEvent is available
    if (typeof DeviceOrientationEvent === 'undefined') {
      setGyroAvailable(false);
      setState('qr-only');
      return;
    }

    // iOS requires explicit permission request
    const doeAny = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof doeAny.requestPermission === 'function') {
      doeAny.requestPermission().then((permission) => {
        if (permission === 'granted') {
          orientationHandler = handleOrientation;
          window.addEventListener('deviceorientation', orientationHandler);
        } else {
          setGyroAvailable(false);
          setState('qr-only');
        }
      }).catch(() => {
        setGyroAvailable(false);
        setState('qr-only');
      });
    } else {
      orientationHandler = handleOrientation;
      window.addEventListener('deviceorientation', orientationHandler);

      // Detect if events actually fire (some desktop browsers have the API but no sensor)
      const timeout = setTimeout(() => {
        // If after 2s no event fired, consider gyro unavailable
        if (gyroAlphaRef.current === 0) {
          setGyroAvailable(false);
          setState((prev) => (prev === 'scanning' ? 'qr-only' : prev));
        }
      }, 2000);

      return () => {
        clearTimeout(timeout);
        if (orientationHandler) {
          window.removeEventListener('deviceorientation', orientationHandler);
        }
      };
    }

    return () => {
      if (orientationHandler) {
        window.removeEventListener('deviceorientation', orientationHandler);
      }
    };
  }, []);

  // --- Send ranging result via WebSocket ---
  const sendRangingResult = useCallback(
    (result: RangingResult) => {
      const envelope: WsEnvelope<RangingResult> = {
        type: WsMessageType.RANGING_RESULT,
        sessionId: nodeId,
        ts: Date.now(),
        payload: result,
      };
      wsClient.send(envelope as unknown as WsEnvelope);
      setLastResult(result);
    },
    [nodeId, wsClient]
  );

  // --- Frame scanning loop ---
  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code && code.data) {
      // Compute QR pixel width from detected corners
      const topLeft = code.location.topLeftCorner;
      const topRight = code.location.topRightCorner;
      const qrPixelWidth = Math.sqrt(
        Math.pow(topRight.x - topLeft.x, 2) + Math.pow(topRight.y - topLeft.y, 2)
      );

      if (qrPixelWidth > 0) {
        // Compute distance via pinhole model
        const distance = computeDistance(focalPxDefault, qrSizeCm, qrPixelWidth);

        // Compute bearing (if gyroscope available)
        const qrCenterX = (topLeft.x + topRight.x) / 2;
        const imageCenterX = canvas.width / 2;
        const offsetPx = qrCenterX - imageCenterX;

        let bearing: number | null = null;
        if (gyroAvailable) {
          bearing = computeBearing(offsetPx, focalPxDefault, gyroAlphaRef.current);
        }

        // Compute confidence
        const proximityFactor = Math.min(qrPixelWidth / canvas.width, 1);
        const confidence = computeConfidence({
          tagCount: 1, // QR-only: single detection
          tiltAngle: 0,
          proximityFactor,
        });

        // Extract target node ID from QR data (the QR content is the target nodeId)
        const toNodeId = code.data;

        const result: RangingResult = {
          fromNodeId: nodeId,
          toNodeId,
          distance,
          bearing,
          confidence,
          method: 'qr',
        };

        sendRangingResult(result);
      }
    }

    // Continue scanning
    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [focalPxDefault, qrSizeCm, gyroAvailable, nodeId, sendRangingResult]);

  // --- Camera initialization ---
  useEffect(() => {
    let cancelled = false;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setState((prev) => (prev === 'qr-only' ? 'qr-only' : 'scanning'));
          animFrameRef.current = requestAnimationFrame(scanFrame);
        }
      } catch (err) {
        if (cancelled) return;

        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setState('denied');
        } else {
          setState('denied');
        }
      }
    }

    initCamera();

    return () => {
      cancelled = true;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [scanFrame]);

  // --- Render: camera denied ---
  if (state === 'denied') {
    return (
      <div className="ranging ranging--denied">
        <div className="ranging__message">
          <h2>Camera Access Required</h2>
          <p>
            Camera access is needed for ranging measurements. Please enable
            camera access in your browser settings and reload.
          </p>
          <p className="ranging__status">Ranging disabled for this node.</p>
        </div>
      </div>
    );
  }

  // --- Render: active scanning ---
  return (
    <div className="ranging ranging--active">
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />
      <canvas
        ref={canvasRef}
        className="ranging__canvas"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div className="ranging__overlay">
        {state === 'initializing' && (
          <p className="ranging__status">Initializing camera...</p>
        )}
        {state === 'qr-only' && (
          <p className="ranging__status ranging__status--warning">
            QR-only mode — gyroscope unavailable, bearing data not available
          </p>
        )}
        {state === 'scanning' && (
          <p className="ranging__status">Scanning for QR codes...</p>
        )}
        {lastResult && (
          <div className="ranging__result">
            <p>Distance: {lastResult.distance.toFixed(1)} cm</p>
            {lastResult.bearing !== null && (
              <p>Bearing: {((lastResult.bearing * 180) / Math.PI).toFixed(1)}°</p>
            )}
            <p>Confidence: {(lastResult.confidence * 100).toFixed(0)}%</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Ranging;
