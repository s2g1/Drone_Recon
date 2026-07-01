# Interconnection Security Agreement (ISA)

## ARGUS Tactical Mapping System

### Document Information

| Field | Value |
|-------|-------|
| System Name | ARGUS Live Demo |
| Classification | UNCLASSIFIED |
| Version | 2.0 |
| Date | 2026-07-01 |
| Status | DEMO / NON-PRODUCTION |

---

## 1. System Description

ARGUS is a multi-device tactical room mapping demonstration system. Edge devices (mobile phones) register with a central Battle Management System (BMS) via cloud APIs, perform room calibration, and execute coordinated camera scans to generate a tactical map.

**Data Classification: UNCLASSIFIED — Demo System Only**

---

## 2. System Interconnections

### 2.1 Edge Device ↔ AWS Cloud

| Attribute | Detail |
|-----------|--------|
| Interconnection Type | Public Internet to AWS Cloud Services |
| Protocol | HTTPS (TLS 1.2+) |
| Data Flow Direction | Bidirectional |
| Data Types | Device metadata, calibration timestamps, system status |
| Authentication | None (open registration for demo) |
| Authorization | None (demo mode) |
| Boundary Controls | AWS WAF-compatible, API Gateway throttling |

### 2.2 BMS Client ↔ AWS Cloud

| Attribute | Detail |
|-----------|--------|
| Interconnection Type | Public Internet to AWS Cloud Services |
| Protocol | HTTPS (TLS 1.2+) |
| Data Flow Direction | Bidirectional |
| Data Types | Node list, calibration status, deploy commands |
| Authentication | None (demo mode) |
| Authorization | None (demo mode) |
| Boundary Controls | API Gateway throttling, CORS policy |

### 2.3 CloudFront ↔ S3 (Internal)

| Attribute | Detail |
|-----------|--------|
| Interconnection Type | AWS Internal |
| Protocol | HTTPS (internal) |
| Data Flow Direction | CloudFront reads from S3 |
| Data Types | Static web assets (HTML, JS, CSS) |
| Authentication | Origin Access Identity (OAI) |
| Authorization | S3 bucket policy (OAI restricted) |
| Boundary Controls | Bucket policy denies public access |

### 2.4 API Gateway ↔ Lambda (Internal)

| Attribute | Detail |
|-----------|--------|
| Interconnection Type | AWS Internal |
| Protocol | AWS internal invoke |
| Data Flow Direction | API GW invokes Lambda |
| Data Types | HTTP request/response payloads (JSON) |
| Authentication | IAM role-based |
| Authorization | Lambda resource policy |
| Boundary Controls | IAM least-privilege role |

---

## 3. Security Controls at Each Boundary

### 3.1 Internet → CloudFront
- TLS 1.2+ enforced (viewer protocol: redirect-to-HTTPS)
- AWS Shield Standard (DDoS protection)
- Geographic restrictions: None (demo)
- Cache behavior: Static assets only

### 3.2 Internet → API Gateway
- TLS 1.2+ enforced
- Throttling: Default AWS limits (10,000 RPS burst)
- CORS headers configured (Allow-Origin: *)
- No authentication required (demo system)
- Request/response validation: None (demo)

### 3.3 CloudFront → S3
- Origin Access Identity (OAI) restricts S3 access
- Block Public Access enabled on bucket
- SSE-S3 encryption at rest
- Lifecycle policy: 1-day expiration

### 3.4 API Gateway → Lambda
- IAM execution role with least privilege
- Lambda timeout: 10 seconds
- Memory: 128 MB
- No VPC attachment (public Lambda)
- Ephemeral storage only (no persistent state)

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Unauthorized data access | Low | Low | Data is ephemeral, no PII stored |
| DDoS attack | Medium | Low | AWS Shield Standard, API throttling |
| Data interception | Low | Low | TLS 1.2+ on all external paths |
| Lambda cold start delay | Medium | Low | Acceptable for demo (10s timeout) |
| Cross-site scripting | Low | Low | React auto-escapes, no user-generated content displayed |

---

## 5. Agreements and Responsibilities

### AWS Shared Responsibility Model
- **AWS Responsibility**: Physical infrastructure, hypervisor, managed services security
- **Customer Responsibility**: Application code, IAM policies, data classification, access control

### Demo Limitations
This system is for demonstration purposes only. The following controls are intentionally relaxed:
- No user authentication/authorization
- CORS allow-origin set to wildcard (*)
- No data persistence (in-memory Lambda storage)
- No audit logging beyond CloudWatch defaults
- No network segmentation (public Lambda)

---

## 6. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| System Owner | [DEMO] | 2026-07-01 | N/A |
| Security Officer | [DEMO] | 2026-07-01 | N/A |
| Network Engineer | [DEMO] | 2026-07-01 | N/A |
