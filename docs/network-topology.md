# ARGUS Network Topology

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
│  HTTPS       │          │  HTTPS        │          │  HTTPS        │
└───────┬───────┘          └───────┬───────┘          └───────┬───────┘
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
│              Storage: In-memory (ephemeral)                                 │
│              Encryption: At-rest (AWS managed)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Communication Paths

| Source | Destination | Protocol | Port | Encryption | Purpose |
|--------|-------------|----------|------|------------|---------|
| Edge Device | CloudFront | HTTPS | 443 | TLS 1.2+ | Load SPA static assets |
| Edge Device | API Gateway | HTTPS | 443 | TLS 1.2+ | Register, calibrate, poll status |
| BMS Client | API Gateway | HTTPS | 443 | TLS 1.2+ | Poll nodes, deploy, reset |
| CloudFront | S3 | HTTPS | 443 | TLS 1.2+ | Origin fetch (OAI) |
| API Gateway | Lambda | Internal AWS | N/A | Encrypted | Invoke function |
| BMS Client | CloudFront | HTTPS | 443 | TLS 1.2+ | Load SPA static assets (if hosted) |

## Encryption Status

| Component | At Rest | In Transit |
|-----------|---------|------------|
| S3 Bucket | SSE-S3 (AES-256) | TLS 1.2+ |
| Lambda | AWS Managed Encryption | TLS 1.2+ (internal) |
| API Gateway | N/A (stateless) | TLS 1.2+ |
| CloudFront | N/A (cache) | TLS 1.2+ |
| Edge Device | N/A (client) | TLS 1.2+ |

## Network Boundaries

1. **Public Internet → CloudFront**: TLS-encrypted, DDoS protection via AWS Shield Standard
2. **Public Internet → API Gateway**: TLS-encrypted, throttling enabled
3. **CloudFront → S3**: Internal AWS network, OAI-authenticated
4. **API Gateway → Lambda**: Internal AWS network, IAM-authenticated
