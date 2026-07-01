import type { DeviceCapabilities } from '@argus/shared';

export interface SensorStatus {
  camera: 'available' | 'denied' | 'unavailable';
  ble: 'available' | 'unavailable';
  gyroscope: 'available' | 'denied' | 'unavailable';
}

export type FallbackMode = 'full' | 'qr-only' | 'camera-only' | 'passive';

/**
 * Detect all sensor capabilities on the current device.
 * Checks camera (via navigator.mediaDevices), BLE (via navigator.bluetooth),
 * and gyroscope (via DeviceOrientationEvent).
 */
export async function detectSensors(): Promise<SensorStatus> {
  const [camera, ble, gyroscope] = await Promise.all([
    detectCamera(),
    detectBle(),
    detectGyroscope(),
  ]);

  return { camera, ble, gyroscope };
}

/**
 * Request iOS DeviceOrientationEvent permission explicitly.
 * On iOS Safari 13+, DeviceOrientationEvent.requestPermission() must be called
 * from a user gesture handler. Returns true if permission is granted.
 */
export async function requestGyroscopePermission(): Promise<boolean> {
  const DeviceOrientationEventAny = DeviceOrientationEvent as any;

  if (typeof DeviceOrientationEventAny.requestPermission !== 'function') {
    // Not iOS Safari or permission not required — gyro available without prompt
    return true;
  }

  try {
    const result = await DeviceOrientationEventAny.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

/**
 * Determine the fallback mode based on sensor status.
 *
 * Fallback chain:
 *   - All available → 'full'
 *   - Camera available, no gyro → 'qr-only' (QR distance without bearing)
 *   - Camera available, no BLE → 'camera-only' (still has gyro for bearing)
 *   - No camera → 'passive' (video capture only, no ranging)
 */
export function determineFallbackMode(status: SensorStatus): FallbackMode {
  const cameraOk = status.camera === 'available';
  const bleOk = status.ble === 'available';
  const gyroOk = status.gyroscope === 'available';

  if (!cameraOk) {
    return 'passive';
  }

  if (cameraOk && gyroOk && bleOk) {
    return 'full';
  }

  if (cameraOk && !gyroOk) {
    return 'qr-only';
  }

  if (cameraOk && !bleOk) {
    return 'camera-only';
  }

  return 'full';
}

/**
 * Convert SensorStatus to DeviceCapabilities for server registration.
 */
export function toDeviceCapabilities(status: SensorStatus): DeviceCapabilities {
  return {
    camera: status.camera === 'available',
    ble: status.ble === 'available',
    gyroscope: status.gyroscope === 'available',
  };
}

// --- Internal detection helpers ---

async function detectCamera(): Promise<'available' | 'denied' | 'unavailable'> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'unavailable';
  }

  try {
    // Query permissions without prompting if Permissions API is available
    if (navigator.permissions) {
      try {
        const permissionStatus = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        });

        if (permissionStatus.state === 'denied') {
          return 'denied';
        }
        if (permissionStatus.state === 'granted') {
          return 'available';
        }
        // 'prompt' state — camera hardware exists but not yet granted
        return 'available';
      } catch {
        // Permissions API may not support 'camera' query on all browsers
      }
    }

    // Fallback: enumerate devices to check camera presence
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCamera = devices.some((d) => d.kind === 'videoinput');
    return hasCamera ? 'available' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

function detectBle(): 'available' | 'unavailable' {
  // Web Bluetooth API availability check
  if (navigator.bluetooth) {
    return 'available';
  }
  return 'unavailable';
}

async function detectGyroscope(): Promise<'available' | 'denied' | 'unavailable'> {
  const DeviceOrientationEventAny = DeviceOrientationEvent as any;

  // Check if DeviceOrientationEvent exists at all
  if (typeof DeviceOrientationEvent === 'undefined') {
    return 'unavailable';
  }

  // iOS Safari requires explicit permission
  if (typeof DeviceOrientationEventAny.requestPermission === 'function') {
    // Permission has not been requested yet — we report it as available
    // since the user hasn't denied it. Actual permission will be requested
    // via requestGyroscopePermission() before MESH phase.
    return 'available';
  }

  // Non-iOS browsers: check if the event fires by testing with a short timeout
  // For detection purposes, if the API exists we consider it available
  if ('DeviceOrientationEvent' in window) {
    return 'available';
  }

  return 'unavailable';
}
