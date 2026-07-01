import type { Vec2 } from '@argus/shared';

/**
 * Convert RSSI measurement to distance using the log-distance path loss model.
 *
 * @param rssi - Measured RSSI value (dBm)
 * @param rssi0 - Reference RSSI at distance d0 (dBm)
 * @param d0 - Reference distance (cm)
 * @param n - Path loss exponent (environment-dependent)
 * @returns Estimated distance in cm
 */
export function rssiToDistance(rssi: number, rssi0: number, d0: number, n: number): number {
  return d0 * Math.pow(10, (rssi0 - rssi) / (10 * n));
}

/**
 * Classical Multi-Dimensional Scaling (MDS).
 * Computes 2D positions from a pairwise distance matrix using double-centering
 * and eigendecomposition (Jacobi iteration).
 *
 * @param distanceMatrix - Symmetric NxN matrix of pairwise distances
 * @returns Array of Vec2 positions for each node
 */
export function computeMDS(distanceMatrix: number[][]): Vec2[] {
  const n = distanceMatrix.length;

  if (n === 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];

  // Step 1: Square the distance matrix → D²
  const D2: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => distanceMatrix[i][j] * distanceMatrix[i][j])
  );

  // Step 2: Double-centering → B = -0.5 * J * D² * J
  // where J = I - (1/n) * 11'
  // B[i][j] = -0.5 * (D²[i][j] - rowMean[i] - colMean[j] + grandMean)
  const rowMeans: number[] = new Array(n);
  const colMeans: number[] = new Array(n);
  let grandMean = 0;

  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) {
      sum += D2[i][j];
    }
    rowMeans[i] = sum / n;
  }

  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += D2[i][j];
    }
    colMeans[j] = sum / n;
  }

  for (let i = 0; i < n; i++) {
    grandMean += rowMeans[i];
  }
  grandMean /= n;

  const B: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      -0.5 * (D2[i][j] - rowMeans[i] - colMeans[j] + grandMean)
    )
  );

  // Step 3: Eigendecomposition of B using Jacobi iteration
  const { eigenvalues, eigenvectors } = jacobiEigen(B);

  // Step 4: Sort eigenvalues descending, take top 2 positive ones
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => eigenvalues[b] - eigenvalues[a]);

  const topIndices: number[] = [];
  for (const idx of indices) {
    if (eigenvalues[idx] > 1e-10) {
      topIndices.push(idx);
      if (topIndices.length === 2) break;
    }
  }

  // Step 5: Coordinates = eigenvectors * sqrt(eigenvalues)
  const positions: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const x = topIndices.length >= 1
      ? eigenvectors[i][topIndices[0]] * Math.sqrt(eigenvalues[topIndices[0]])
      : 0;
    const y = topIndices.length >= 2
      ? eigenvectors[i][topIndices[1]] * Math.sqrt(eigenvalues[topIndices[1]])
      : 0;
    positions.push({ x, y });
  }

  return positions;
}

/**
 * Jacobi eigendecomposition for a real symmetric matrix.
 * Iteratively applies Givens rotations to diagonalize the matrix.
 */
function jacobiEigen(matrix: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = matrix.length;
  const maxIterations = 100 * n * n;
  const tolerance = 1e-12;

  // Work on a copy
  const A: number[][] = matrix.map(row => [...row]);

  // Initialize eigenvector matrix to identity
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let iter = 0; iter < maxIterations; iter++) {
    // Find largest off-diagonal element
    let maxVal = 0;
    let p = 0;
    let q = 1;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const absVal = Math.abs(A[i][j]);
        if (absVal > maxVal) {
          maxVal = absVal;
          p = i;
          q = j;
        }
      }
    }

    // Check convergence
    if (maxVal < tolerance) break;

    // Compute rotation angle
    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];

    let theta: number;
    if (Math.abs(app - aqq) < tolerance) {
      theta = Math.PI / 4;
    } else {
      theta = 0.5 * Math.atan2(2 * apq, app - aqq);
    }

    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Apply Givens rotation to A
    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const aip = A[i][p];
        const aiq = A[i][q];
        A[i][p] = c * aip + s * aiq;
        A[p][i] = A[i][p];
        A[i][q] = -s * aip + c * aiq;
        A[q][i] = A[i][q];
      }
    }

    const newApp = c * c * app + 2 * s * c * apq + s * s * aqq;
    const newAqq = s * s * app - 2 * s * c * apq + c * c * aqq;
    A[p][p] = newApp;
    A[q][q] = newAqq;
    A[p][q] = 0;
    A[q][p] = 0;

    // Update eigenvector matrix
    for (let i = 0; i < n; i++) {
      const vip = V[i][p];
      const viq = V[i][q];
      V[i][p] = c * vip + s * viq;
      V[i][q] = -s * vip + c * viq;
    }
  }

  const eigenvalues = Array.from({ length: n }, (_, i) => A[i][i]);
  return { eigenvalues, eigenvectors: V };
}

