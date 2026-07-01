import { useState, useEffect, useCallback } from 'react';
import { WsMessageType } from '@argus/shared';
import type { WsEnvelope, RssiResult, RssiMeasurement } from '@argus/shared';
import type { WsClient } from '../services/ws-client';

export interface RssiProps {
  nodeId: string;
  wsClient: WsClient;
  config: { rssi0: number; d0: number; n: number };
}

type RssiState = 'idle' | 'scanning' | 'unavailable' | 'complete';

/**
 * Converts an RSSI value to distance using the log-distance path loss model.
 * Formula: d0 * 10^((rssi0 - rssi) / (10 * n))
 */
function rssiToDistance(rssi: number, rssi0: number, d0: number, n: number): number {
  return d0 * Math.pow(10, (rssi0 - rssi) / (10 * n));
}

/**
 * Checks if Web Bluetooth API is available in the current browser.
 */
function isBleAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Rssi component — performs BLE RSSI scanning to measure distances to nearby
 * ARGUS nodes, then reports results to the server via WebSocket.
 *
 * If Web Bluetooth is unavailable (e.g., iOS Safari), reports empty measurements
 * and notifies the user that only camera-based mesh is available.
 *
 * Requirements: 4.1, 4.2, 4.5, 12.3
 */
export function Rssi({ nodeId, wsClient, config }: RssiProps) {
  const [state, setState] = useState<RssiState>('idle');
  const [measurements, setMeasurements] = useState<RssiMeasurement[]>([]);
  const [notification, setNotification] = useState<string | null>(null);

  const sendResult = useCallback(
    (rssiMeasurements: RssiMeasurement[]) => {
      const result: RssiResult = {
        fromNodeId: nodeId,
        measurements: rssiMeasurements,
      };

      const envelope: WsEnvelope<RssiResult> = {
        type: WsMessageType.RSSI_RESULT,
        sessionId: nodeId,
        ts: Date.now(),
        payload: result,
      };

      wsClient.send(envelope);
      setState('complete');
    },
    [nodeId, wsClient]
  );

  const performScan = useCallback(async () => {
    setState('scanning');
    const collected: RssiMeasurement[] = [];

    try {
      // Request BLE device scan — the Web Bluetooth API requestDevice triggers
      // a scan that we can use to discover nearby ARGUS nodes
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [],
      });

      // Attempt to get RSSI from the advertisement data via a scan
      // In practice, we use requestLEScan if available, with a 5s timeout
      if (navigator.bluetooth.requestLEScan) {
        const scan = await navigator.bluetooth.requestLEScan({ acceptAllAdvertisements: true });

        // Listen for advertisement events for 5 seconds
        const scanTimeout = setTimeout(() => {
          scan.stop();
          setMeasurements(collected);
          sendResult(collected);
        }, 5000);

        navigator.bluetooth.addEventListener('advertisementreceived', (event) => {
          if (event.rssi != null) {
            const distance = rssiToDistance(event.rssi, config.rssi0, config.d0, config.n);
            collected.push({
              toNodeId: event.device.id,
              rssi: event.rssi,
              distance,
            });
            setMeasurements([...collected]);
          }
        });

        // Cleanup on early exit
        return () => {
          clearTimeout(scanTimeout);
          scan.stop();
        };
      }

      // Fallback: if requestLEScan is not available, use the single device connection
      // to at least get one RSSI reading
      if (device && device.gatt) {
        const server = await device.gatt.connect();
        // In Web Bluetooth, RSSI is typically only available during scanning.
        // If we connected but can't get RSSI, send what we have
        server.disconnect();
      }

      // Send collected measurements (may be empty if only requestDevice was used)
      setMeasurements(collected);
      sendResult(collected);
    } catch {
      // Scan was cancelled or failed — send whatever we collected
      setMeasurements(collected);
      sendResult(collected);
    }
  }, [config, sendResult]);

  useEffect(() => {
    if (!isBleAvailable()) {
      // BLE unavailable — report empty measurements and notify user
      setState('unavailable');
      setNotification('BLE unavailable — camera-only mesh');
      sendResult([]);
      return;
    }

    // BLE is available — start scanning
    performScan();
  }, [performScan, sendResult]);

  // BLE unavailable notification
  if (state === 'unavailable') {
    return (
      <div className="rssi rssi--unavailable">
        <div className="rssi__message">
          <h2>Bluetooth Unavailable</h2>
          {notification && <p className="rssi__notification">{notification}</p>}
          <p>Mesh contribution will use camera-only ranging.</p>
        </div>
      </div>
    );
  }

  // Scanning in progress
  if (state === 'scanning') {
    return (
      <div className="rssi rssi--scanning">
        <div className="rssi__message">
          <h2>Scanning for Nearby Nodes</h2>
          <div className="rssi__progress" aria-label="BLE scan in progress">
            <div className="rssi__spinner" />
            <p>Collecting RSSI measurements...</p>
          </div>
          {measurements.length > 0 && (
            <p className="rssi__count">
              Found {measurements.length} measurement{measurements.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Scan complete
  if (state === 'complete') {
    return (
      <div className="rssi rssi--complete">
        <div className="rssi__message">
          <h2>RSSI Scan Complete</h2>
          <p>
            {measurements.length > 0
              ? `Collected ${measurements.length} measurement${measurements.length !== 1 ? 's' : ''}`
              : 'No nearby nodes detected'}
          </p>
        </div>
      </div>
    );
  }

  // Idle / initial state
  return (
    <div className="rssi rssi--idle">
      <div className="rssi__message">
        <h2>RSSI Probe</h2>
        <p>Preparing Bluetooth scan...</p>
      </div>
    </div>
  );
}

export default Rssi;
