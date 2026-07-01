import type { Vec2, AprilTagDetection } from '@argus/shared';

/**
 * Clamp a value between min and max (inclusive).
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pinhole model distance estimation.
 * Computes distance from the camera to a QR code based on known physical size
 * and observed pixel width.
 *
 * @param focalPx - Focal length in pixels
 * @param qrSizeCm - Physical QR code size in centimeters
 * @param qrPixelWidth - Observed QR code width in pixels
 * @returns Estimated distance in centimeters
 */
export function computeDistance(focalPx: number, qrSizeCm: number, qrPixelWidth: number): number {
  return focalPx * qrSizeCm / qrPixelWidth;
}

/**
 * Bearing from gyroscope alpha + QR pixel offset.
 * Combines the angular offset of the QR code in the image with the device's
 * gyroscope heading to produce an absolute bearing.
 *
 * @param offsetPx - Horizontal pixel offset of QR center from image center
 * @param focalPx - Focal length in pixels
 * @param gyroAlpha - Device gyroscope alpha heading in radians
 * @returns Bearing angle in radians
 */
export function computeBearing(offsetPx: number, focalPx: number, gyroAlpha: number): number {
  return Math.atan2(offsetPx, focalPx) + gyroAlpha;
}

/**
 * Position from anchor + polar coordinates.
 * Computes an absolute position given a known anchor point, distance, and bearing.
 *
 * @param anchor - Known position of the detected QR/tag anchor
 * @param distance - Distance from the anchor in centimeters
 * @param bearing - Bearing angle in radians
 * @returns Computed 2D position
 */
export function computePosition(anchor: Vec2, distance: number, bearing: number): Vec2 {
  return {
    x: anchor.x + distance * Math.sin(bearing),
    y: anchor.y + distance * Math.cos(bearing),
  };
}

/**
 * Simplified DLT-based pose estimation from AprilTag detections.
 * Takes detected tag corners and known tag positions, returns estimated position
 * as the average of positions computed from each tag's known position and its
 * detected pose (translation component).
 *
 * @param detections - Array of AprilTag detections with pose information
 * @param tagPositions - Array of known 2D positions for the detected tags
 * @returns Estimated position as Vec2
 */
export function solvePnP(detections: AprilTagDetection[], tagPositions: Vec2[]): Vec2 {
  if (detections.length === 0) {
    return { x: 0, y: 0 };
  }

  const positions: Vec2[] = detections.map((detection, i) => {
    const knownPos = tagPositions[i] ?? { x: 0, y: 0 };
    const tx = detection.pose.translation[0] ?? 0;
    const ty = detection.pose.translation[1] ?? 0;
    return {
      x: knownPos.x + tx,
      y: knownPos.y + ty,
    };
  });

  return averageTagPositions(positions);
}

/**
 * Multi-tag average position.
 * Computes the centroid of a set of 2D positions.
 *
 * @param positions - Array of Vec2 positions to average
 * @returns Averaged (centroid) position
 */
export function averageTagPositions(positions: Vec2[]): Vec2 {
  if (positions.length === 0) {
    return { x: 0, y: 0 };
  }

  const sum = positions.reduce(
    (acc, pos) => ({ x: acc.x + pos.x, y: acc.y + pos.y }),
    { x: 0, y: 0 },
  );

  return {
    x: sum.x / positions.length,
    y: sum.y / positions.length,
  };
}

/**
 * Confidence scoring for ranging measurements.
 * Combines tag count, tilt angle, and proximity factor into a single
 * confidence score clamped to [0, 1].
 *
 * - tiltPenalty = tiltAngle / Math.PI * 0.3
 * - proximityBonus = proximityFactor * 0.2
 * - Result = clamp(0.4 + 0.15 * tagCount - tiltPenalty + proximityBonus, 0, 1)
 *
 * @param params - Object with tagCount, tiltAngle, and proximityFactor
 * @returns Confidence score between 0.0 and 1.0
 */
export function computeConfidence(params: {
  tagCount: number;
  tiltAngle: number;
  proximityFactor: number;
}): number {
  const { tagCount, tiltAngle, proximityFactor } = params;
  const tiltPenalty = tiltAngle / Math.PI * 0.3;
  const proximityBonus = proximityFactor * 0.2;
  return clamp(0.4 + 0.15 * tagCount - tiltPenalty + proximityBonus, 0, 1);
}
