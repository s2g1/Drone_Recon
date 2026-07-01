# ARGUS System — Cost Analysis

## Version: 2.1
## Date: 2025-07-01

---

## 1. AWS Services Used

| Service | Purpose | Pricing Model |
|---------|---------|---------------|
| AWS Lambda | API backend (argus-register) | Per-request + duration |
| API Gateway (HTTP API) | HTTPS ingress, routing | Per-request |
| Amazon S3 | Static hosting, state storage, calibration images | Storage + requests |
| CloudFront | CDN for edge device SPA | Data transfer + requests |
| Amazon ECR | Container registry (created, unused) | Storage |
| AWS CodeBuild | CI/CD (attempted, unused) | Build minutes |
| IAM | Roles and policies | Free |

---

## 2. Monthly Cost Estimates

### Assumptions
- Each device registers once, calibrates (4 POST + images), deploys (1 RSSI POST)
- BMS polls every 2s during active sessions (~30 min avg session)
- Calibration images: ~50KB each (4 per device)
- S3 state files: <1KB each, read/written frequently

### Scale: 10 Devices (Demo/Dev)

| Service | Requests/mo | Cost |
|---------|-------------|------|
| Lambda | ~5,000 invocations | $0.01 |
| API Gateway | ~5,000 requests | $0.01 |
| S3 | 500 requests, 10MB storage | $0.01 |
| CloudFront | 1GB transfer | $0.09 |
| **Total** | | **~$0.12/mo** |

### Scale: 50 Devices (Team Demo)

| Service | Requests/mo | Cost |
|---------|-------------|------|
| Lambda | ~50,000 invocations | $0.05 |
| API Gateway | ~50,000 requests | $0.05 |
| S3 | 5,000 requests, 50MB storage | $0.03 |
| CloudFront | 5GB transfer | $0.43 |
| **Total** | | **~$0.56/mo** |

### Scale: 200 Devices (Production Demo)

| Service | Requests/mo | Cost |
|---------|-------------|------|
| Lambda | ~500,000 invocations | $0.10 |
| API Gateway | ~500,000 requests | $0.50 |
| S3 | 50,000 requests, 200MB storage | $0.10 |
| CloudFront | 20GB transfer | $1.70 |
| **Total** | | **~$2.40/mo** |

---

## 3. Token Usage (AI-Assisted Development)

| Phase | Estimated Tokens | Cost (approx) |
|-------|-----------------|---------------|
| Architecture design | ~50,000 | $0.75 |
| Code generation (React clients) | ~150,000 | $2.25 |
| Lambda backend | ~30,000 | $0.45 |
| Documentation | ~80,000 | $1.20 |
| Debugging/iteration | ~100,000 | $1.50 |
| **Total** | **~410,000** | **~$6.15** |

---

## 4. Compute Resources During Development

| Resource | Usage | Cost |
|----------|-------|------|
| CodeBuild (attempted) | 2 build minutes | $0.01 |
| Lambda test invocations | ~200 | $0.00 |
| S3 dev storage | <100MB | $0.00 |
| CloudFront invalidations | ~10 | $0.00 |
| ECR storage (unused image) | 0MB active | $0.00 |
| **Total dev compute** | | **~$0.01** |

---

## 5. Cost Optimization Notes

- Lambda at 128MB is sufficient for JSON operations + small S3 reads
- S3 lifecycle rule (1 day) prevents accumulation of demo data
- CloudFront caching reduces origin requests significantly
- No database (DynamoDB/RDS) keeps costs near-zero
- Calibration images stored in S3 directly (no separate image service needed)
- RSSI data is small JSON — no additional storage costs
