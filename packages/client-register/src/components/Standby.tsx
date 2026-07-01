import { useState, useEffect } from 'react';

export interface StandbyProps {
  nodeId: string;
  connected: boolean;
}

/**
 * Standby component — displays the node ID badge, connection status,
 * and awaits the DEPLOY_ORDER from the server.
 *
 * Requirements: 6.1
 */
export function Standby({ nodeId, connected }: StandbyProps) {
  const [dots, setDots] = useState('');

  // Animate the waiting dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  const shortId = nodeId.slice(0, 8);

  return (
    <div style={styles.container}>
      <div style={styles.badge}>
        <span style={styles.badgeLabel}>NODE</span>
        <span style={styles.badgeId}>{shortId}</span>
      </div>

      <div style={styles.statusRow}>
        <span
          style={{
            ...styles.statusDot,
            backgroundColor: connected ? '#00FF9C' : '#FF4444',
          }}
        />
        <span style={styles.statusText}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <p style={styles.waitingText}>Awaiting deploy order{dots}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#050D1A',
    color: '#FFFFFF',
    fontFamily: 'monospace',
    padding: '1rem',
  },
  badge: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1.5rem 2rem',
    border: '2px solid #00FF9C',
    borderRadius: '8px',
    marginBottom: '2rem',
  },
  badgeLabel: {
    fontSize: '0.75rem',
    color: '#00BFFF',
    letterSpacing: '0.15em',
    marginBottom: '0.25rem',
  },
  badgeId: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#00FF9C',
    letterSpacing: '0.1em',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '0.875rem',
    color: '#CCCCCC',
  },
  waitingText: {
    fontSize: '1rem',
    color: '#00BFFF',
    textAlign: 'center',
  },
};

export default Standby;
