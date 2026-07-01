import { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import type { DeviceNode, DeviceCapabilities } from '@argus/shared';

export interface QRScanProps {
  onRegistered: (node: DeviceNode) => void;
  serverUrl: string;
}

type ScanState = 'requesting' | 'scanning' | 'registering' | 'denied' | 'registered';

/**
 * Detects device type from user agent string.
 */
function detectDeviceType(ua: string): 'android' | 'ios' {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'android';
}

/**
 * Detects device capabilities by checking available browser APIs.
 */
function detectCapabilities(): DeviceCapabilities {
  const camera = true; // We have camera access if this component is active
  const ble = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  const gyroscope = typeof DeviceOrientationEvent !== 'undefined';
  return { camera, ble, gyroscope };
}

/**
 * Validates that a detected QR code contains an argus:// protocol URL.
 */
function isValidArgusUrl(data: string): boolean {
  return data.startsWith('argus://');
}

/**
 * QRScan component — scans QR codes using the device camera and registers
 * the device with the ARGUS server when a valid argus:// QR code is detected.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 12.6
 */
export function QRScan({ onRegistered, serverUrl }: QRScanProps) {
  const [state, setState] = useState<ScanState>('requesting');
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const registeredRef = useRef(false);

  const stopScanning = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const registerDevice = useCallback(
    async (qrData: string) => {
      if (registeredRef.current) return;
      registeredRef.current = true;

      setState('registering');
      stopScanning();

      const userAgent = navigator.userAgent;
      const deviceType = detectDeviceType(userAgent);
      const capabilities = detectCapabilities();

      // Extract IP from the server or use placeholder — the server can
      // detect the real IP from the request itself. We send what we can.
      const ip = '0.0.0.0'; // Server will override with actual request IP

      try {
        const response = await fetch(`${serverUrl}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip,
            userAgent,
            deviceType,
            capabilities,
            qrData,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: 'Registration failed' }));
          throw new Error(body.error || `HTTP ${response.status}`);
        }

        const node: DeviceNode = await response.json();
        setState('registered');
        onRegistered(node);
      } catch (err) {
        registeredRef.current = false;
        setState('scanning');
        setError(err instanceof Error ? err.message : 'Registration failed');
        // Restart scanning after a brief pause
        startScanning();
      }
    },
    [serverUrl, onRegistered, stopScanning]
  );

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

    // Match canvas size to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Extract ImageData and pass to jsQR
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code && code.data) {
      // Validate argus:// protocol URL
      if (isValidArgusUrl(code.data)) {
        registerDevice(code.data);
        return; // Stop scanning loop
      }
    }

    // Continue scanning
    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [registerDevice]);

  const startScanning = useCallback(() => {
    if (animFrameRef.current) return;
    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [scanFrame]);

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
          setState('scanning');
          startScanning();
        }
      } catch (err) {
        if (cancelled) return;

        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setState('denied');
        } else {
          setState('denied');
          setError(err instanceof Error ? err.message : 'Camera access failed');
        }
      }
    }

    initCamera();

    return () => {
      cancelled = true;
      stopScanning();
    };
  }, [startScanning, stopScanning]);

  // Camera permission denied — show instructional fallback
  if (state === 'denied') {
    return (
      <div className="qr-scan qr-scan--denied">
        <div className="qr-scan__message">
          <h2>Camera Access Required</h2>
          <p>
            To register your device, please allow camera access in your browser
            settings.
          </p>
          <ol>
            <li>Open your browser settings</li>
            <li>Find &quot;Site Settings&quot; or &quot;Privacy&quot;</li>
            <li>Enable camera access for this site</li>
            <li>Reload this page</li>
          </ol>
          {error && <p className="qr-scan__error">{error}</p>}
        </div>
      </div>
    );
  }

  // Registering state
  if (state === 'registering') {
    return (
      <div className="qr-scan qr-scan--registering">
        <div className="qr-scan__message">
          <h2>Registering Device...</h2>
          <p>Connecting to ARGUS network</p>
        </div>
      </div>
    );
  }

  // Registered — brief success state
  if (state === 'registered') {
    return (
      <div className="qr-scan qr-scan--registered">
        <div className="qr-scan__message">
          <h2>Registered!</h2>
          <p>Device connected to swarm</p>
        </div>
      </div>
    );
  }

  // Requesting or scanning state — show camera feed with overlay
  return (
    <div className="qr-scan qr-scan--active">
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
      />
      <canvas
        ref={canvasRef}
        className="qr-scan__canvas"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div className="qr-scan__overlay">
        <div className="qr-scan__crosshair" />
        <p className="qr-scan__instruction">
          {state === 'requesting'
            ? 'Requesting camera access...'
            : 'Point camera at the QR code on screen'}
        </p>
        {error && <p className="qr-scan__error">{error}</p>}
      </div>
    </div>
  );
}

export default QRScan;
