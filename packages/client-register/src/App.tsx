import { useState, useEffect, useRef } from 'react';

function getServerUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('server') || 'https://ksxaeu4eb8.execute-api.us-east-1.amazonaws.com';
}

type AppStep = 'registering' | 'calibrating' | 'standby' | 'scanning' | 'complete' | 'error';

function App() {
  const [step, setStep] = useState<AppStep>('registering');
  const [nodeId, setNodeId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [calibrationCorner, setCalibrationCorner] = useState(0);
  const [countdown, setCountdown] = useState(5);
  const videoRef = useRef<HTMLVideoElement>(null);
  const calibrationVideoRef = useRef<HTMLVideoElement>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serverUrl = getServerUrl();

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

  // Step 2: Mark a corner
  const handleMarkCorner = async () => {
    const corner = calibrationCorner;
    try {
      await fetch(`${serverUrl}/calibrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, corner, timestamp: Date.now() }),
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
            startCamera();
          }
        })
        .catch(() => {});
    }, 2000);

    return () => clearInterval(poll);
  }, [step, serverUrl]);

  // Step 4: Camera + 5s countdown
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {}

    let t = 5;
    setCountdown(5);
    countdownRef.current = setInterval(() => {
      t -= 1;
      setCountdown(t);
      if (t <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        if (videoRef.current && videoRef.current.srcObject) {
          const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
          tracks.forEach(track => track.stop());
        }
        setStep('complete');
      }
    }, 1000);
  };

  const cornerNames = ['TOP-LEFT', 'TOP-RIGHT', 'BOTTOM-RIGHT', 'BOTTOM-LEFT'];

  // ─── ERROR ───
  if (step === 'error') {
    return (
      <div style={styles.container}>
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
        <video
          ref={calibrationVideoRef}
          playsInline
          muted
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
        />
        <div style={styles.calibrationOverlay}>
          <div style={{ fontSize: '48px', color: '#00BFFF' }}>◎</div>
          <h2 style={styles.title}>CALIBRATION</h2>
          <p style={styles.instruction}>
            Point your device at corner {calibrationCorner + 1} (<span style={{ color: '#00FF9C', fontWeight: 700 }}>{cornerNames[calibrationCorner]}</span>) of the room and tap MARK
          </p>
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
        <div style={{ fontSize: '48px', color: '#00FF9C' }}>✓</div>
        <h2 style={styles.title}>Calibrated ✓</h2>
        <p style={styles.message}>Standing by for deploy</p>
        <div style={styles.badge}>{nodeId.substring(0, 8)}</div>
      </div>
    );
  }

  // ─── SCANNING ───
  if (step === 'scanning') {
    return (
      <div style={{ ...styles.container, padding: 0 }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100vh', objectFit: 'cover' }} />
        <div style={styles.scanOverlay}>
          <div style={styles.scanBadge}><span style={{ color: '#FF4040' }}>●</span> RECORDING</div>
          <div style={styles.scanCountdown}>{countdown}s</div>
        </div>
      </div>
    );
  }

  // ─── COMPLETE ───
  return (
    <div style={styles.container}>
      <div style={{ fontSize: '48px', color: '#00FF9C' }}>✓</div>
      <h2 style={styles.title}>Scan complete</h2>
      <p style={styles.message}>Data captured</p>
      <div style={styles.badge}>{nodeId.substring(0, 8)}</div>
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
};

export default App;
