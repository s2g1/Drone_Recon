import React, { useCallback } from 'react';
import { Phase, NodeStatus } from '@argus/shared';
import type { DeviceNode } from '@argus/shared';

export interface OperatorConsoleProps {
  isOpen: boolean;
  phase: Phase;
  validTransitions: Phase[];
  nodes: DeviceNode[];
  serverUrl: string;
  operatorKey: string;
  onPhaseChange?: (newPhase: Phase) => void;
}

const PANEL_WIDTH = 300;

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: `${PANEL_WIDTH}px`,
    background: 'rgba(5, 13, 26, 0.96)',
    borderLeft: '1px solid #00FF9C60',
    fontFamily: '"JetBrains Mono", monospace',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column' as const,
    transition: 'transform 200ms ease-in-out',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #00FF9C40',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '2px',
    color: '#00FF9C',
    textTransform: 'uppercase' as const,
  },
  section: {
    padding: '12px 16px',
    borderBottom: '1px solid #1a2d3d',
  },
  sectionTitle: {
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    color: '#00BFFF80',
    marginBottom: '8px',
  },
  phaseButton: {
    display: 'block',
    width: '100%',
    padding: '8px 12px',
    marginBottom: '6px',
    background: 'transparent',
    border: '1px solid #00FF9C',
    borderRadius: '3px',
    color: '#00FF9C',
    fontSize: '11px',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
  },
  nodeTable: {
    width: '100%',
    fontSize: '10px',
    borderCollapse: 'collapse' as const,
    color: '#00BFFF',
  },
  tableHeader: {
    textAlign: 'left' as const,
    padding: '4px 6px',
    borderBottom: '1px solid #1a2d3d',
    color: '#00BFFF80',
    fontSize: '9px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tableCell: {
    padding: '4px 6px',
    borderBottom: '1px solid #0a1520',
    verticalAlign: 'middle' as const,
  },
  kickButton: {
    padding: '2px 6px',
    background: 'transparent',
    border: '1px solid #FF4040',
    borderRadius: '2px',
    color: '#FF4040',
    fontSize: '9px',
    fontFamily: '"JetBrains Mono", monospace',
    cursor: 'pointer',
    transition: 'background 150ms ease',
  },
  killSwitch: {
    display: 'block',
    width: 'calc(100% - 32px)',
    margin: '16px',
    padding: '12px',
    background: '#FF404020',
    border: '2px solid #FF4040',
    borderRadius: '4px',
    color: '#FF4040',
    fontSize: '12px',
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    transition: 'background 150ms ease',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto' as const,
  },
};

function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;
  if (delta < 1000) return 'now';
  if (delta < 60000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  return `${Math.floor(delta / 3600000)}h ago`;
}

function getStatusIndicator(node: DeviceNode): { label: string; color: string } {
  if (node.status === NodeStatus.ERROR) {
    return { label: 'ERR', color: '#FF4040' };
  }
  // Consider connected if heartbeat is recent (within 35s = 2x interval + margin)
  const heartbeatAge = Date.now() - node.lastHeartbeat;
  if (heartbeatAge > 35000) {
    return { label: 'STALE', color: '#FFB800' };
  }
  return { label: 'OK', color: '#00FF9C' };
}

