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

interface CalibrationEntry {
  corner: number;
  gyro: { alpha: number; beta: number; gamma: number };
  timestamp: number;
  hasImage?: boolean;
}

interface CalibrationData {
  [nodeId: string]: { [corner: string]: CalibrationEntry };
}

interface RssiMeasurement {
  toNodeId: string;
  rssi: number;
  distance: number;
}

interface RssiData {
  [fromNodeId: string]: {
    fromNodeId: string;
    measurements: RssiMeasurement[];
    timestamp: number;
  };
}

type AppPhase = 'register_calibrate' | 'deploy' | 'mapping';

export const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('register_calibrate');
  const [activeTab, setActiveTab] = useState<'calibrate' | 'map'>('calibrate');
  const [nodes, setNodes] = useState<RegisteredNode[]>([]);
  const [calibrations, setCalibrations] = useState<CalibrationData>({});
  const [rssiData, setRssiData] = useState<RssiData>({});
  const [countdown, setCountdown] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const [rssiReceived, setRssiReceived] = useState(0);
  const nodesRef = useRef<RegisteredNode[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for nodes and calibrations every 2s - PERSISTENT merge
  useEffect(() => {
    if (phase === 'deploy') return; // still poll during mapping

    const poll = () => {
      fetch(`${SERVER_URL}/nodes`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            // MERGE: never replace, only add/update
            const currentMap = new Map(nodesRef.current.map(n => [n.nodeId, n]));
            data.forEach((n: any) => {
              currentMap.set(n.nodeId, {
                nodeId: n.nodeId,
                deviceType: n.deviceType || 'unknown',
                ip: n.ip || '0.0.0.0',
                status: n.status || 'REGISTERED',
                calibrationProgress: n.calibrationProgress || 0,
              });
            });
            const merged = Array.from(currentMap.values());
            nodesRef.current = merged;
            setNodes(merged);
          }
          // If data is empty/null from poll failure, keep existing nodes
          setLoaded(true);
        })
        .catch(() => { setLoaded(true); });

      fetch(`${SERVER_URL}/calibrations`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            setCalibrations(data);
          }
        })
        .catch(() => {});

      fetch(`${SERVER_URL}/rssi`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && typeof data === 'object') {
            setRssiData(data);
            setRssiReceived(Object.keys(data).length);
          }
        })
        .catch(() => {});
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [phase]);

  const getCalibrationCount = (nodeId: string): number => {
    if (calibrations[nodeId]) return Object.keys(calibrations[nodeId]).length;
    const node = nodes.find(n => n.nodeId === nodeId);
    return node?.calibrationProgress || 0;
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'REGISTERED': return '#FFD700';
      case 'CALIBRATING': return '#00BFFF';
      case 'CALIBRATED': return '#00FF9C';
      case 'DEPLOYED': return '#00FF9C';
      case 'DISCONNECTED': return '#FF4040';
      default: return '#FFD700';
    }
  };

  const getStatusLabel = (node: RegisteredNode): string => {
    const calCount = getCalibrationCount(node.nodeId);
    if (node.status === 'DISCONNECTED') return 'DISCONNECTED';
    if (calCount >= 4) return '4/4 READY';
    if (calCount > 0) return `${calCount}/4`;
    return 'REGISTERED';
  };

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

  const handleReset = async () => {
    try {
      await fetch(`${SERVER_URL}/reset`, { method: 'POST' });
    } catch {}
    nodesRef.current = [];
    setNodes([]);
    setCalibrations({});
    setRssiData({});
    setRssiReceived(0);
    setLoaded(false);
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
          <PhaseDeploy nodes={nodes} countdown={countdown} rssiReceived={rssiReceived} onSkip={handleSkipToMapping} />
        )}
        {phase !== 'deploy' && activeTab === 'calibrate' && (
          <PhaseRegisterCalibrate
            nodes={nodes}
            loaded={loaded}
            getCalibrationCount={getCalibrationCount}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            onDeploy={handleDeploy}
            onReset={handleReset}
          />
        )}
        {phase !== 'deploy' && activeTab === 'map' && (
          <PhaseMapping nodes={nodes} calibrations={calibrations} rssiData={rssiData} onReset={handleReset} />
        )}
      </div>

      <div style={styles.footer}>
        <span>ARGUS TACTICAL SYSTEM v2.1</span>
        <span>{OPERATOR_KEY}</span>
        <span>NODES: {nodes.length}</span>
      </div>
    </div>
  );
};