/**
 * Procrustes alignment: aligns MDS positions to reference coordinates
 * using translation + rotation + uniform scale.
 *
 * @param mdsPositions - Positions from MDS computation
 * @param referencePositions - Known reference coordinates (from camera-based ranging)
 * @returns Aligned positions transformed to match reference coordinate system
 */
export function procrustes(mdsPositions: Vec2[], referencePositions: Vec2[]): Vec2[] {
  const n = mdsPositions.length;

  if (n === 0) return [];
  if (n === 1) {
    // Single point: just translate to reference
    return [{ x: referencePositions[0].x, y: referencePositions[0].y }];
  }

  // Step 1: Center both point sets (subtract mean)
  const mdsCentroid = computeCentroid(mdsPositions);
  const refCentroid = computeCentroid(referencePositions);

  const X: Vec2[] = mdsPositions.map(p => ({
    x: p.x - mdsCentroid.x,
    y: p.y - mdsCentroid.y,
  }));

  const Y: Vec2[] = referencePositions.map(p => ({
    x: p.x - refCentroid.x,
    y: p.y - refCentroid.y,
  }));

  // Step 2: Compute cross-covariance matrix H = X^T * Y (2x2)
  // H[0][0] = sum(Xi.x * Yi.x), H[0][1] = sum(Xi.x * Yi.y)
  // H[1][0] = sum(Xi.y * Yi.x), H[1][1] = sum(Xi.y * Yi.y)
  let h00 = 0, h01 = 0, h10 = 0, h11 = 0;
  for (let i = 0; i < n; i++) {
    h00 += X[i].x * Y[i].x;
    h01 += X[i].x * Y[i].y;
    h10 += X[i].y * Y[i].x;
    h11 += X[i].y * Y[i].y;
  }

  // Step 3: SVD of 2x2 matrix H to get rotation R
  const { U, S, Vt } = svd2x2(h00, h01, h10, h11);

  // Compute R = V * U^T (ensure proper rotation, det(R) = 1)
  // V = Vt^T
  const v00 = Vt[0][0], v01 = Vt[1][0];
  const v10 = Vt[0][1], v11 = Vt[1][1];

  // U^T
  const ut00 = U[0][0], ut01 = U[1][0];
  const ut10 = U[0][1], ut11 = U[1][1];

  // R = V * U^T
  let r00 = v00 * ut00 + v01 * ut10;
  let r01 = v00 * ut01 + v01 * ut11;
  let r10 = v10 * ut00 + v11 * ut10;
  let r11 = v10 * ut01 + v11 * ut11;

  // Ensure proper rotation (det(R) = 1)
  const det = r00 * r11 - r01 * r10;
  if (det < 0) {
    // Flip sign of last column of V
    r00 = -v01 * ut10 + v00 * ut00;
    r01 = -v01 * ut11 + v00 * ut01;
    r10 = -v11 * ut10 + v10 * ut00;
    r11 = -v11 * ut11 + v10 * ut01;
    // Recalculate with flipped V
    const fv00 = v00, fv01 = -v01;
    const fv10 = v10, fv11 = -v11;
    r00 = fv00 * ut00 + fv01 * ut10;
    r01 = fv00 * ut01 + fv01 * ut11;
    r10 = fv10 * ut00 + fv11 * ut10;
    r11 = fv10 * ut01 + fv11 * ut11;
  }

  // Step 4: Compute optimal scale s = trace(R*H) / trace(X^T*X)
  // trace(R*H) = sum of S values (singular values used by the rotation)
  const traceRH = r00 * h00 + r01 * h10 + r10 * h01 + r11 * h11;

  let traceXtX = 0;
  for (let i = 0; i < n; i++) {
    traceXtX += X[i].x * X[i].x + X[i].y * X[i].y;
  }

  const scale = traceXtX > 1e-14 ? traceRH / traceXtX : 1;

  // Step 5: Apply transformation: result = scale * R * X_centered + reference_centroid
  const result: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const rx = scale * (r00 * X[i].x + r01 * X[i].y);
    const ry = scale * (r10 * X[i].x + r11 * X[i].y);
    result.push({
      x: rx + refCentroid.x,
      y: ry + refCentroid.y,
    });
  }

  return result;
}

