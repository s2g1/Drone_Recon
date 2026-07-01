import { useState, useEffect, useRef, useCallback } from 'react';

function getServerUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('server') || 'https://ksxaeu4eb8.execute-api.us-east-1.amazonaws.com';
}

type AppStep = 'registering' | 'calibrating' | 'standby' | 'scanning' | 'complete' | 'error';

interface GyroData {
  alpha: number;
  beta: number;
  gamma: number;
}

function App() {
  const [step, setStep] = useState<AppStep>('registering');
  const [nodeId, setNodeId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [calibrationCorner, setCalibrationCorner] = useState(0);
  const [countdown, setCountdown] = useState(5);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [gyro, setGyro] = useState<GyroData>({ alpha: 0, beta: 0, gamma: 0 });
  const [rssiResults, setRssiResults] = useState<{ toNodeId: string; rssi: number; distance: number }[]>([]);
  const [allNodes, setAllNodes] = useState<{ nodeId: string }[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const calibrationVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gyroRef = useRef<GyroData>({ alpha: 0, beta: 0, gamma: 0 });
  const serverUrl = getServerUrl();

  // Track gyro data continuously
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      const data: GyroData = {
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
      };
      gyroRef.current = data;
      setGyro(data);
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  // Start camera for calibration
  const startCalibrationCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (calibrationVideoRef.current) {
        calibrationVideoRef.current.srcObject = stream;
        calibrationVideoRef.current.play();
      }
    } catch {}
  };

  // Stop calibration camera
  const stopCalibrationCamera = () => {
    if (calibrationVideoRef.current && calibrationVideoRef.current.srcObject) {
      const tracks = (calibrationVideoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      calibrationVideoRef.current.srcObject = null;
    }
  };

  // Capture frame from video as base64 JPEG
  const captureFrame = useCallback((videoEl: HTMLVideoElement | null): string | null => {
    if (!videoEl || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    canvas.width = videoEl.videoWidth || 640;
    canvas.height = videoEl.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    // Get base64 JPEG (strip data:image/jpeg;base64, prefix)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    return dataUrl.split(',')[1] || null;
  }, []);

  // Start camera when entering calibration, stop when leaving
  useEffect(() => {
    if (step === 'calibrating') {
      startCalibrationCamera();
    } else {
      stopCalibrationCamera();
    }
    return () => { stopCalibrationCamera(); };
  }, [step]);

  // Step 1: Auto-register on load
  useEffect(() => {
    const ua = navigator.userAgent;
    const deviceType = /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'android';

    fetch(`${serverUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: '0.0.0.0',
        userAgent: ua,
        deviceType,
        capabilities: {
          camera: !!navigator.mediaDevices,
          ble: 'bluetooth' in navigator,
          gyroscope: typeof DeviceOrientationEvent !== 'undefined',
        },
      }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`Registration failed (${res.status})`);
        return res.json();
      })
      .then(node => {
        setNodeId(node.nodeId);
        setStep('calibrating');
      })
      .catch(err => {
        setError(err.message);
        setStep('error');
      });
  }, [serverUrl]);

  // Step 2: Mark a corner with image capture + gyro reading
  const handleMarkCorner = async () => {
    const corner = calibrationCorner;
    const currentGyro = { ...gyroRef.current };
    const imageBase64 = captureFrame(calibrationVideoRef.current);

    // Show captured image briefly
    if (imageBase64) {
      setCapturedImage(`data:image/jpeg;base64,${imageBase64}`);
      setTimeout(() => setCapturedImage(null), 1200);
    }

    try {
      await fetch(`${serverUrl}/calibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          corner,
          timestamp: Date.now(),
          image: imageBase64,
          gyro: currentGyro,
        }),
      });
    } catch {}

    const next = corner + 1;
    setCalibrationCorner(next);

    if (next >= 4) {
      setStep('standby');
    }
  };

  // Step 3: Standby - poll for deploy
  useEffect(() => {
    if (step !== 'standby') return;

    const poll = setInterval(() => {
      fetch(`${serverUrl}/status`)
        .then(res => res.json())
        .then(data => {
          if (data.phase === 'scanning') {
            clearInterval(poll);
            setStep('scanning');
            startScanPhase();
          }
        })
        .catch(() => {});
    }, 2000);

    return () => clearInterval(poll);
  }, [step, serverUrl]);

  // Fetch all registered nodes (for RSSI simulation)
  const fetchAllNodes = async (): Promise<{ nodeId: string }[]> => {
    try {
      const res = await fetch(`${serverUrl}/nodes`);
      if (res.ok) {
        const data = await res.json();
        setAllNodes(data);
        return data;
      }
    } catch {}
    return [];
  };

  // Step 4: Camera + RSSI scan during 5s window
  const startScanPhase = async () => {
    // Start camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {}

    // Fetch all nodes for RSSI simulation
    const nodes = await fetchAllNodes();

    // Simulate RSSI scanning (BLE not reliably available in browsers)
    const otherNodes = nodes.filter(n => n.nodeId !== nodeId);
    const measurements = otherNodes.map((n, idx) => {
      // Simulate RSSI based on registration order distance
      const rssi = -40 - Math.floor(Math.random() * 30) - (idx * 5);
      const distance = Math.round((10 ** ((-40 - rssi) / 20)) * 100) / 100;
      return { toNodeId: n.nodeId, rssi, distance };
    });
    setRssiResults(measurements);

    // Countdown
    let t = 5;
    setCountdown(5);
    countdownRef.current = setInterval(() => {
      t -= 1;
      setCountdown(t);
      if (t <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        // Stop camera
        if (videoRef.current && videoRef.current.srcObject) {
          const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
          tracks.forEach(track => track.stop());
        }
        // Report RSSI data
        reportRssi(measurements);
        setStep('complete');
      }
    }, 1000);
  };

  // Report RSSI measurements to server
  const reportRssi = async (measurements: { toNodeId: string; rssi: number; distance: number }[]) => {
    try {
      await fetch(`${serverUrl}/rssi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromNodeId: nodeId,
          measurements,
          timestamp: Date.now(),
        }),
      });
    } catch {}
  };

  const cornerNames = ['TOP-LEFT', 'TOP-RIGHT', 'BOTTOM-RIGHT', 'BOTTOM-LEFT'];

  // Hidden canvas for frame capture
  const hiddenCanvas = <canvas ref={canvasRef} style={{ display: 'none' }} />;

  // ─── ERROR ───
  if (step === 'error') {
    return (
      <div style={styles.container}>
        {hiddenCanvas}
        <div style={{ fontSize: '48px', color: '#FF4040' }}>✕</div>
        <h2 style={styles.title}>Registration Failed</h2>
        <p style={styles.message}>{error}</p>
        <button style={styles.btn} onClick={() => window.location.reload()}>RETRY</button>
      </div>
    );
  }

  // ─── REGISTERING ───
  if (step === 'registering') {
    return (
      <div style={styles.container}>
        {hiddenCanvas}
        <div style={styles.spinner} />
        <h2 style={styles.title}>Registering...</h2>
        <p style={styles.message}>Connecting to ARGUS network</p>
      </div>
    );
  }

  // ─── CALIBRATING ───
  if (step === 'calibrating') {
    return (
      <div style={{ ...styles.container, padding: 0 }}>
        {hiddenCanvas}
        <video
          ref={calibrationVideoRef}
          playsInline
          muted
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
        />
        {/* Show captured image confirmation */}
        {capturedImage && (
          <div style={styles.captureConfirmation}>
            <img src={capturedImage} alt="Captured" style={styles.capturedImg} />
            <div style={styles.captureLabel}>✓ CAPTURED</div>
          </div>
        )}
        <div style={styles.calibrationOverlay}>
          <div style={{ fontSize: '48px', color: '#00BFFF' }}>◎</div>
          <h2 style={styles.title}>CALIBRATION</h2>
          <p style={styles.instruction}>
            Point your device at corner {calibrationCorner + 1} (<span style={{ color: '#00FF9C', fontWeight: 700 }}>{cornerNames[calibrationCorner]}</span>) of the room and tap MARK
          </p>
          <div style={styles.gyroDisplay}>
            <span>α:{gyro.alpha.toFixed(0)}°</span>
            <span>β:{gyro.beta.toFixed(0)}°</span>
            <span>γ:{gyro.gamma.toFixed(0)}°</span>
          </div>
          <div style={styles.progressRow}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={i < calibrationCorner ? styles.dotDone : styles.dot} />
            ))}
          </div>
          <p style={{ fontSize: '12px', color: '#00BFFF', margin: 0 }}>{calibrationCorner}/4</p>
          <button style={styles.btn} onClick={handleMarkCorner}>
            MARK CORNER
          </button>
        </div>
      </div>
    );
  }

  // ─── STANDBY ───
  if (step === 'standby') {
    return (
      <div style={styles.container}>
        {hiddenCanvas}
        <div style={{ fontSize: '48px', color: '#00FF9C' }}>✓</div>
        <h2 style={styles.title}>Calibrated ✓</h2>
        <p style={styles.message}>Standing by for deploy</p>
        <div style={styles.badge}>{nodeId.substring(0, 8)}</div>
      </div>
    );
  }

  // ─── SCANNING (with RSSI overlay) ───
  if (step === 'scanning') {
    return (
      <div style={{ ...styles.container, padding: 0 }}>
        {hiddenCanvas}
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100vh', objectFit: 'cover' }} />
        <div style={styles.scanOverlay}>
          <div style={styles.scanBadge}><span style={{ color: '#FF4040' }}>●</span> RECORDING</div>
          <div style={styles.scanCountdown}>{countdown}s</div>
        </div>
        {/* RSSI callout labels */}
        <div style={styles.rssiOverlay}>
          {rssiResults.map((m, i) => (
            <div key={m.toNodeId} style={{
              ...styles.rssiCallout,
              top: `${120 + i * 50}px`,
            }}>
              <span style={{ color: '#00FF9C', fontWeight: 700 }}>
                {m.toNodeId.substring(0, 6)}
              </span>
              <span style={{ color: '#00BFFF' }}>{m.rssi} dBm</span>
              <span style={{ color: '#FFD700' }}>{m.distance}m</span>
            </div>
          ))}
          {rssiResults.length > 0 && (
            <div style={styles.rssiLabel}>BLE RSSI SCAN</div>
          )}
        </div>
      </div>
    );
  }

  // ─── COMPLETE ───
  return (
    <div style={styles.container}>
      {hiddenCanvas}
      <div style={{ fontSize: '48px', color: '#00FF9C' }}>✓</div>
      <h2 style={styles.title}>Scan complete</h2>
      <p style={styles.message}>Data captured • RSSI reported</p>
      <div style={styles.badge}>{nodeId.substring(0, 8)}</div>
      {rssiResults.length > 0 && (
        <div style={styles.rssiSummary}>
          <div style={{ fontSize: '10px', color: '#00BFFF', letterSpacing: '2px', marginBottom: '6px' }}>
            RSSI MEASUREMENTS
          </div>
          {rssiResults.map(m => (
            <div key={m.toNodeId} style={{ fontSize: '11px', color: '#888' }}>
              → {m.toNodeId.substring(0, 8)}: {m.rssi} dBm ({m.distance}m)
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050D1A',
    color: '#FFFFFF',
    fontFamily: '"JetBrains Mono", monospace',
    padding: '24px',
    gap: '16px',
    position: 'relative',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #1a2d3d',
    borderTopColor: '#00FF9C',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#00FF9C',
    margin: 0,
    letterSpacing: '2px',
  },
  message: {
    fontSize: '13px',
    color: '#888',
    margin: 0,
    textAlign: 'center',
  },
  instruction: {
    fontSize: '14px',
    color: '#FFFFFF',
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.6,
    maxWidth: '300px',
  },
  gyroDisplay: {
    display: 'flex',
    gap: '12px',
    fontSize: '11px',
    color: '#00BFFF',
    backgroundColor: 'rgba(0, 191, 255, 0.1)',
    padding: '6px 14px',
    borderRadius: '4px',
    border: '1px solid #00BFFF30',
  },
  progressRow: {
    display: 'flex',
    gap: '10px',
  },
  dot: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: '#1a2d3d',
    border: '2px solid #00BFFF40',
  },
  dotDone: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: '#00FF9C',
    border: '2px solid #00FF9C',
    boxShadow: '0 0 8px rgba(0, 255, 156, 0.5)',
  },
  btn: {
    padding: '14px 32px',
    background: 'rgba(0, 255, 156, 0.15)',
    border: '2px solid #00FF9C',
    borderRadius: '8px',
    color: '#00FF9C',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '2px',
    cursor: 'pointer',
    boxShadow: '0 0 20px rgba(0, 255, 156, 0.3)',
  },
  badge: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#00BFFF',
    border: '2px solid #00BFFF',
    padding: '8px 20px',
    borderRadius: '6px',
  },
  scanOverlay: {
    position: 'absolute',
    top: '20px',
    left: '16px',
    right: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scanBadge: {
    background: 'rgba(0,0,0,0.8)',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 700,
    color: '#FFF',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    border: '1px solid #FF404060',
  },
  scanCountdown: {
    background: 'rgba(0,0,0,0.8)',
    padding: '8px 14px',
    borderRadius: '6px',
    fontSize: '20px',
    fontWeight: 700,
    color: '#00BFFF',
  },
  calibrationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    zIndex: 1,
    background: 'rgba(5, 13, 26, 0.6)',
  },
  captureConfirmation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  capturedImg: {
    width: '160px',
    height: '120px',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '3px solid #00FF9C',
    boxShadow: '0 0 30px rgba(0, 255, 156, 0.5)',
  },
  captureLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#00FF9C',
    letterSpacing: '2px',
  },
  rssiOverlay: {
    position: 'absolute',
    bottom: '80px',
    left: '16px',
    right: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  rssiCallout: {
    position: 'absolute',
    left: '16px',
    background: 'rgba(0,0,0,0.85)',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '11px',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    border: '1px solid #00FF9C30',
  },
  rssiLabel: {
    position: 'absolute',
    bottom: '0px',
    left: '16px',
    fontSize: '9px',
    color: '#00BFFF',
    letterSpacing: '2px',
    fontWeight: 700,
  },
  rssiSummary: {
    marginTop: '8px',
    padding: '12px 16px',
    backgroundColor: 'rgba(0, 191, 255, 0.05)',
    border: '1px solid #00BFFF30',
    borderRadius: '6px',
  },
};

export default App;
