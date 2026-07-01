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
    gyro?: { alpha: number; beta: number; gamma: number };
    planeDetection?: { type: string; confidence: number; region: string };
  };
}

type AppPhase = 'register_calibrate' | 'deploy' | 'mapping';

export const App: React.FC = () => {
  const [phase, setPhase] = useState<AppPhase>('register_calibrate');
  const [activeTab, setActiveTab] = useState<'calibrate' | 'map'>('calibrate');
  const [nodes, setNodes] = useState<RegisteredNode[]>([]);
  const [calibrations, setCalibrations] = useState<CalibrationData>({});
  const [rssiData, setRssiData] = useState<RssiData>({});
  const [loaded, setLoaded] = useState(false);
  const nodesRef = useRef<RegisteredNode[]>([]);

  // Poll for nodes and calibrations every 2s - PERSISTENT merge
  useEffect(() => {
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
    try {
      await fetch(`${SERVER_URL}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_scan', timestamp: Date.now() }),
      });
    } catch {}
    // Immediately go to map — no countdown
    setPhase('mapping');
    setActiveTab('map');
  }, []);



  const handleReset = async () => {
    try {
      await fetch(`${SERVER_URL}/reset`, { method: 'POST' });
    } catch {}
    nodesRef.current = [];
    setNodes([]);
    setCalibrations({});
    setRssiData({});
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
            onClick={() => { setActiveTab('calibrate'); setPhase('register_calibrate'); }}
          >
            CALIBRATE
          </button>
          <button
            style={activeTab === 'map' ? styles.tabActive : styles.tabInactive}
            onClick={() => { setActiveTab('map'); setPhase('mapping'); }}
          >
            MAP
          </button>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.nodeCount}>{loaded ? `${nodes.length} DEVICES` : 'Loading...'}</span>
        </div>
      </div>

      <div style={styles.main}>
        {activeTab === 'calibrate' && (
          <PhaseRegisterCalibrate
            nodes={nodes}
            loaded={loaded}
            rssiData={rssiData}
            getCalibrationCount={getCalibrationCount}
            getStatusColor={getStatusColor}
            getStatusLabel={getStatusLabel}
            onDeploy={handleDeploy}
            onReset={handleReset}
          />
        )}
        {activeTab === 'map' && (
          <PhaseMapping nodes={nodes} calibrations={calibrations} rssiData={rssiData} onReset={handleReset} />
        )}
      </div>

      <div style={styles.footer}>
        <span>ARGUS TACTICAL SYSTEM v2.3</span>
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
  rssiData: RssiData;
  getCalibrationCount: (nodeId: string) => number;
  getStatusColor: (status: string) => string;
  getStatusLabel: (node: RegisteredNode) => string;
  onDeploy: () => void;
  onReset: () => void;
}> = ({ nodes, loaded, rssiData, getCalibrationCount, getStatusColor, getStatusLabel, onDeploy, onReset }) => {
  const STALE_THRESHOLD_CAL = 6000;
  const now = Date.now();

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
            // Stale detection: if node has RSSI data and timestamp is older than threshold
            const nodeRssi = rssiData[node.nodeId];
            const hasRssiData = nodeRssi && nodeRssi.timestamp > 0;
            const isStale = hasRssiData && (now - nodeRssi.timestamp) > STALE_THRESHOLD_CAL;

            const statusColor = isStale ? '#FF4040' : getStatusColor(node.status);
            const statusLabel = isStale ? 'STALE' : getStatusLabel(node);
            const isDimmed = node.status === 'DISCONNECTED' && !isStale;
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

/* ─── Phase 3: Mapping (Photogrammetry + RSSI) — persistent live view ─── */
const STALE_THRESHOLD = 6000; // 6 seconds

const PhaseMapping: React.FC<{
  nodes: RegisteredNode[];
  calibrations: CalibrationData;
  rssiData: RssiData;
  onReset: () => void;
}> = ({ nodes, calibrations, rssiData: initialRssiData, onReset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [liveRssiData, setLiveRssiData] = useState<RssiData>(initialRssiData);

  // Poll RSSI every 2 seconds for live map updates
  useEffect(() => {
    const poll = () => {
      fetch(`${SERVER_URL}/rssi`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && typeof data === 'object') {
            setLiveRssiData(data);
          }
        })
        .catch(() => {});
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  // Keep in sync if parent passes new data
  useEffect(() => {
    if (initialRssiData && Object.keys(initialRssiData).length > 0) {
      setLiveRssiData(initialRssiData);
    }
  }, [initialRssiData]);

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
    // If live gyro from RSSI is available, use it for real-time movement
    const nodePositions: { x: number; y: number; nodeId: string; label: string }[] = [];

    nodes.forEach((node, idx) => {
      const cal = calibrations[node.nodeId];
      const nodeRssi = liveRssiData[node.nodeId];
      let posX = roomX + roomW / 2;
      let posY = roomY + roomH / 2;

      // Prefer live gyro from RSSI data (real-time movement)
      if (nodeRssi && nodeRssi.gyro) {
        const liveGyro = nodeRssi.gyro;
        const normalizedX = (liveGyro.alpha % 360) / 360;
        const normalizedY = (liveGyro.beta + 90) / 180;
        posX = roomX + normalizedX * roomW;
        posY = roomY + normalizedY * roomH;
        posX = Math.max(roomX + 15, Math.min(roomX + roomW - 15, posX));
        posY = Math.max(roomY + 15, Math.min(roomY + roomH - 15, posY));
      } else if (cal && Object.keys(cal).length >= 2) {
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
          const normalizedX = (avgAlpha % 360) / 360;
          const normalizedY = (avgBeta + 90) / 180;
          posX = roomX + normalizedX * roomW;
          posY = roomY + normalizedY * roomH;
          posX = Math.max(roomX + 15, Math.min(roomX + roomW - 15, posX));
          posY = Math.max(roomY + 15, Math.min(roomY + roomH - 15, posY));
        }
      } else {
        const angle = (idx / Math.max(nodes.length, 1)) * Math.PI * 2;
        posX = roomX + roomW / 2 + Math.cos(angle) * roomW * 0.3;
        posY = roomY + roomH / 2 + Math.sin(angle) * roomH * 0.3;
      }

      nodePositions.push({ x: posX, y: posY, nodeId: node.nodeId, label: `N-${(idx + 1).toString().padStart(2, '0')}` });
    });

    // Draw RSSI proximity lines between nodes
    if (Object.keys(liveRssiData).length > 0) {
      const posMap = new Map(nodePositions.map(p => [p.nodeId, p]));

      Object.values(liveRssiData).forEach((entry) => {
        const fromPos = posMap.get(entry.fromNodeId);
        if (!fromPos) return;

        entry.measurements.forEach((m) => {
          const toPos = posMap.get(m.toNodeId);
          if (!toPos) return;

          const strength = Math.min(1, Math.max(0.2, (m.rssi + 100) / 60));
          ctx.strokeStyle = `rgba(0, 191, 255, ${strength * 0.6})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(fromPos.x, fromPos.y);
          ctx.lineTo(toPos.x, toPos.y);
          ctx.stroke();

          const mx = (fromPos.x + toPos.x) / 2;
          const my = (fromPos.y + toPos.y) / 2;
          ctx.font = '8px monospace';
          ctx.fillStyle = '#00BFFF80';
          ctx.fillText(`${m.distance}m`, mx + 3, my - 3);
        });
      });
      ctx.setLineDash([]);
    }

    // Draw nodes with health coloring (GREEN = active, RED = stale)
    const now = Date.now();
    nodePositions.forEach((pos) => {
      // Determine node health based on RSSI timestamp
      const nodeRssi = liveRssiData[pos.nodeId];
      const lastRssiTime = nodeRssi?.timestamp || 0;
      const isActive = (now - lastRssiTime) < STALE_THRESHOLD;
      const nodeColor = isActive ? '#00FF9C' : '#FF4040';

      // Outer ring
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = isActive ? '#00FF9C40' : '#FF404040';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Inner dot
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor;
      ctx.fill();
      // Label
      ctx.font = '9px monospace';
      ctx.fillStyle = nodeColor;
      ctx.fillText(pos.label, pos.x - 10, pos.y + 22);
      // STALE label for red nodes
      if (!isActive) {
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#FF4040';
        ctx.fillText('STALE', pos.x - 14, pos.y - 16);
      }
      // Plane detection warning indicator
      if (nodeRssi?.planeDetection) {
        const pd = nodeRssi.planeDetection;
        // Yellow warning triangle
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('⚠', pos.x + 14, pos.y - 4);
        // Plane type label
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(pd.type, pos.x + 14, pos.y + 8);
      }
    });

    // Title
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#00FF9C';
    ctx.fillText('TACTICAL MAP — LIVE RSSI MESH', roomX, roomY - 20);

  }, [nodes, calibrations, liveRssiData]);

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
          <div style={styles.legendItem}><span style={{ color: '#00FF9C' }}>●</span> Active</div>
          <div style={styles.legendItem}><span style={{ color: '#FF4040' }}>●</span> Stale</div>
          <div style={styles.legendItem}><span style={{ color: '#FFD700' }}>⚠</span> Plane</div>
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
