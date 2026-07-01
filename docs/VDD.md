# Version Description Document (VDD)

## ARGUS Tactical Mapping System

---

## Document Information

| Field | Value |
|-------|-------|
| System Name | ARGUS Live Demo |
| Version | 2.0.0 |
| Build Date | 2026-07-01 |
| Classification | UNCLASSIFIED |
| Release Type | Demo / Non-Production |

---

## 1. System Version

**ARGUS Live Demo v2.0.0**

This release includes:
- Edge device registration and calibration with live camera feed
- BMS operator console with tab navigation (Calibrate/Map)
- System reset functionality
- Tactical map generation
- Full compliance documentation suite

---

## 2. Component Versions

### Runtime Environment

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | ≥ 20.0.0 | Build tooling and development |
| Python | 3.12 | Lambda runtime |
| pnpm | 9.0.0 | Package manager |
| Turbo | ^2.0.0 | Monorepo build orchestration |

### Frontend Frameworks

| Component | Version | Package |
|-----------|---------|---------|
| React | ^18.x | react, react-dom |
| TypeScript | ~5.4.0 | typescript |
| Vite | ^5.4.x | Build tool |
| QRCode React | ^4.x | qrcode.react (BMS only) |

### AWS Services

| Service | Configuration | Region |
|---------|--------------|--------|
| Lambda | Python 3.12, 128MB, 10s timeout | us-east-1 |
| API Gateway | HTTP API (v2) | us-east-1 |
| S3 | Standard, SSE-S3 encryption | us-east-1 |
| CloudFront | TLS 1.2+, OAI | Global (us-east-1 origin) |

### Infrastructure as Code

| Component | Version | Notes |
|-----------|---------|-------|
| AWS CDK | v2 (aws-cdk-lib) | Infrastructure definition |
| Constructs | ^10.x | CDK constructs library |

---

## 3. Package Structure

```
argus-live-demo/
├── packages/
│   ├── client-bms/        # Battle Management System SPA
│   ├── client-register/   # Edge Device Registration SPA
│   ├── server/            # Express server (local dev)
│   ├── infra/             # AWS CDK infrastructure
│   └── shared/            # Shared types and utilities
├── lambda/                # Lambda function source
├── docs/                  # Compliance documentation
└── package.json           # Monorepo root
```

---

## 4. Deployment Artifacts

| Artifact | Location | Description |
|----------|----------|-------------|
| client-register dist | s3://argus-register-361274344489/ | Edge device SPA static assets |
| Lambda function | argus-register (us-east-1) | API backend (Python 3.12) |
| CloudFront distribution | E3DVUUV9HWT05Z | CDN for edge device SPA |
| API Gateway | ksxaeu4eb8 (us-east-1) | REST API endpoint |

---

## 5. Change History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-06-30 | Initial release — basic registration and calibration |
| 2.0.0 | 2026-07-01 | **Major Update**: Live camera during calibration, BMS tab navigation, RESET DEMO button, compliance documentation, tactical map improvements |

### v2.0.0 Changes Detail

**Edge Device (client-register):**
- Camera activates immediately when entering calibration step
- Live video feed displayed as background during calibration
- Calibration instructions overlaid on video with semi-transparent backdrop
- Maintained existing color scheme and styling

**BMS (client-bms):**
- Added CALIBRATE / MAP tab navigation in header
- Active tab shows green underline, inactive is dimmed
- Tabs allow switching views without affecting system state
- Added RESET DEMO button (red outlined) below Deploy button
- Reset calls POST /reset API and clears local node state
- Deploy phase still auto-transitions to map as before

**Lambda (argus-register):**
- Added POST /reset endpoint
- Clears all in-memory state (nodes, calibrations, system_phase)
- Returns reset confirmation with timestamp

**Documentation:**
- Added complete compliance documentation suite (9 documents)
- Network topology, ISA, STIG checklist, PPSM, vulnerability scan
- User manual, VDD, ADD, NIST 800-53 compliance mapping

---

## 6. Known Issues

| ID | Description | Severity | Workaround |
|----|-------------|----------|------------|
| KI-001 | Lambda cold start causes state loss | Low | Re-register devices after inactivity |
| KI-002 | No persistent storage | Low | Demo limitation; use RESET to clean state |
| KI-003 | Source maps deployed to production | Low | Remove .map files in production |
| KI-004 | CORS wildcard allows any origin | Medium | Restrict in production |

---

## 7. Dependencies (Full List)

### Production Dependencies
- react: ^18.x
- react-dom: ^18.x  
- qrcode.react: ^4.x (BMS only)

### Development Dependencies
- typescript: ~5.4.0
- vite: ^5.4.x
- turbo: ^2.0.0
- aws-cdk-lib: v2
- constructs: ^10.x

### Lambda Dependencies
- Python 3.12 standard library only (json, uuid, time)
- No third-party packages
