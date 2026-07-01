# Architecture Design Document (ADD)

## ARGUS Tactical Mapping System
**Version:** 2.0  
**Date:** 2026-07-01  
**Classification:** UNCLASSIFIED

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ARGUS SYSTEM ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│  │ Edge Device │     │ Edge Device │     │ Edge Device │          │
│  │   (Phone)   │     │   (Phone)   │     │   (Phone)   │          │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘          │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │ HTTPS                                  │
│                             ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │              AWS CLOUD (us-east-1)                        │      │
│  │  ┌────────────┐  ┌──────────────┐  ┌───────────────┐    │      │
│  │  │ CloudFront │  │ API Gateway  │  │      S3       │    │      │
│  │  │   (CDN)    │──│  (HTTP API)  │  │   (Assets)    │    │      │
│  │  └────────────┘  └──────┬───────┘  └───────────────┘    │      │
│  │                         │                                 │      │
│  │                         ▼                                 │      │
│  │                  ┌──────────────┐                         │      │
│  │                  │    Lambda    │                         │      │
│  │                  │  (Python)   │                         │      │
│  │                  └──────────────┘                         │      │
│  └──────────────────────────────────────────────────────────┘      │
│                             ▲                                        │
│                             │ HTTPS                                  │
│                             │                                        │
│  ┌──────────────────────────┴───────────────────────────────┐      │
│  │               BMS (Battle Management System)              │      │
│  │               Desktop Browser Client                      │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Descriptions

### 2.1 Edge Device Client (client-register)

**Technology:** React 18 + TypeScript + Vite  
**Deployment:** S3 + CloudFront (static SPA)  
**Purpose:** Mobile web application for field operators

**Responsibilities:**
- Auto-register device with backend on page load
- Access device camera for calibration and scanning
- Guide user through 4-corner room calibration
- Enter standby mode awaiting deploy command
- Execute timed camera scan on deploy
- Report completion status

**State Machine:**
```
REGISTERING → CALIBRATING → STANDBY → SCANNING → COMPLETE
                                                      ↓
                                                   ERROR (from any state)
```

### 2.2 BMS Client (client-bms)

**Technology:** React 18 + TypeScript + Vite + QRCode.react  
**Deployment:** Local or hosted (not currently deployed to cloud)  
**Purpose:** Operator command console

**Responsibilities:**
- Display QR code for edge device registration
- Poll backend for registered devices and calibration status
- Show real-time device readiness indicators
- Provide DEPLOY trigger to start scanning phase
- Render tactical map from scan results
- Provide system RESET capability
- Tab navigation between Calibrate and Map views

**Views:**
- **Calibrate View**: QR code + device list + Deploy + Reset
- **Map View**: Canvas-rendered tactical map + legend
- **Deploy View**: Countdown + recording status (auto-transitions)

### 2.3 Lambda Function (argus-register)

**Technology:** Python 3.12  
**Deployment:** AWS Lambda (128MB, 10s timeout)  
**Purpose:** Stateless API backend

**Responsibilities:**
- Handle device registration (generate UUID, store metadata)
- Track calibration progress per device
- Manage system phase (register → scanning)
- Provide system reset
- CORS handling for cross-origin requests

**API Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | /register | Register new edge device |
| GET | /nodes | List all registered devices |
| POST | /calibrate | Submit corner calibration data |
| GET | /calibrations | Get calibration progress |
| GET | /status | Get current system phase |
| POST | /deploy | Trigger scanning phase |
| POST | /reset | Clear all state |
| OPTIONS | * | CORS preflight |

### 2.4 API Gateway (argus-api)

**Technology:** AWS HTTP API (v2)  
**Configuration:** Default route ($default) → Lambda integration  
**Purpose:** HTTPS ingress and request routing

### 2.5 CloudFront Distribution

**Technology:** AWS CloudFront  
**Configuration:** S3 origin with OAI, SPA error handling  
**Purpose:** Global CDN for edge device SPA delivery

### 2.6 S3 Bucket (argus-register-361274344489)

**Technology:** Amazon S3  
**Configuration:** Block public access, SSE-S3, 1-day lifecycle  
**Purpose:** Static asset storage for edge device SPA

---

## 3. Data Flow

### 3.1 Device Registration Flow

```
Edge Device                    API Gateway              Lambda
     │                              │                      │
     │── POST /register ──────────►│──── invoke ────────►│
     │   {ip, userAgent,           │                      │── generate UUID
     │    deviceType,              │                      │── store in memory
     │    capabilities}            │                      │
     │◄── 200 {nodeId, ...} ──────│◄── response ────────│
     │                              │                      │
```

