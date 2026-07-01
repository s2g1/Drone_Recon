import React, { useEffect, useState, useRef } from 'react';
import { Phase } from '@argus/shared';
import type { StitchProgress } from '@argus/shared';

export interface PhaseHUDProps {
  phase: Phase;
  nodeCount: number;
  deployProgress?: Map<string, number>; // nodeId → progress 0-1
  stitchProgress?: StitchProgress;
  compositeUrl?: string;
}

const CAPTURE_DURATION_S = 10;

const styles = {
  container: {
    position: 'absolute' as const,
    top: '60px',
    right: '16px',
    width: '280px',
    background: 'rgba(5, 13, 26, 0.92)',
    border: '1px solid #00FF9C40',
    borderRadius: '4px',
    padding: '12px',
    fontFamily: '"JetBrains Mono", monospace',
    color: '#00BFFF',
    zIndex: 20,
  },
  phaseLabel: {
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1.5px',
    color: '#00BFFF99',
    marginBottom: '4px',
  },
  phaseValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#00FF9C',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '10px',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    color: '#00BFFF80',
    marginBottom: '6px',
    marginTop: '8px',
  },
  progressBar: {
    height: '4px',
    background: '#1a2d3d',
    borderRadius: '2px',
    overflow: 'hidden' as const,
    marginBottom: '4px',
  },
  progressFill: {
    height: '100%',
    background: '#00FF9C',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  },
  nodeRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    fontSize: '10px',
    marginBottom: '4px',
    color: '#00BFFF',
  },
  countdown: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#00FF9C',
    textAlign: 'center' as const,
    margin: '8px 0',
  },
  stitchStatus: {
    fontSize: '12px',
    color: '#00BFFF',
    marginBottom: '4px',
  },
  compositeImg: {
    width: '100%',
    borderRadius: '2px',
    border: '1px solid #00FF9C60',
    marginTop: '8px',
  },
};

/**
 * PhaseHUD — detailed overlay panel showing phase state, DEPLOY countdown,
 * per-node progress, STITCH progress, and composite result.
 */
const PhaseHUD: React.FC<PhaseHUDProps> = ({
  phase,
  nodeCount,
  deployProgress,
  stitchProgress,
  compositeUrl,
}) => {
  const [countdown, setCountdown] = useState<number>(CAPTURE_DURATION_S);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deployStartRef = useRef<number | null>(null);

  // Manage recording countdown during DEPLOY phase
  useEffect(() => {
    if (phase === Phase.DEPLOY) {
      deployStartRef.current = Date.now();
      setCountdown(CAPTURE_DURATION_S);

      countdownRef.current = setInterval(() => {
        const elapsed = (Date.now() - (deployStartRef.current ?? Date.now())) / 1000;
        const remaining = Math.max(0, CAPTURE_DURATION_S - elapsed);
        setCountdown(Math.ceil(remaining));

        if (remaining <= 0 && countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      }, 250);

      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      };
    } else {
      // Reset when leaving DEPLOY
      setCountdown(CAPTURE_DURATION_S);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
  }, [phase]);

  const renderDeploySection = () => {
    if (phase !== Phase.DEPLOY) return null;

    const entries = deployProgress
      ? Array.from(deployProgress.entries())
      : [];

    return (
      <>
        <div style={styles.countdown} aria-live="polite" aria-label={`Recording countdown: ${countdown} seconds`}>
          {countdown}s
        </div>
        <div style={styles.sectionTitle}>Recording Progress</div>
        {entries.length > 0 ? (
          entries.map(([nodeId, progress]) => (
            <div key={nodeId}>
              <div style={styles.nodeRow}>
                <span>{nodeId.substring(0, 8)}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${Math.min(progress * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: '10px', color: '#00BFFF60' }}>
            Awaiting node captures ({nodeCount} nodes)
          </div>
        )}
      </>
    );
  };

  const renderStitchSection = () => {
    if (phase !== Phase.STITCH) return null;

    const stitchPhaseLabels: Record<string, string> = {
      extracting: 'Extracting frames…',
      compositing: 'Compositing tiles…',
      encoding: 'Encoding output…',
      complete: 'Stitch complete',
      failed: 'Stitch failed',
    };

    return (
      <>
        <div style={styles.sectionTitle}>Stitch Pipeline</div>
        {stitchProgress ? (
          <>
            <div style={styles.stitchStatus}>
              {stitchPhaseLabels[stitchProgress.phase] ?? stitchProgress.phase}
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${Math.min(stitchProgress.progress * 100, 100)}%`,
                  background:
                    stitchProgress.phase === 'failed' ? '#FF4040' : '#00FF9C',
                }}
              />
            </div>
            <div style={{ fontSize: '10px', color: '#00BFFF80', marginTop: '4px' }}>
              {stitchProgress.nodesProcessed}/{stitchProgress.totalNodes} nodes processed
            </div>
          </>
        ) : (
          <div style={{ fontSize: '10px', color: '#00BFFF60' }}>
            Awaiting stitch start…
          </div>
        )}

        {compositeUrl && (
          <>
            <div style={styles.sectionTitle}>Composite Result</div>
            <img
              src={compositeUrl}
              alt="Stitched composite from all node video captures"
              style={styles.compositeImg}
            />
          </>
        )}
      </>
    );
  };

  return (
    <div style={styles.container} role="status" aria-label="Phase HUD overlay">
      <div style={styles.phaseLabel}>Current Phase</div>
      <div style={styles.phaseValue}>{phase}</div>

      <div style={{ fontSize: '10px', color: '#00BFFF80' }}>
        {nodeCount} node{nodeCount !== 1 ? 's' : ''} connected
      </div>

      {renderDeploySection()}
      {renderStitchSection()}
    </div>
  );
};

export default PhaseHUD;
