import { describe, it, expect } from 'vitest';
import { rssiToDistance, computeMDS, procrustes, blendPositions } from './rssi';

describe('rssiToDistance', () => {
  it('computes distance using path loss model', () => {
    // At reference distance: rssi === rssi0 → distance = d0
    expect(rssiToDistance(-40, -40, 100, 2)).toBeCloseTo(100);
  });

  it('returns larger distance for weaker signal (lower RSSI)', () => {
    const d1 = rssiToDistance(-50, -40, 100, 2);
    const d2 = rssiToDistance(-60, -40, 100, 2);
    expect(d1).toBeGreaterThan(100);
    expect(d2).toBeGreaterThan(d1);
  });

  it('returns smaller distance for stronger signal (higher RSSI)', () => {
    const d = rssiToDistance(-30, -40, 100, 2);
    expect(d).toBeLessThan(100);
  });

  it('always returns positive distance', () => {
    expect(rssiToDistance(-80, -40, 100, 2)).toBeGreaterThan(0);
    expect(rssiToDistance(-10, -40, 100, 2)).toBeGreaterThan(0);
    expect(rssiToDistance(0, -40, 100, 2)).toBeGreaterThan(0);
  });

  it('follows the formula: d0 * 10^((rssi0 - rssi) / (10*n))', () => {
    // rssi0=-40, rssi=-60, d0=100, n=2 → 100 * 10^(20/20) = 100 * 10 = 1000
    expect(rssiToDistance(-60, -40, 100, 2)).toBeCloseTo(1000);
  });
});

describe('computeMDS', () => {
  it('returns empty array for empty matrix', () => {
    expect(computeMDS([])).toEqual([]);
  });

  it('returns origin for single point', () => {
    expect(computeMDS([[0]])).toEqual([{ x: 0, y: 0 }]);
  });

  it('places two points along x-axis at correct distance', () => {
    const dist = 5;
    const result = computeMDS([[0, dist], [dist, 0]]);
    expect(result).toHaveLength(2);
    // Points should be ~5 apart
    const dx = result[0].x - result[1].x;
    const dy = result[0].y - result[1].y;
    const computedDist = Math.sqrt(dx * dx + dy * dy);
    expect(computedDist).toBeCloseTo(dist, 1);
  });

  it('preserves relative distances for a triangle', () => {
    // Equilateral triangle with side 10
    const matrix = [
      [0, 10, 10],
      [10, 0, 10],
      [10, 10, 0],
    ];
    const result = computeMDS(matrix);
    expect(result).toHaveLength(3);

    // All pairwise distances should be approximately equal
    const d01 = Math.sqrt((result[0].x - result[1].x) ** 2 + (result[0].y - result[1].y) ** 2);
    const d02 = Math.sqrt((result[0].x - result[2].x) ** 2 + (result[0].y - result[2].y) ** 2);
    const d12 = Math.sqrt((result[1].x - result[2].x) ** 2 + (result[1].y - result[2].y) ** 2);

    expect(d01).toBeCloseTo(10, 0);
    expect(d02).toBeCloseTo(10, 0);
    expect(d12).toBeCloseTo(10, 0);
  });

  it('preserves rank ordering of distances', () => {
    // A is closer to B (3) than to C (5)
    const matrix = [
      [0, 3, 5],
      [3, 0, 4],
      [5, 4, 0],
    ];
    const result = computeMDS(matrix);

    const dAB = Math.sqrt((result[0].x - result[1].x) ** 2 + (result[0].y - result[1].y) ** 2);
    const dAC = Math.sqrt((result[0].x - result[2].x) ** 2 + (result[0].y - result[2].y) ** 2);

    expect(dAB).toBeLessThan(dAC);
  });
});

describe('procrustes', () => {
  it('returns empty array for empty input', () => {
    expect(procrustes([], [])).toEqual([]);
  });

  it('translates single point to reference', () => {
    const result = procrustes([{ x: 5, y: 5 }], [{ x: 10, y: 20 }]);
    expect(result[0].x).toBeCloseTo(10);
    expect(result[0].y).toBeCloseTo(20);
  });

  it('aligns translated point set', () => {
    // MDS points at (0,0), (1,0), (0,1)
    // Reference at (10,10), (11,10), (10,11) — just translated
    const mds = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    const ref = [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 11 }];

    const result = procrustes(mds, ref);

    expect(result[0].x).toBeCloseTo(10, 1);
    expect(result[0].y).toBeCloseTo(10, 1);
    expect(result[1].x).toBeCloseTo(11, 1);
    expect(result[1].y).toBeCloseTo(10, 1);
    expect(result[2].x).toBeCloseTo(10, 1);
    expect(result[2].y).toBeCloseTo(11, 1);
  });

  it('preserves pairwise distance ratios (similarity transform)', () => {
    // MDS points form a right triangle at (0,0), (3,0), (0,4)
    // Reference is scaled by 2: (0,0), (6,0), (0,8)
    const mds = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }];
    const ref = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 8 }];

    const result = procrustes(mds, ref);

    // Compute pairwise distances in result
    const d01 = Math.sqrt((result[0].x - result[1].x) ** 2 + (result[0].y - result[1].y) ** 2);
    const d02 = Math.sqrt((result[0].x - result[2].x) ** 2 + (result[0].y - result[2].y) ** 2);
    const d12 = Math.sqrt((result[1].x - result[2].x) ** 2 + (result[1].y - result[2].y) ** 2);

    // Ratios should match reference: d01/d02 = 6/8 = 0.75
    expect(d01 / d02).toBeCloseTo(6 / 8, 1);
    // d01/d12 = 6/10 = 0.6
    expect(d01 / d12).toBeCloseTo(6 / 10, 1);
  });
});

describe('blendPositions', () => {
  it('returns QR position when weight is 0 (no measurements)', () => {
    const result = blendPositions({ x: 10, y: 20 }, { x: 50, y: 60 }, 0, 10, 0.3);
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(20);
  });

  it('applies correct weight formula', () => {
    // measurementCount=5, totalNodes=10, weightCap=0.3
    // weight = min(0.3, 5/10 * 0.5) = min(0.3, 0.25) = 0.25
    const posQr = { x: 0, y: 0 };
    const posMds = { x: 100, y: 100 };
    const result = blendPositions(posQr, posMds, 5, 10, 0.3);
    expect(result.x).toBeCloseTo(25);
    expect(result.y).toBeCloseTo(25);
  });

  it('caps weight at weightCap', () => {
    // measurementCount=20, totalNodes=10, weightCap=0.3
    // weight = min(0.3, 20/10 * 0.5) = min(0.3, 1.0) = 0.3
    const posQr = { x: 0, y: 0 };
    const posMds = { x: 100, y: 100 };
    const result = blendPositions(posQr, posMds, 20, 10, 0.3);
    expect(result.x).toBeCloseTo(30);
    expect(result.y).toBeCloseTo(30);
  });

  it('produces weighted average between QR and MDS', () => {
    const posQr = { x: 10, y: 20 };
    const posMds = { x: 30, y: 40 };
    // weight = min(0.5, 4/8 * 0.5) = min(0.5, 0.25) = 0.25
    const result = blendPositions(posQr, posMds, 4, 8, 0.5);
    expect(result.x).toBeCloseTo(10 * 0.75 + 30 * 0.25);
    expect(result.y).toBeCloseTo(20 * 0.75 + 40 * 0.25);
  });
});