### 3.2 Calibration Flow

```
Edge Device                    API Gateway              Lambda
     │                              │                      │
     │── POST /calibrate ─────────►│──── invoke ────────►│
     │   {nodeId, corner,          │                      │── store timestamp
     │    timestamp}               │                      │── update progress
     │◄── 200 {progress} ─────────│◄── response ────────│
     │                              │                      │

BMS Client                     API Gateway              Lambda
     │                              │                      │
     │── GET /nodes ───────────────►│──── invoke ────────►│
     │◄── 200 [{nodeId, ...}] ─────│◄── response ────────│── return all nodes
     │                              │                      │
     │── GET /calibrations ────────►│──── invoke ────────►│
     │◄── 200 {nodeId: [...]} ─────│◄── response ────────│── return progress
     │                              │                      │
```

### 3.3 Deploy Flow

```
BMS Client                     API Gateway              Lambda
     │                              │                      │
     │── POST /deploy ─────────────►│──── invoke ────────►│
     │◄── 200 {phase: scanning} ───│◄── response ────────│── set phase=scanning
     │                              │                      │

Edge Device                    API Gateway              Lambda
     │                              │                      │
     │── GET /status ──────────────►│──── invoke ────────►│
     │◄── 200 {phase: scanning} ───│◄── response ────────│── return current phase
     │                              │                      │
     │── [Start camera, countdown] │                      │
     │                              │                      │
```

---

## 4. Security Architecture

### 4.1 Authentication & Authorization

| Layer | Mechanism | Notes |
|-------|-----------|-------|
| Edge → API | None | Demo system (open access) |
| BMS → API | None | Demo system (open access) |
| CloudFront → S3 | OAI (Origin Access Identity) | Restricts S3 to CloudFront only |
| API GW → Lambda | IAM Role | AWS-managed trust |
| Lambda execution | IAM Role (argus-lambda-role) | Least privilege |

### 4.2 Encryption

| Path | Encryption Type | Standard |
|------|----------------|----------|
| Client ↔ CloudFront | TLS 1.2+ | In-transit |
| Client ↔ API Gateway | TLS 1.2+ | In-transit |
| CloudFront ↔ S3 | TLS (internal) | In-transit |
| S3 Storage | SSE-S3 (AES-256) | At-rest |
| Lambda environment | AWS-managed | At-rest |

### 4.3 Network Security

- No VPC (serverless public endpoints)
- AWS Shield Standard (DDoS protection on CloudFront)
- API Gateway throttling (default limits)
- No WAF configured (demo)
- All external endpoints HTTPS-only

### 4.4 Data Protection

- No PII collected (device metadata only)
- Ephemeral storage (Lambda in-memory)
- Automatic state expiry (Lambda cold start ~15 min)
- No data persistence between invocations

---

## 5. Deployment Architecture

### 5.1 Build Pipeline

```
Source (Git)
     │
     ▼
pnpm build (Turbo)
     │
     ├── client-register → Vite build → dist/
     ├── client-bms → Vite build → dist/
     └── server → tsc → dist/
     
Deployment:
     ├── client-register/dist → S3 sync → CloudFront invalidation
     └── lambda/lambda_function.py → zip → Lambda update-function-code
```

### 5.2 Infrastructure

| Resource | Service | Provisioning |
|----------|---------|-------------|
| CDN | CloudFront | Manual / CDK |
| Static hosting | S3 | Manual / CDK |
| API | API Gateway HTTP API | Manual |
| Compute | Lambda | Manual (zip deploy) |
| DNS | CloudFront default domain | Automatic |

### 5.3 Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Production (Demo) | Live demo system | https://dcaloltnto1d8.cloudfront.net |
| API | Backend services | https://ksxaeu4eb8.execute-api.us-east-1.amazonaws.com |
| Local Dev | Development | http://localhost:5173 (Vite) |

---

## 6. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Serverless architecture | Zero maintenance, auto-scaling, cost-effective for demos |
| In-memory Lambda storage | Simplicity; no database needed for ephemeral demo data |
| React SPA | Modern, fast, good mobile support for edge devices |
| Python Lambda | Simple request routing; no external dependencies needed |
| Polling (not WebSocket) | Simpler deployment; acceptable latency for demo (2s) |
| Canvas for map rendering | Full control over tactical visualization; no map library dependency |
| Monorepo (pnpm + Turbo) | Shared types, coordinated builds, single repo for all components |