const OperatorConsole: React.FC<OperatorConsoleProps> = ({
  isOpen,
  phase,
  validTransitions,
  nodes,
  serverUrl,
  operatorKey,
  onPhaseChange,
}) => {
  const handlePhaseAdvance = useCallback(
    async (newPhase: Phase) => {
      try {
        const res = await fetch(`${serverUrl}/api/operator/phase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Operator-Key': operatorKey,
          },
          body: JSON.stringify({ phase: newPhase }),
        });
        if (res.ok) {
          onPhaseChange?.(newPhase);
        }
      } catch {
        // Silently handle — operator will see phase hasn't changed
      }
    },
    [serverUrl, operatorKey, onPhaseChange]
  );

  const handleKick = useCallback(
    async (nodeId: string) => {
      try {
        await fetch(`${serverUrl}/api/operator/kick/${nodeId}`, {
          method: 'POST',
          headers: {
            'X-Operator-Key': operatorKey,
          },
        });
      } catch {
        // Silently handle
      }
    },
    [serverUrl, operatorKey]
  );

  const handleKillSwitch = useCallback(async () => {
    try {
      await fetch(`${serverUrl}/api/operator/phase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operator-Key': operatorKey,
        },
        body: JSON.stringify({ phase: Phase.IDLE }),
      });
      onPhaseChange?.(Phase.IDLE);
    } catch {
      // Silently handle
    }
  }, [serverUrl, operatorKey, onPhaseChange]);

  const transform = isOpen ? 'translateX(0)' : `translateX(${PANEL_WIDTH}px)`;

  return (
    <aside
      style={{ ...styles.overlay, transform }}
      role="complementary"
      aria-label="Operator Console"
      aria-hidden={!isOpen}
    >
      <div style={styles.header}>Operator Console</div>

      <div style={styles.scrollArea}>
        {/* Phase Controls */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Phase Control</div>
          <div
            style={{ fontSize: '10px', color: '#00BFFF', marginBottom: '8px' }}
          >
            Current: <span style={{ color: '#00FF9C' }}>{phase}</span>
          </div>
          {validTransitions.length > 0 ? (
            validTransitions.map((target) => (
              <button
                key={target}
                style={styles.phaseButton}
                onClick={() => handlePhaseAdvance(target)}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.background = '#00FF9C20';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'transparent';
                }}
                aria-label={`Advance phase to ${target}`}
              >
                → {target}
              </button>
            ))
          ) : (
            <div style={{ fontSize: '10px', color: '#00BFFF60' }}>
              No valid transitions
            </div>
          )}
        </div>

        {/* Node Table */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Nodes ({nodes.length})
          </div>
          {nodes.length > 0 ? (
            <table style={styles.nodeTable} aria-label="Registered nodes">
              <thead>
                <tr>
                  <th style={styles.tableHeader}>ID</th>
                  <th style={styles.tableHeader}>IP</th>
                  <th style={styles.tableHeader}>Type</th>
                  <th style={styles.tableHeader}>Status</th>
                  <th style={styles.tableHeader}>HB</th>
                  <th style={styles.tableHeader}></th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => {
                  const status = getStatusIndicator(node);
                  return (
                    <tr key={node.nodeId}>
                      <td style={styles.tableCell}>
                        {node.nodeId.substring(0, 8)}
                      </td>
                      <td style={styles.tableCell}>{node.ip}</td>
                      <td style={styles.tableCell}>
                        {node.deviceType === 'android' ? 'AND' : 'iOS'}
                      </td>
                      <td style={{ ...styles.tableCell, color: status.color }}>
                        {status.label}
                      </td>
                      <td style={styles.tableCell}>
                        {formatRelativeTime(node.lastHeartbeat)}
                      </td>
                      <td style={styles.tableCell}>
                        <button
                          style={styles.kickButton}
                          onClick={() => handleKick(node.nodeId)}
                          onMouseEnter={(e) => {
                            (e.target as HTMLButtonElement).style.background =
                              '#FF404030';
                          }}
                          onMouseLeave={(e) => {
                            (e.target as HTMLButtonElement).style.background =
                              'transparent';
                          }}
                          aria-label={`Kick node ${node.nodeId.substring(0, 8)}`}
                        >
                          KICK
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: '10px', color: '#00BFFF60' }}>
              No nodes registered
            </div>
          )}
        </div>
      </div>

      {/* Kill Switch — always at the bottom */}
      <button
        style={styles.killSwitch}
        onClick={handleKillSwitch}
        onMouseEnter={(e) => {
          (e.target as HTMLButtonElement).style.background = '#FF404040';
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLButtonElement).style.background = '#FF404020';
        }}
        aria-label="Kill switch: reset system to IDLE and disconnect all nodes"
      >
        ⚠ Kill Switch
      </button>
    </aside>
  );
};

export default OperatorConsole;
