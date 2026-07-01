import { describe, it, expect } from 'vitest';
import {
  computeDistance,
  computeBearing,
  computePosition,
  solvePnP,
  averageTagPositions,
  computeConfidence,
} from './ranging';

describe('ranging', () => {
  describe('computeDistance', () => {
    it('computes distance using pinhole model formula', () => {
      // focalPx * qrSizeCm / qrPixelWidth
      expect(computeDistance(500, 10, 50)).toBe(100);
      expect(computeDistance(1000, 5, 25)).toBe(200);
    });

    it('returns larger distance for smaller pixel width (farther away)', () => {
      const d1 = computeDistance(500, 10, 100); // close
      const d2 = computeDistance(500, 10, 50);  // far
      expect(d2).toBeGreaterThan(d1);
    });
  });

  describe('computeBearing', () => {
    it('computes bearing from pixel offset and gyro alpha', () => {
      // Math.atan2(offsetPx, focalPx) + gyroAlpha
      const result = computeBearing(0, 500, 0);
      expect(result).toBe(0); // no offset, no gyro = 0 bearing
    });

    it('adds gyro alpha to the computed angle', () => {
      const result = computeBearing(0, 500, Math.PI / 4);
      expect(result).toBeCloseTo(Math.PI / 4);
    });
  });

  describe('computePosition', () => {
    it('computes position from anchor using polar coordinates', () => {
      const anchor = { x: 0, y: 0 };
      const pos = computePosition(anchor, 100, 0);
      // bearing=0: sin(0)=0, cos(0)=1 → x=0, y=100
      expect(pos.x).toBeCloseTo(0);
      expect(pos.y).toBeCloseTo(100);
    });

    it('computes position at 90 degrees bearing', () => {
      const anchor = { x: 10, y: 20 };
      const pos = computePosition(anchor, 50, Math.PI / 2);
      // sin(π/2)=1, cos(π/2)=0 → x=10+50, y=20+0
      expect(pos.x).toBeCloseTo(60);
      expect(pos.y).toBeCloseTo(20);
    });
  });

  describe('solvePnP', () => {
    it('returns {0,0} for empty detections', () => {
      const result = solvePnP([], []);
      expect(result).toEqual({ x: 0, y: 0 });
    });

    it('computes position from tag detections and known positions', () => {
      const detections = [
        {
          tagId: 1,
          corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] as [any, any, any, any],
          pose: { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [5, 10, 0] },
        },
      ];
      const tagPositions = [{ x: 100, y: 200 }];
      const result = solvePnP(detections, tagPositions);
      // knownPos + translation: (100+5, 200+10) = (105, 210)
      expect(result.x).toBeCloseTo(105);
      expect(result.y).toBeCloseTo(210);
    });

    it('averages positions from multiple detections', () => {
      const detections = [
        {
          tagId: 1,
          corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] as [any, any, any, any],
          pose: { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [0, 0, 0] },
        },
        {
          tagId: 2,
          corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] as [any, any, any, any],
          pose: { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [10, 20, 0] },
        },
      ];
      const tagPositions = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
      const result = solvePnP(detections, tagPositions);
      // avg of (0,0) and (10,20) = (5, 10)
      expect(result.x).toBeCloseTo(5);
      expect(result.y).toBeCloseTo(10);
    });
  });

  describe('averageTagPositions', () => {
    it('returns {0,0} for empty array', () => {
      expect(averageTagPositions([])).toEqual({ x: 0, y: 0 });
    });

    it('returns the single position for one element', () => {
      expect(averageTagPositions([{ x: 5, y: 10 }])).toEqual({ x: 5, y: 10 });
    });

    it('computes centroid of multiple positions', () => {
      const positions = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }];
      const result = averageTagPositions(positions);
      expect(result.x).toBeCloseTo(10 / 3);
      expect(result.y).toBeCloseTo(10 / 3);
    });
  });

  describe('computeConfidence', () => {
    it('computes base confidence with no tags, no tilt, no proximity', () => {
      const result = computeConfidence({ tagCount: 0, tiltAngle: 0, proximityFactor: 0 });
      expect(result).toBeCloseTo(0.4);
    });

    it('increases with more tags', () => {
      const result = computeConfidence({ tagCount: 4, tiltAngle: 0, proximityFactor: 0 });
      // 0.4 + 0.15 * 4 = 1.0
      expect(result).toBeCloseTo(1.0);
    });

    it('decreases with tilt angle', () => {
      const result = computeConfidence({ tagCount: 2, tiltAngle: Math.PI, proximityFactor: 0 });
      // 0.4 + 0.15*2 - (π/π * 0.3) + 0 = 0.4 + 0.3 - 0.3 = 0.4
      expect(result).toBeCloseTo(0.4);
    });

    it('increases with proximity factor', () => {
      const result = computeConfidence({ tagCount: 0, tiltAngle: 0, proximityFactor: 1 });
      // 0.4 + 0 - 0 + 1 * 0.2 = 0.6
      expect(result).toBeCloseTo(0.6);
    });

    it('clamps to 0 when result would be negative', () => {
      const result = computeConfidence({ tagCount: 0, tiltAngle: Math.PI * 3, proximityFactor: 0 });
      // 0.4 + 0 - (3π/π * 0.3) + 0 = 0.4 - 0.9 = -0.5 → clamped to 0
      expect(result).toBe(0);
    });

    it('clamps to 1 when result would exceed 1', () => {
      const result = computeConfidence({ tagCount: 10, tiltAngle: 0, proximityFactor: 1 });
      // 0.4 + 0.15*10 - 0 + 0.2 = 0.4 + 1.5 + 0.2 = 2.1 → clamped to 1
      expect(result).toBe(1);
    });
  });
});