/**
 * Compute centroid of a set of 2D points.
 */
function computeCentroid(points: Vec2[]): Vec2 {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / n, y: sy / n };
}

/**
 * 2x2 SVD: A = U * diag(S) * Vt
 * Implemented directly for the 2x2 case without external dependencies.
 */
function svd2x2(
  a00: number, a01: number, a10: number, a11: number
): { U: number[][]; S: number[]; Vt: number[][] } {
  // Compute A^T * A
  const ata00 = a00 * a00 + a10 * a10;
  const ata01 = a00 * a01 + a10 * a11;
  const ata10 = ata01; // symmetric
  const ata11 = a01 * a01 + a11 * a11;

  // Eigenvalues of A^T * A (symmetric 2x2)
  const sum = ata00 + ata11;
  const diff = ata00 - ata11;
  const disc = Math.sqrt(diff * diff + 4 * ata01 * ata01);
  const lambda1 = (sum + disc) / 2;
  const lambda2 = (sum - disc) / 2;

  const s1 = Math.sqrt(Math.max(0, lambda1));
  const s2 = Math.sqrt(Math.max(0, lambda2));

  // Eigenvectors of A^T * A give V
  let v00: number, v01: number, v10: number, v11: number;

  if (Math.abs(ata01) > 1e-14) {
    // First eigenvector for lambda1
    const ex = lambda1 - ata11;
    const ey = ata01;
    const eLen = Math.sqrt(ex * ex + ey * ey);
    v00 = ex / eLen;
    v10 = ey / eLen;
    // Second eigenvector (orthogonal)
    v01 = -v10;
    v11 = v00;
  } else {
    // Already diagonal
    if (ata00 >= ata11) {
      v00 = 1; v01 = 0; v10 = 0; v11 = 1;
    } else {
      v00 = 0; v01 = 1; v10 = 1; v11 = 0;
    }
  }

  // U = A * V * diag(1/S)
  let u00: number, u01: number, u10: number, u11: number;

  if (s1 > 1e-14) {
    u00 = (a00 * v00 + a01 * v10) / s1;
    u10 = (a10 * v00 + a11 * v10) / s1;
  } else {
    u00 = 1;
    u10 = 0;
  }

  if (s2 > 1e-14) {
    u01 = (a00 * v01 + a01 * v11) / s2;
    u11 = (a10 * v01 + a11 * v11) / s2;
  } else {
    // Orthogonal to first column of U
    u01 = -u10;
    u11 = u00;
  }

  return {
    U: [[u00, u01], [u10, u11]],
    S: [s1, s2],
    Vt: [[v00, v10], [v01, v11]],
  };
}

/**
 * Blended position: combines QR-based and MDS-based position estimates
 * using a weighted average with a configurable weight cap.
 *
 * @param posQr - Position from QR/camera-based ranging
 * @param posMds - Position from MDS computation
 * @param measurementCount - Number of RSSI measurements for this node
 * @param totalNodes - Total number of nodes in the mesh
 * @param weightCap - Maximum MDS weight (e.g., 0.3)
 * @returns Blended position
 */
export function blendPositions(
  posQr: Vec2,
  posMds: Vec2,
  measurementCount: number,
  totalNodes: number,
  weightCap: number
): Vec2 {
  const w = Math.min(weightCap, (measurementCount / totalNodes) * 0.5);
  return {
    x: (1 - w) * posQr.x + w * posMds.x,
    y: (1 - w) * posQr.y + w * posMds.y,
  };
}
