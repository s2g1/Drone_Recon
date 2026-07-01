import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { determineFallbackMode, toDeviceCapabilities, requestGyroscopePermission } from './capabilities';
import type { SensorStatus } from './capabilities';

describe('capabilities', () => {
  describe('determineFallbackMode', () => {
    it('returns "full" when all sensors are available', () => {
      const status: SensorStatus = {
        camera: 'available',
        ble: 'available',
        gyroscope: 'available',
      };
      expect(determineFallbackMode(status)).toBe('full');
    });

    it('returns "passive" when camera is denied', () => {
      const status: SensorStatus = {
        camera: 'denied',
        ble: 'available',
        gyroscope: 'available',
      };
      expect(determineFallbackMode(status)).toBe('passive');
    });

    it('returns "passive" when camera is unavailable', () => {
      const status: SensorStatus = {
        camera: 'unavailable',
        ble: 'available',
        gyroscope: 'available',
      };
      expect(determineFallbackMode(status)).toBe('passive');
    });

    it('returns "qr-only" when gyroscope is unavailable', () => {
      const status: SensorStatus = {
        camera: 'available',
        ble: 'available',
        gyroscope: 'unavailable',
      };
      expect(determineFallbackMode(status)).toBe('qr-only');
    });

    it('returns "qr-only" when gyroscope is denied', () => {
      const status: SensorStatus = {
        camera: 'available',
        ble: 'available',
        gyroscope: 'denied',
      };
      expect(determineFallbackMode(status)).toBe('qr-only');
    });

    it('returns "camera-only" when BLE is unavailable but gyro works', () => {
      const status: SensorStatus = {
        camera: 'available',
        ble: 'unavailable',
        gyroscope: 'available',
      };
      expect(determineFallbackMode(status)).toBe('camera-only');
    });

    it('returns "passive" when camera denied even if other sensors available', () => {
      const status: SensorStatus = {
        camera: 'denied',
        ble: 'unavailable',
        gyroscope: 'unavailable',
      };
      expect(determineFallbackMode(status)).toBe('passive');
    });

    it('returns "qr-only" when both BLE and gyroscope are unavailable but camera works', () => {
      const status: SensorStatus = {
        camera: 'available',
        ble: 'unavailable',
        gyroscope: 'unavailable',
      };
      expect(determineFallbackMode(status)).toBe('qr-only');
    });
  });

  describe('toDeviceCapabilities', () => {
    it('converts all available to all true', () => {
      const status: SensorStatus = {
        camera: 'available',
        ble: 'available',
        gyroscope: 'available',
      };
      expect(toDeviceCapabilities(status)).toEqual({
        camera: true,
        ble: true,
        gyroscope: true,
      });
    });

    it('converts unavailable/denied to false', () => {
      const status: SensorStatus = {
        camera: 'denied',
        ble: 'unavailable',
        gyroscope: 'denied',
      };
      expect(toDeviceCapabilities(status)).toEqual({
        camera: false,
        ble: false,
        gyroscope: false,
      });
    });

    it('converts mixed statuses correctly', () => {
      const status: SensorStatus = {
        camera: 'available',
        ble: 'unavailable',
        gyroscope: 'available',
      };
      expect(toDeviceCapabilities(status)).toEqual({
        camera: true,
        ble: false,
        gyroscope: true,
      });
    });
  });

  describe('requestGyroscopePermission', () => {
    let originalDeviceOrientationEvent: any;

    beforeEach(() => {
      originalDeviceOrientationEvent = (globalThis as any).DeviceOrientationEvent;
    });

    afterEach(() => {
      (globalThis as any).DeviceOrientationEvent = originalDeviceOrientationEvent;
    });

    it('returns true when requestPermission is not a function (non-iOS)', async () => {
      (globalThis as any).DeviceOrientationEvent = class {};
      const result = await requestGyroscopePermission();
      expect(result).toBe(true);
    });

    it('returns true when requestPermission resolves with "granted"', async () => {
      (globalThis as any).DeviceOrientationEvent = class {
        static requestPermission = vi.fn().mockResolvedValue('granted');
      };
      const result = await requestGyroscopePermission();
      expect(result).toBe(true);
    });

    it('returns false when requestPermission resolves with "denied"', async () => {
      (globalThis as any).DeviceOrientationEvent = class {
        static requestPermission = vi.fn().mockResolvedValue('denied');
      };
      const result = await requestGyroscopePermission();
      expect(result).toBe(false);
    });

    it('returns false when requestPermission throws', async () => {
      (globalThis as any).DeviceOrientationEvent = class {
        static requestPermission = vi.fn().mockRejectedValue(new Error('User dismissed'));
      };
      const result = await requestGyroscopePermission();
      expect(result).toBe(false);
    });
  });
});
