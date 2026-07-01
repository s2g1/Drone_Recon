import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const SERVER_URL = 'https://ksxaeu4eb8.execute-api.us-east-1.amazonaws.com';
const REGISTRATION_URL = `https://dcaloltnto1d8.cloudfront.net?server=${encodeURIComponent(SERVER_URL)}`;
const OPERATOR_KEY = 'argus-operator';

interface RegisteredNode {
  nodeId: string;
  deviceType: string;
  ip: string;
  status: string;
  calibrationProgress: number;
}

interface CalibrationData {
  [nodeId: string]: number[];
}

type AppPhase = 'register_calibrate' | 'deploy' | 'mapping';

export const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('register_calibrate');
  const [activeTab, setActiveTab] = useState<'calibrate' | 'map'>('calibrate');
  const [nodes, setNodes] = useState<RegisteredNode[]>([]);
  const [calibrations, setCalibrations] = useState<CalibrationData>({});
  const [countdown, setCountdown] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for nodes and calibrations every 2s
  useEffect(() => {
    if (phase !== 'register_calibrate') return;

    const poll = () => {
      fetch(`${SERVER_URL}/nodes`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (Array.isArray(data)) {
            setNodes(data.map((n: any) => ({
              nodeId: n.nodeId,
              deviceType: n.deviceType || 'unknown',
              ip: n.ip || '0.0.0.0',
              status: n.status || 'REGISTERED',
              calibrationProgress: n.calibrationProgress || 0,
            })));
          }
          setLoaded(true);
        })
        .catch(() => { setLoaded(true); });

      fetch(`${SERVER_URL}/calibrations`)
        .then(res => res.ok ? res.json() : {})
        .then(data => {
          if (data && typeof data === 'object') {
            setCalibrations(data);
          }
        })
        .catch(() => {});
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [phase]);

  const getCalibrationCount = (nodeId: string): number => {
    if (calibrations[nodeId]) return calibrations[nodeId].length;
    const node = nodes.find(n => n.nodeId === nodeId);
    return node?.calibrationProgress || 0;
  };

  const hasReadyDevice = nodes.some(n => getCalibrationCount(n.nodeId) >= 4);

  const handleDeploy = useCallback(async () => {
    setPhase('deploy');
    setCountdown(5);
    try {
      await fetch(`${SERVER_URL}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_scan', timestamp: Date.now() }),
      });
    } catch {}

    let t = 5;
    countdownRef.current = setInterval(() => {
      t -= 1;
      setCountdown(t);
      if (t <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setPhase('mapping');
        setActiveTab('map');
      }
    }, 1000);
  }, []);

  const handleSkipToMapping = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setPhase('mapping');
    setActiveTab('map');
  };

  const handleReset = () => {
    setPhase('register_calibrate');
    setActiveTab('calibrate');
  };

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.logo}>◆ ARGUS BMS</div>
        <div style={styles.headerTabs}>
          <button
            style={activeTab === 'calibrate' ? styles.tabActive : styles.tabInactive}
            onClick={() => { setActiveTab('calibrate'); if (phase !== 'deploy') setPhase('register_calibrate'); }}
          >
            CALIBRATE
          </button>
          <button
            style={activeTab === 'map' ? styles.tabActive : styles.tabInactive}
            onClick={() => { setActiveTab('map'); if (phase !== 'deploy') setPhase('mapping'); }}
          >
            MAP
          </button>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.nodeCount}>{loaded ? `${nodes.length} DEVICES` : 'Loading...'}</span>
        </div>
      </div>

      <div style={styles.main}>
        {phase === 'deploy' && (
          <PhaseDeploy nodes={nodes} countdown={countdown} onSkip={handleSkipToMapping} />
        )}
        {phase !== 'deploy' && activeTab === 'calibrate' && (
          <PhaseRegisterCalibrate
            nodes={nodes}
            setNodes={setNodes}
            getCalibrationCount={getCalibrationCount}
            hasReadyDevice={hasReadyDevice}
            onDeploy={handleDeploy}
          />
        )}
        {phase !== 'deploy' && activeTab === 'map' && (
          <PhaseMapping nodes={nodes} onReset={handleReset} />
        )}
      </div>

      <div style={styles.footer}>
        <span>ARGUS TACTICAL SYSTEM v2.0</span>
        <span>{OPERATOR_KEY}</span>
        <span>NODES: {nodes.length}</span>
      </div>
    </div>
  );
};

/* ─── Phase 1: Register + Calibrate ─── */
const PhaseRegisterCalibrate: React.FC<{
  nodes: RegisteredNode[];
  setNodes: React.Dispatch<React.SetStateAction<RegisteredNode[]>>;
  getCalibrationCount: (nodeId: string) => number;
  hasReadyDevice: boolean;
  onDeploy: () => void;
}> = ({ nodes, setNodes, getCalibrationCount, hasReadyDevice, onDeploy }) => {
  const handleResetDemo = async () => {
    try {
      await fetch(`${SERVER_URL}/reset`, { method: 'POST' });
    } catch {}
    setNodes([]);
  };

  return (
  <div style={styles.phaseContainer}>
    {/* Corner number markers for calibration */}
    <div style={styles.cornerMarker1}>1</div>
    <div style={styles.cornerMarker2}>2</div>
    <div style={styles.cornerMarker3}>3</div>
    <div style={styles.cornerMarker4}>4</div>

    <div style={styles.splitLayout}>
      {/* Left: QR Code */}
      <div style={styles.leftPanel}>
        <div style={styles.qrContainer}>
          <QRCodeSVG
            value={REGISTRATION_URL}
            size={200}
            bgColor="#FFFFFF"
            fgColor="#050D1A"
            level="M"
          />
          <div style={styles.qrLabel}>SCAN TO REGISTER</div>
        </div>
        <p style={{ fontSize: '10px', color: '#00BFFF60', textAlign: 'center', margin: 0, maxWidth: '220px' }}>
          Open camera and scan QR code to register edge device
        </p>
      </div>

      {/* Right: Device list */}
      <div style={styles.rightPanel}>
        <div style={styles.devicesPanel}>
          <div style={styles.devicesPanelHeader}>
            REGISTERED DEVICES: <span style={{ color: '#00FF9C' }}>{nodes.length}</span>
          </div>
          {nodes.length === 0 && (
            <div style={styles.noDevices}>Waiting for devices to connect...</div>
          )}
          {nodes.map((node, i) => {
            const calCount = getCalibrationCount(node.nodeId);
            return (
              <div key={node.nodeId} style={styles.deviceRow}>
                <div style={{
                  ...styles.statusDot,
                  backgroundColor: calCount >= 4 ? '#00FF9C' : calCount > 0 ? '#00BFFF' : '#FFD700',
                }} />
                <span style={styles.deviceId}>NODE-{(i + 1).toString().padStart(2, '0')}</span>
                <span style={styles.deviceType}>{node.deviceType.toUpperCase()}</span>
                <span style={{
                  ...styles.deviceCalibration,
                  color: calCount >= 4 ? '#00FF9C' : calCount > 0 ? '#00BFFF' : '#FFD700',
                }}>
                  {calCount >= 4 ? '4/4 READY' : calCount > 0 ? `${calCount}/4` : 'REGISTERED'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Deploy button */}
        <button
          style={{
            ...styles.deployBtn,
            cursor: 'pointer',
          }}
          onClick={onDeploy}
        >
          ▶ DEPLOY
        </button>

        {/* Reset Demo button */}
        <button
          style={styles.resetDemoBtn}
          onClick={handleResetDemo}
        >
          RESET DEMO
        </button>
      </div>
    </div>
  </div>
  );
};

/* ─── Phase 2: Deploy (Scanning) ─── */
const PhaseDeploy: React.FC<{
  nodes: RegisteredNode[];
  countdown: number;
  onSkip: () => void;
}> = ({ nodes, countdown, onSkip }) => (
  <div style={styles.phaseContainer}>
    <div style={styles.deployCenter}>
      <div style={styles.scanningPulse} />
      <div style={styles.deployTitle}>DEPLOYING — Cameras Active</div>
      <div style={styles.countdownDisplay}>{countdown}s</div>
      <div style={styles.scanningDevices}>
        {nodes.map((node, i) => (
          <div key={node.nodeId} style={styles.scanningDeviceRow}>
            <span style={{ color: '#FF4040', fontSize: '14px' }}>●</span>
            <span style={styles.deviceId}>NODE-{(i + 1).toString().padStart(2, '0')}</span>
            <span style={styles.recordingLabel}>RECORDING</span>
          </div>
        ))}
      </div>
      <button style={styles.skipBtn} onClick={onSkip}>
        SKIP TO MAPPING →
      </button>
    </div>
  </div>
);

/* ─── Phase 3: Mapping (Tactical Map) ─── */
const PhaseMapping: React.FC<{ nodes: RegisteredNode[]; onReset: () => void }> = ({ nodes, onReset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = '#050D1A';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#00FF9C15';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const margin = 60;
    const roomX = margin;
    const roomY = margin;
    const roomW = w - margin * 2;
    const roomH = h - margin * 2;

    // Room boundaries (green solid)
    ctx.strokeStyle = '#00FF9C';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(roomX, roomY, roomW, roomH);

    // Corner markers
    const corners = [
      { x: roomX, y: roomY, label: 'TL' },
      { x: roomX + roomW, y: roomY, label: 'TR' },
      { x: roomX + roomW, y: roomY + roomH, label: 'BR' },
      { x: roomX, y: roomY + roomH, label: 'BL' },
    ];
    corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#00FF9C';
      ctx.fill();
      ctx.font = '9px monospace';
      ctx.fillStyle = '#00FF9C80';
      ctx.fillText(c.label, c.x + 8, c.y + 4);
    });

    // Exits/Doors (blue dashed gaps)
    ctx.strokeStyle = '#00BFFF';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    // Door 1: top wall
    ctx.beginPath();
    ctx.moveTo(roomX + roomW * 0.35, roomY);
    ctx.lineTo(roomX + roomW * 0.45, roomY);
    ctx.stroke();
    // Door 2: right wall
    ctx.beginPath();
    ctx.moveTo(roomX + roomW, roomY + roomH * 0.4);
    ctx.lineTo(roomX + roomW, roomY + roomH * 0.55);
    ctx.stroke();
    ctx.setLineDash([]);

    // Door labels
    ctx.font = '9px monospace';
    ctx.fillStyle = '#00BFFF';
    ctx.fillText('EXIT', roomX + roomW * 0.35, roomY - 8);
    ctx.fillText('EXIT', roomX + roomW + 8, roomY + roomH * 0.48);

    // Obstacles (red filled rectangles)
    ctx.fillStyle = 'rgba(255, 60, 60, 0.25)';
    ctx.strokeStyle = '#FF3C3C';
    ctx.lineWidth = 1.5;
    // Obstacle 1
    ctx.fillRect(roomX + 80, roomY + roomH * 0.5, 70, 45);
    ctx.strokeRect(roomX + 80, roomY + roomH * 0.5, 70, 45);
    // Obstacle 2
    ctx.fillRect(roomX + roomW * 0.55, roomY + 60, 55, 55);
    ctx.strokeRect(roomX + roomW * 0.55, roomY + 60, 55, 55);
    // Obstacle 3
    ctx.fillRect(roomX + roomW * 0.4, roomY + roomH * 0.65, 60, 35);
    ctx.strokeRect(roomX + roomW * 0.4, roomY + roomH * 0.65, 60, 35);

    // Node positions (based on corner calibration positions)
    const nodePositions = [
      { x: roomX + 30, y: roomY + 30 },
      { x: roomX + roomW - 30, y: roomY + 30 },
      { x: roomX + roomW - 30, y: roomY + roomH - 30 },
      { x: roomX + 30, y: roomY + roomH - 30 },
      { x: roomX + roomW / 2, y: roomY + roomH / 2 },
    ];

    nodes.forEach((_, i) => {
      const pos = nodePositions[i % nodePositions.length];
      // Outer ring
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = '#00FF9C40';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Inner dot
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#00FF9C';
      ctx.fill();
      // Label
      ctx.font = '9px monospace';
      ctx.fillStyle = '#00FF9C';
      ctx.fillText(`N-${(i + 1).toString().padStart(2, '0')}`, pos.x - 10, pos.y + 22);
    });

    // Title
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#00FF9C';
    ctx.fillText('TACTICAL MAP — SCAN COMPLETE', roomX, roomY - 20);

  }, [nodes]);

  return (
    <div style={styles.mappingContainer}>
      <canvas
        ref={canvasRef}
        width={700}
        height={500}
        style={styles.tacticalCanvas}
      />
      <div style={styles.mappingFooter}>
        <div style={styles.mappingLegend}>
          <div style={styles.legendItem}><span style={{ color: '#00FF9C' }}>━</span> Boundaries</div>
          <div style={styles.legendItem}><span style={{ color: '#00BFFF' }}>┅</span> Exits</div>
          <div style={styles.legendItem}><span style={{ color: '#FF3C3C' }}>■</span> Obstacles</div>
          <div style={styles.legendItem}><span style={{ color: '#00FF9C' }}>●</span> Nodes</div>
        </div>
        <button style={styles.resetBtn} onClick={onReset}>RESET</button>
      </div>
    </div>
  );
};

/* ─── Styles ─── */
const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100vw',
    height: '100vh',
    backgroundColor: '#050D1A',
    color: '#00FF9C',
    fontFamily: '"JetBrains Mono", monospace',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    borderBottom: '1px solid #00FF9C30',
    backgroundColor: 'rgba(0, 255, 156, 0.03)',
    flexShrink: 0,
  },
  logo: {
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '3px',
    color: '#00FF9C',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  phaseLabel: {
    fontSize: '11px',
    color: '#00BFFF',
    letterSpacing: '2px',
    backgroundColor: 'rgba(0, 191, 255, 0.1)',
    padding: '4px 10px',
    borderRadius: '3px',
    border: '1px solid #00BFFF40',
  },
  nodeCount: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#00FF9C',
  },
  main: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 24px',
    borderTop: '1px solid #1a2d3d',
    fontSize: '9px',
    color: '#00BFFF40',
    flexShrink: 0,
  },
  phaseContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  splitLayout: {
    display: 'flex',
    alignItems: 'center',
    gap: '60px',
    maxWidth: '900px',
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  rightPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  qrContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '24px',
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    boxShadow: '0 0 40px rgba(0, 255, 156, 0.2)',
  },
  qrLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '3px',
    color: '#050D1A',
  },
  devicesPanel: {
    backgroundColor: 'rgba(0, 191, 255, 0.05)',
    border: '1px solid #00BFFF30',
    borderRadius: '8px',
    padding: '16px 20px',
    minWidth: '340px',
  },
  devicesPanelHeader: {
    fontSize: '10px',
    letterSpacing: '2px',
    color: '#00BFFF',
    marginBottom: '12px',
    fontWeight: 700,
  },
  noDevices: {
    fontSize: '11px',
    color: '#00BFFF40',
    fontStyle: 'italic',
  },
  deviceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
    fontSize: '12px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  deviceId: {
    color: '#00FF9C',
    fontWeight: 600,
    fontSize: '12px',
  },
  deviceType: {
    color: '#00BFFF60',
    fontSize: '10px',
  },
  deviceCalibration: {
    marginLeft: 'auto',
    fontSize: '10px',
    fontWeight: 700,
  },
  deployBtn: {
    padding: '14px 48px',
    background: 'rgba(0, 255, 156, 0.15)',
    border: '2px solid #00FF9C',
    borderRadius: '6px',
    color: '#00FF9C',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '16px',
    fontWeight: 700,
    letterSpacing: '4px',
    boxShadow: '0 0 25px rgba(0, 255, 156, 0.3)',
  },
  /* Deploy phase */
  deployCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  scanningPulse: {
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    backgroundColor: '#00FF9C',
    opacity: 0.7,
    boxShadow: '0 0 30px rgba(0, 255, 156, 0.6)',
  },
  deployTitle: {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '3px',
    color: '#00FF9C',
  },
  countdownDisplay: {
    fontSize: '48px',
    fontWeight: 700,
    color: '#00BFFF',
  },
  scanningDevices: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
  },
  scanningDeviceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '12px',
  },
  recordingLabel: {
    color: '#FF4040',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '2px',
    marginLeft: 'auto',
  },
  skipBtn: {
    marginTop: '16px',
    padding: '10px 24px',
    background: 'transparent',
    border: '1px solid #00BFFF60',
    borderRadius: '4px',
    color: '#00BFFF',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '1px',
    cursor: 'pointer',
  },
  /* Mapping phase */
  mappingContainer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    backgroundColor: '#050D1A',
  },
  tacticalCanvas: {
    border: '1px solid #00FF9C30',
    borderRadius: '4px',
    maxWidth: '100%',
  },
  mappingFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '40px',
  },
  mappingLegend: {
    display: 'flex',
    gap: '20px',
    fontSize: '10px',
    color: '#888',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  resetBtn: {
    padding: '8px 20px',
    background: 'transparent',
    border: '1px solid #FF404080',
    borderRadius: '4px',
    color: '#FF4040',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1px',
    cursor: 'pointer',
  },
  resetDemoBtn: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid #FF4040',
    borderRadius: '4px',
    color: '#FF4040',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '1px',
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  headerTabs: {
    display: 'flex',
    gap: '4px',
  },
  tabActive: {
    padding: '8px 16px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid #00FF9C',
    color: '#00FF9C',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '2px',
    cursor: 'pointer',
  },
  tabInactive: {
    padding: '8px 16px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#00FF9C50',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '2px',
    cursor: 'pointer',
  },
  cornerMarkerBase: {
    position: 'absolute',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: '3px solid #00FF9C',
    backgroundColor: 'rgba(0, 255, 156, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 700,
    color: '#00FF9C',
    boxShadow: '0 0 20px rgba(0, 255, 156, 0.5), 0 0 40px rgba(0, 255, 156, 0.2)',
    zIndex: 10,
  } as React.CSSProperties,
  cornerMarker1: {
    position: 'absolute',
    top: '80px',
    left: '40px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: '3px solid #00FF9C',
    backgroundColor: 'rgba(0, 255, 156, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 700,
    color: '#00FF9C',
    boxShadow: '0 0 20px rgba(0, 255, 156, 0.5), 0 0 40px rgba(0, 255, 156, 0.2)',
    zIndex: 10,
  } as React.CSSProperties,
  cornerMarker2: {
    position: 'absolute',
    top: '80px',
    right: '40px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: '3px solid #00FF9C',
    backgroundColor: 'rgba(0, 255, 156, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 700,
    color: '#00FF9C',
    boxShadow: '0 0 20px rgba(0, 255, 156, 0.5), 0 0 40px rgba(0, 255, 156, 0.2)',
    zIndex: 10,
  } as React.CSSProperties,
  cornerMarker3: {
    position: 'absolute',
    bottom: '60px',
    right: '40px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: '3px solid #00FF9C',
    backgroundColor: 'rgba(0, 255, 156, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 700,
    color: '#00FF9C',
    boxShadow: '0 0 20px rgba(0, 255, 156, 0.5), 0 0 40px rgba(0, 255, 156, 0.2)',
    zIndex: 10,
  } as React.CSSProperties,
  cornerMarker4: {
    position: 'absolute',
    bottom: '60px',
    left: '40px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: '3px solid #00FF9C',
    backgroundColor: 'rgba(0, 255, 156, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 700,
    color: '#00FF9C',
    boxShadow: '0 0 20px rgba(0, 255, 156, 0.5), 0 0 40px rgba(0, 255, 156, 0.2)',
    zIndex: 10,
  } as React.CSSProperties,
};
