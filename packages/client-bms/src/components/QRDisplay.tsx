import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface QRDisplayProps {
  nodeCount: number;
  registrationUrl?: string;
}

/**
 * QR code display component shown during REGISTER phase.
 * Renders a real scannable QR code encoding the registration URL (argus:// protocol).
 * The QR code links edge devices to the registration client.
 */
const QRDisplay: React.FC<QRDisplayProps> = ({ nodeCount, registrationUrl }) => {
  // The QR code encodes the direct HTTPS URL — when scanned, opens the registration page in the browser
  const qrValue = registrationUrl || 'https://dcaloltnto1d8.cloudfront.net';

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      aria-label={`QR code for registration. ${nodeCount} nodes registered.`}
    >
      {/* QR Code */}
      <div
        style={{
          position: 'relative',
          padding: '16px',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          border: '2px solid #00FF9C',
          boxShadow: '0 0 20px rgba(0, 255, 156, 0.3)',
        }}
      >
        <QRCodeSVG
          value={qrValue}
          size={200}
          bgColor="#FFFFFF"
          fgColor="#050D1A"
          level="M"
          includeMargin={false}
        />

        {/* Node count badge overlay */}
        <div
          style={{
            position: 'absolute',
            top: '-12px',
            right: '-12px',
            backgroundColor: '#00FF9C',
            color: '#050D1A',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 'bold',
            fontSize: '16px',
            boxShadow: '0 0 12px rgba(0, 255, 156, 0.6)',
          }}
          aria-label={`${nodeCount} nodes registered`}
        >
          {nodeCount}
        </div>
      </div>

      {/* Label */}
      <div
        style={{
          marginTop: '16px',
          color: '#00BFFF',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '12px',
          textAlign: 'center',
          textTransform: 'uppercase',
          letterSpacing: '2px',
        }}
      >
        Scan to Register
      </div>

      {registrationUrl && (
        <div
          style={{
            marginTop: '6px',
            color: '#00FF9C80',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '10px',
            textAlign: 'center',
            maxWidth: '240px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {registrationUrl}
        </div>
      )}
    </div>
  );
};

export default QRDisplay;
