# ARGUS Network Topology

## Version 2.1 — Includes RSSI Mesh, Gyro Calibration, Image Upload

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INTERNET (HTTPS/TLS 1.2+)                          │
└─────────────────────────────────────────────────────────────────────────────┘
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│  Edge Device  │          │  Edge Device  │          │   BMS Client  │
│  (Mobile)     │          │  (Mobile)     │          │  (Desktop)    │
│  Port: 443   │          │  Port: 443    │          │  Port: 443    │
│  Camera+Gyro │          │  Camera+Gyro  │          │  Polling      │
│  BLE (RSSI)  │          │  BLE (RSSI)   │          │               │
└───────┬───────┘          └───────┬───────┘          └───────┬───────┘
        │                          │                          │
        ├──── BLE RSSI ────────────┤  (proximity scanning)    │
        │                          │                          │
        ▼                          ▼                          │
┌─────────────────────────────────────────────┐               │
│        AWS CloudFront (CDN)                 │               │
│        Distribution: E3DVUUV9HWT05Z        │               │
│        Protocol: HTTPS (TLS 1.2+)          │               │
│        Port: 443                           │               │
│        Edge Locations: Global              │               │
└─────────────────────┬───────────────────────┘               │
                      │                                       │
                      ▼                                       │
┌─────────────────────────────────────────────┐               │
│        Amazon S3                            │               │
│        Bucket: argus-register-361274344489  │               │
│        Static Assets (SPA)                  │               │
│        Calibration Images (JPEG)            │               │
│        State Files (JSON)                   │               │
│        Encryption: SSE-S3 (AES-256)        │               │
│        Access: OAI restricted              │               │
└─────────────────────────────────────────────┘               │
                                                              │
┌─────────────────────────────────────────────────────────────┤
│                                                             │
▼                                                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              AWS API Gateway (HTTP API)                                      │
│              API ID: ksxaeu4eb8                                              │
│              Endpoint: https://ksxaeu4eb8.execute-api.us-east-1.amazonaws.com│
│              Protocol: HTTPS (TLS 1.2+)                                     │
│              Port: 443                                                      │
│              CORS: Enabled (Allow-Origin: *)                                │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              AWS Lambda                                                      │
│              Function: argus-register                                        │
│              Runtime: Python 3.12                                            │
│              Memory: 128 MB                                                 │
│              Timeout: 10s                                                   │
│              Storage: S3-backed (persistent state)                          │
│              Encryption: At-rest (AWS managed)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Communication Paths

| Source | Destination | Protocol | Port | Encryption | Purpose |
|--------|-------------|----------|------|------------|---------|
| Edge Device | CloudFront | HTTPS | 443 | TLS 1.2+ | Load SPA static assets |
| Edge Device | API Gateway | HTTPS | 443 | TLS 1.2+ | Register, calibrate, RSSI, poll status |
| Edge Device | Edge Device | BLE | N/A | None | RSSI proximity scanning |
| BMS Client | API Gateway | HTTPS | 443 | TLS 1.2+ | Poll nodes, calibrations, RSSI, deploy, reset |
| CloudFront | S3 | HTTPS | 443 | TLS 1.2+ | Origin fetch (OAI) |
| API Gateway | Lambda | Internal AWS | N/A | Encrypted | Invoke function |
| Lambda | S3 | Internal AWS | N/A | Encrypted | Read/write state + images |

## Data Flow: Calibration (Gyro + Image Upload)

```
Edge Device                    API Gateway              Lambda                S3
     │                              │                      │                   │
     │── POST /calibrate ─────────►│──── invoke ────────►│                   │
     │   {nodeId, corner,          │                      │── decode image    │
     │    gyro: {α,β,γ},           │                      │── PUT image ────►│
     │    image: base64,           │                      │   corner_N.jpg    │
     │    timestamp}               │                      │── update meta ──►│
     │                              │                      │   _calibrations   │
     │◄── 200 {progress} ─────────│◄── response ────────│                   │
     │                              │                      │                   │
```

## Data Flow: RSSI Scanning

```
Edge Device A          Edge Device B          API Gateway        Lambda
     │                      │                      │                │
     │◄── BLE beacon ──────│                      │                │
     │   (RSSI: -45dBm)    │                      │                │
     │                      │                      │                │
     │── POST /rssi ───────────────────────────►│──── invoke ───►│
     │   {fromNodeId: A,                         │                │── store
     │    measurements: [                         │                │
     │      {toNodeId: B,                         │                │
     │       rssi: -45,                           │                │
     │       distance: 1.8}                       │                │
     │    ]}                                      │                │
     │◄── 200 ─────────────────────────────────│◄── response ──│
     │                      │                      │                │

BMS Client                                    API Gateway        Lambda
     │                                             │                │
     │── GET /rssi ──────────────────────────────►│──── invoke ───►│
     │◄── 200 {A: {measurements: [...]}} ────────│◄── response ──│
     │                                             │                │
     │── [Draw RSSI proximity lines on map] ──    │                │
```

## Data Flow: Photogrammetry Position Estimation

```
BMS Client                                    API Gateway        Lambda
     │                                             │                │
     │── GET /calibrations ──────────────────────►│──── invoke ───►│
     │◄── 200 {nodeId: {corner: {gyro}}} ───────│◄── response ──│
     │                                             │                │
     │── [For each node]:                          │                │
     │   avg_alpha = mean(corner[0..3].gyro.alpha) │                │
     │   avg_beta  = mean(corner[0..3].gyro.beta)  │                │
     │   x_pos = normalize(avg_alpha, 0-360) * roomWidth           │
     │   y_pos = normalize(avg_beta, -90..90) * roomHeight         │
     │   → Draw node at (x_pos, y_pos) on tactical map            │
```

## Encryption Status

| Component | At Rest | In Transit |
|-----------|---------|------------|
| S3 Bucket (state) | SSE-S3 (AES-256) | TLS 1.2+ |
| S3 Bucket (images) | SSE-S3 (AES-256) | TLS 1.2+ |
| Lambda | AWS Managed Encryption | TLS 1.2+ (internal) |
| API Gateway | N/A (stateless) | TLS 1.2+ |
| CloudFront | N/A (cache) | TLS 1.2+ |
| Edge Device (BLE) | N/A | None (local proximity only) |

## Network Boundaries

1. **Public Internet → CloudFront**: TLS-encrypted, DDoS protection via AWS Shield Standard
2. **Public Internet → API Gateway**: TLS-encrypted, throttling enabled
3. **CloudFront → S3**: Internal AWS network, OAI-authenticated
4. **API Gateway → Lambda**: Internal AWS network, IAM-authenticated
5. **Lambda → S3**: Internal AWS network, IAM role-authenticated
6. **Edge ↔ Edge (BLE)**: Local radio, short range (~10m), RSSI only (no data payload)