/* ─── Phase 1: Register + Calibrate ─── */
const PhaseRegisterCalibrate: React.FC<{
  nodes: RegisteredNode[];
  loaded: boolean;
  getCalibrationCount: (nodeId: string) => number;
  getStatusColor: (status: string) => string;
  getStatusLabel: (node: RegisteredNode) => string;
  onDeploy: () => void;
  onReset: () => void;
}> = ({ nodes, loaded, getCalibrationCount, getStatusColor, getStatusLabel, onDeploy, onReset }) => {
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
          {nodes.length === 0 && !loaded && (
            <div style={styles.noDevices}>Waiting for devices to connect...</div>
          )}
          {nodes.length === 0 && loaded && (
            <div style={styles.noDevices}>No devices registered yet. Scan QR to begin.</div>
          )}
          {nodes.map((node, i) => {
            const statusColor = getStatusColor(node.status);
            const statusLabel = getStatusLabel(node);
            const isDimmed = node.status === 'DISCONNECTED';
            return (
              <div key={node.nodeId} style={{ ...styles.deviceRow, opacity: isDimmed ? 0.5 : 1 }}>
                <div style={{
                  ...styles.statusDot,
                  backgroundColor: statusColor,
                }} />
                <span style={styles.deviceId}>NODE-{(i + 1).toString().padStart(2, '0')}</span>
                <span style={styles.deviceType}>{node.deviceType.toUpperCase()}</span>
                <span style={{
                  ...styles.deviceCalibration,
                  color: statusColor,
                }}>
                  {statusLabel}
                </span>
              </div>
            );
          })}
        </div>

        {/* Deploy button */}
        <button style={styles.deployBtn} onClick={onDeploy}>
          ▶ DEPLOY
        </button>

        {/* Reset Demo button */}
        <button style={styles.resetDemoBtn} onClick={onReset}>
          RESET DEMO
        </button>
      </div>
    </div>
  </div>
  );
};

/* ─── Phase 2: Deploy (Scanning + RSSI) ─── */
const PhaseDeploy: React.FC<{
  nodes: RegisteredNode[];
  countdown: number;
  rssiReceived: number;
  onSkip: () => void;
}> = ({ nodes, countdown, rssiReceived, onSkip }) => (
  <div style={styles.phaseContainer}>
    <div style={styles.deployCenter}>
      <div style={styles.scanningPulse} />
      <div style={styles.deployTitle}>DEPLOYING — Cameras + RSSI Active</div>
      <div style={styles.countdownDisplay}>{countdown}s</div>
      <div style={styles.rssiStatus}>
        RSSI DATA RECEIVED: <span style={{ color: '#00FF9C' }}>{rssiReceived}</span> / {nodes.length} nodes
      </div>
      <div style={styles.scanningDevices}>
        {nodes.map((node, i) => (
          <div key={node.nodeId} style={styles.scanningDeviceRow}>
            <span style={{ color: '#FF4040', fontSize: '14px' }}>●</span>
            <span style={styles.deviceId}>NODE-{(i + 1).toString().padStart(2, '0')}</span>
            <span style={styles.recordingLabel}>RECORDING + RSSI</span>
          </div>
        ))}
      </div>
      <button style={styles.skipBtn} onClick={onSkip}>
        SKIP TO MAPPING →
      </button>
    </div>
  </div>
);

