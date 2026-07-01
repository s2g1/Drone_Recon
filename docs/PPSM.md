# Ports, Protocols, and Services Management (PPSM)

## ARGUS Tactical Mapping System
**Classification:** UNCLASSIFIED — Demo System  
**Date:** 2026-07-01  
**Version:** 2.0

---

## Registered Ports, Protocols, and Services

| # | Port | Protocol | Service | Direction | Source | Destination | Justification | Encryption | Approval Status |
|---|------|----------|---------|-----------|--------|-------------|---------------|------------|-----------------|
| 1 | 443 | TCP/HTTPS | CloudFront CDN | Inbound | Edge Devices / BMS | AWS CloudFront | Static asset delivery for React SPA | TLS 1.2+ | APPROVED |
| 2 | 443 | TCP/HTTPS | API Gateway | Inbound | Edge Devices / BMS | AWS API Gateway | REST API for device registration, calibration, deploy, status | TLS 1.2+ | APPROVED |
| 3 | 443 | TCP/HTTPS | S3 (Internal) | Internal | CloudFront | S3 Bucket | Origin fetch for static assets | TLS 1.2+ | APPROVED |
| 4 | N/A | AWS Internal | Lambda Invoke | Internal | API Gateway | Lambda Function | Function execution for API logic | AWS Internal Encryption | APPROVED |
| 5 | 80 | TCP/HTTP | Redirect Only | Inbound | Edge Devices / BMS | CloudFront | Automatic redirect to HTTPS (no data served) | None (redirect) | APPROVED |

---

## Service Descriptions

### 1. CloudFront CDN (Port 443)
- **Purpose**: Delivers the React Single Page Application (SPA) to edge devices and BMS clients
- **Data Types**: HTML, JavaScript, CSS, static assets
- **Authentication**: None (public static content)
- **Encryption**: TLS 1.2+ with AWS-managed certificate
- **Risk Level**: Low

### 2. API Gateway REST API (Port 443)
- **Purpose**: Handles device registration, calibration data submission, deployment commands, status polling, and system reset
- **Endpoints**:
  - `POST /register` — Register new edge device
  - `GET /nodes` — List registered devices
  - `POST /calibrate` — Submit calibration corner data
  - `GET /calibrations` — Get calibration progress
  - `GET /status` — Get system phase
  - `POST /deploy` — Trigger scanning phase
  - `POST /reset` — Reset all system state
- **Data Types**: JSON payloads (device metadata, timestamps, status)
- **Authentication**: None (demo system)
- **Encryption**: TLS 1.2+ with AWS-managed certificate
- **Risk Level**: Low (no sensitive data)

### 3. S3 Internal Access (Port 443)
- **Purpose**: CloudFront fetches static assets from S3 origin
- **Access Control**: Origin Access Identity (OAI)
- **Data Types**: Static web assets
- **Risk Level**: Low

### 4. Lambda Invoke (Internal)
- **Purpose**: API Gateway invokes Lambda function to process API requests
- **Access Control**: IAM execution role
- **Data Types**: HTTP request/response JSON
- **Risk Level**: Low

### 5. HTTP Redirect (Port 80)
- **Purpose**: Redirects HTTP requests to HTTPS
- **Data Served**: None (301 redirect only)
- **Risk Level**: Minimal

---

## Denied/Blocked Ports

| Port | Protocol | Reason |
|------|----------|--------|
| 22 | TCP/SSH | No SSH access to any component (serverless) |
| 3389 | TCP/RDP | No RDP access (serverless) |
| 25 | TCP/SMTP | No email services |
| 3306 | TCP/MySQL | No database services |
| 5432 | TCP/PostgreSQL | No database services |
| 6379 | TCP/Redis | No caching services |
| 8080 | TCP/HTTP-Alt | No alternative HTTP ports |

---

## Compliance Notes

1. All external communications use HTTPS (TLS 1.2+)
2. No unencrypted data transmission occurs
3. No non-standard ports are used
4. All internal AWS communications use encrypted channels
5. No persistent network connections (stateless HTTP only)
6. WebSocket connections are not used in current version (polling-based)

---

## Change History

| Date | Change | Approved By |
|------|--------|-------------|
| 2026-07-01 | Initial PPSM documentation | [DEMO] |