/* ─── Phase 3: Mapping (Photogrammetry + RSSI) ─── */
const PhaseMapping: React.FC<{
  nodes: RegisteredNode[];
  calibrations: CalibrationData;
  rssiData: RssiData;
  onReset: () => void;
}> = ({ nodes, calibrations, rssiData, onReset }) => {
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

    // Room boundary (fixed rectangle)
    ctx.strokeStyle = '#00FF9C';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(roomX, roomY, roomW, roomH);

    // Corner markers
    const corners = [
      { x: roomX, y: roomY, label: '1-TL' },
      { x: roomX + roomW, y: roomY, label: '2-TR' },
      { x: roomX + roomW, y: roomY + roomH, label: '3-BR' },
      { x: roomX, y: roomY + roomH, label: '4-BL' },
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

    // Compute node positions from gyro calibration data (photogrammetry)
    const nodePositions: { x: number; y: number; nodeId: string; label: string }[] = [];

    nodes.forEach((node, idx) => {
      const cal = calibrations[node.nodeId];
      let posX = roomX + roomW / 2;
      let posY = roomY + roomH / 2;

      if (cal && Object.keys(cal).length >= 2) {
        // Simple photogrammetry: average gyro across captured corners
        // alpha offset from center -> X, beta offset -> Y
        let totalAlpha = 0;
        let totalBeta = 0;
        let count = 0;

        Object.values(cal).forEach((entry) => {
          if (entry && entry.gyro) {
            totalAlpha += entry.gyro.alpha;
            totalBeta += entry.gyro.beta;
            count++;
          }
        });

        if (count > 0) {
          const avgAlpha = totalAlpha / count;
          const avgBeta = totalBeta / count;
          // Normalize: alpha 0-360 maps to room width, beta -90 to 90 maps to room height
          const normalizedX = (avgAlpha % 360) / 360;
          const normalizedY = (avgBeta + 90) / 180;
          posX = roomX + normalizedX * roomW;
          posY = roomY + normalizedY * roomH;
          // Clamp to room bounds
          posX = Math.max(roomX + 15, Math.min(roomX + roomW - 15, posX));
          posY = Math.max(roomY + 15, Math.min(roomY + roomH - 15, posY));
        }
      } else {
        // Fallback: distribute evenly if no calibration data yet
        const angle = (idx / Math.max(nodes.length, 1)) * Math.PI * 2;
        posX = roomX + roomW / 2 + Math.cos(angle) * roomW * 0.3;
        posY = roomY + roomH / 2 + Math.sin(angle) * roomH * 0.3;
      }

      nodePositions.push({ x: posX, y: posY, nodeId: node.nodeId, label: `N-${(idx + 1).toString().padStart(2, '0')}` });
    });

    // Draw RSSI proximity lines between nodes
    if (Object.keys(rssiData).length > 0) {
      const posMap = new Map(nodePositions.map(p => [p.nodeId, p]));

      Object.values(rssiData).forEach((entry) => {
        const fromPos = posMap.get(entry.fromNodeId);
        if (!fromPos) return;

        entry.measurements.forEach((m) => {
          const toPos = posMap.get(m.toNodeId);
          if (!toPos) return;

          // Line opacity based on signal strength (stronger = more opaque)
          const strength = Math.min(1, Math.max(0.2, (m.rssi + 100) / 60));
          ctx.strokeStyle = `rgba(0, 191, 255, ${strength * 0.6})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(fromPos.x, fromPos.y);
          ctx.lineTo(toPos.x, toPos.y);
          ctx.stroke();

          // Distance label at midpoint
          const mx = (fromPos.x + toPos.x) / 2;
          const my = (fromPos.y + toPos.y) / 2;
          ctx.font = '8px monospace';
          ctx.fillStyle = '#00BFFF80';
          ctx.fillText(`${m.distance}m`, mx + 3, my - 3);
        });
      });
      ctx.setLineDash([]);
    }

    // Draw nodes
    nodePositions.forEach((pos) => {
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
      ctx.fillText(pos.label, pos.x - 10, pos.y + 22);
    });

    // Title
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#00FF9C';
    ctx.fillText('TACTICAL MAP — PHOTOGRAMMETRY + RSSI MESH', roomX, roomY - 20);

  }, [nodes, calibrations, rssiData]);

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
          <div style={styles.legendItem}><span style={{ color: '#00BFFF' }}>┅</span> RSSI Links</div>
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
    cursor: 'pointer',
  },
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
  rssiStatus: {
    fontSize: '12px',
    color: '#00BFFF',
    letterSpacing: '1px',
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
