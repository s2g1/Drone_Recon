# NIST 800-53 Security Controls Compliance Mapping

## ARGUS Tactical Mapping System
**Framework:** NIST SP 800-53 Rev. 5  
**Classification:** UNCLASSIFIED — Demo System  
**Date:** 2026-07-01  
**Baseline:** LOW (FedRAMP Low equivalent)

---

## 1. Access Control (AC)

| Control | Title | Status | Implementation Notes |
|---------|-------|--------|---------------------|
| AC-1 | Policy and Procedures | N/A | Demo system — no formal policy required |
| AC-2 | Account Management | NON-COMPLIANT | No user accounts implemented (open access demo) |
| AC-3 | Access Enforcement | NON-COMPLIANT | No access controls; all endpoints public |
| AC-4 | Information Flow Enforcement | PARTIAL | CORS headers restrict browser-based flows; no server-side enforcement |
| AC-5 | Separation of Duties | N/A | Single-operator demo system |
| AC-6 | Least Privilege | COMPLIANT | Lambda IAM role has minimal permissions |
| AC-7 | Unsuccessful Logon Attempts | N/A | No login mechanism |
| AC-8 | System Use Notification | NON-COMPLIANT | No login banner displayed |
| AC-10 | Concurrent Session Control | N/A | No sessions |
| AC-11 | Device Lock | N/A | Client-side device responsibility |
| AC-12 | Session Termination | N/A | Stateless API (no sessions) |
| AC-14 | Permitted Actions Without Identification | COMPLIANT | All actions intentionally permitted without auth (demo) |
| AC-17 | Remote Access | COMPLIANT | All access is remote via HTTPS; TLS 1.2+ enforced |
| AC-18 | Wireless Access | N/A | No wireless infrastructure managed |
| AC-19 | Access Control for Mobile Devices | NON-COMPLIANT | No MDM or device posture checks |
| AC-20 | Use of External Systems | COMPLIANT | System designed for external device access |
| AC-22 | Publicly Accessible Content | COMPLIANT | Only SPA assets are public; no sensitive content |

---

## 2. Audit and Accountability (AU)

| Control | Title | Status | Implementation Notes |
|---------|-------|--------|---------------------|
| AU-1 | Policy and Procedures | N/A | Demo system |
| AU-2 | Event Logging | PARTIAL | CloudWatch Logs captures Lambda invocations; no application-level audit |
| AU-3 | Content of Audit Records | PARTIAL | CloudWatch includes timestamp, request, response; lacks user identity |
| AU-4 | Audit Log Storage Capacity | COMPLIANT | CloudWatch auto-scales storage |
| AU-5 | Response to Audit Logging Failures | COMPLIANT | CloudWatch managed by AWS (highly available) |
| AU-6 | Audit Record Review | NON-COMPLIANT | No formal review process |
| AU-7 | Audit Record Reduction | COMPLIANT | CloudWatch Insights available for query |
| AU-8 | Time Stamps | COMPLIANT | AWS services use synchronized NTP |
| AU-9 | Protection of Audit Information | COMPLIANT | CloudWatch logs protected by IAM |
| AU-11 | Audit Record Retention | PARTIAL | Default CloudWatch retention (never expire); no explicit policy set |
| AU-12 | Audit Record Generation | PARTIAL | API Gateway and Lambda generate logs; no custom audit events |

---

## 3. Configuration Management (CM)

| Control | Title | Status | Implementation Notes |
|---------|-------|--------|---------------------|
| CM-1 | Policy and Procedures | N/A | Demo system |
| CM-2 | Baseline Configuration | PARTIAL | Infrastructure defined in CDK; Lambda deployed manually |
| CM-3 | Configuration Change Control | PARTIAL | Git version control; no formal change board |
| CM-4 | Impact Analysis | N/A | Demo system |
| CM-5 | Access Restrictions for Change | PARTIAL | AWS IAM restricts deployment; Git branch protection not configured |
| CM-6 | Configuration Settings | COMPLIANT | AWS default secure settings (HTTPS, encryption) |
| CM-7 | Least Functionality | COMPLIANT | Lambda has no unnecessary packages; minimal runtime |
| CM-8 | System Component Inventory | COMPLIANT | Documented in VDD and ADD |
| CM-9 | Configuration Management Plan | N/A | Demo system |
| CM-10 | Software Usage Restrictions | COMPLIANT | All software is open-source (MIT/Apache) or AWS-managed |
| CM-11 | User-Installed Software | N/A | Serverless — no user-installable software |

---

## 4. Identification and Authentication (IA)

| Control | Title | Status | Implementation Notes |
|---------|-------|--------|---------------------|
| IA-1 | Policy and Procedures | N/A | Demo system |
| IA-2 | Identification and Authentication (Org Users) | NON-COMPLIANT | No user authentication implemented |
| IA-3 | Device Identification and Authentication | NON-COMPLIANT | Devices register without authentication |
| IA-4 | Identifier Management | PARTIAL | UUID generated per device; no lifecycle management |
| IA-5 | Authenticator Management | N/A | No authenticators used |
| IA-6 | Authentication Feedback | N/A | No authentication mechanism |
| IA-7 | Cryptographic Module Authentication | COMPLIANT | AWS TLS uses FIPS-validated modules (AWS endpoints) |
| IA-8 | Identification and Authentication (Non-Org Users) | NON-COMPLIANT | No external user authentication |
| IA-11 | Re-authentication | N/A | No sessions requiring re-auth |

---

## 5. System and Communications Protection (SC)

| Control | Title | Status | Implementation Notes |
|---------|-------|--------|---------------------|
| SC-1 | Policy and Procedures | N/A | Demo system |
| SC-5 | Denial-of-Service Protection | COMPLIANT | AWS Shield Standard on CloudFront; API Gateway throttling |
| SC-7 | Boundary Protection | PARTIAL | AWS network boundaries; no WAF or custom firewalls |
| SC-8 | Transmission Confidentiality and Integrity | COMPLIANT | TLS 1.2+ on all external communications |
| SC-10 | Network Disconnect | COMPLIANT | Stateless HTTP — no persistent connections |
| SC-12 | Cryptographic Key Management | COMPLIANT | AWS-managed keys (ACM, S3 SSE) |
| SC-13 | Cryptographic Protection | COMPLIANT | TLS 1.2+ with strong cipher suites |
| SC-15 | Collaborative Computing Devices | N/A | Camera access is user-initiated and permission-gated |
| SC-17 | PKI Certificates | COMPLIANT | AWS Certificate Manager (auto-renewed) |
| SC-18 | Mobile Code | PARTIAL | JavaScript SPA executes in browser; no code signing |
| SC-20 | Secure Name/Address Resolution | COMPLIANT | AWS DNS (Route 53) with DNSSEC support |
| SC-21 | Secure Name/Address Resolution (Recursive) | COMPLIANT | AWS-managed DNS resolution |
| SC-22 | Architecture and Provisioning for Name/Address Resolution | COMPLIANT | CloudFront uses AWS global DNS infrastructure |
| SC-23 | Session Authenticity | N/A | No sessions (stateless API) |
| SC-28 | Protection of Information at Rest | COMPLIANT | S3 SSE-S3 (AES-256) encryption at rest |
| SC-39 | Process Isolation | COMPLIANT | Lambda provides process isolation per invocation |

---

## 6. System and Information Integrity (SI)

| Control | Title | Status | Implementation Notes |
|---------|-------|--------|---------------------|
| SI-1 | Policy and Procedures | N/A | Demo system |
| SI-2 | Flaw Remediation | PARTIAL | Dependencies monitored; no formal patching SLA |
| SI-3 | Malicious Code Protection | COMPLIANT | No file uploads to Lambda; input is JSON only |
| SI-4 | System Monitoring | PARTIAL | CloudWatch metrics and logs; no active alerting |
| SI-5 | Security Alerts and Advisories | N/A | Demo system |
| SI-7 | Software, Firmware, and Information Integrity | PARTIAL | Lambda code hash verified on deploy; no runtime integrity monitoring |
| SI-10 | Information Input Validation | PARTIAL | JSON parsed with error handling; no schema validation |
| SI-11 | Error Handling | COMPLIANT | Lambda returns generic error messages; no stack traces exposed |
| SI-12 | Information Management and Retention | COMPLIANT | Ephemeral data; 1-day S3 lifecycle; no long-term retention |
| SI-16 | Memory Protection | COMPLIANT | Lambda runtime provides memory isolation |

---

## Summary

| Control Family | Compliant | Partial | Non-Compliant | N/A | Total |
|---------------|-----------|---------|---------------|-----|-------|
| AC (Access Control) | 6 | 1 | 4 | 6 | 17 |
| AU (Audit) | 5 | 4 | 1 | 1 | 11 |
| CM (Configuration Mgmt) | 5 | 3 | 0 | 3 | 11 |
| IA (Identification & Auth) | 1 | 1 | 3 | 4 | 9 |
| SC (System & Comm Protection) | 11 | 2 | 0 | 3 | 16 |
| SI (System & Info Integrity) | 4 | 4 | 0 | 2 | 10 |
| **Total** | **32** | **15** | **8** | **19** | **74** |

---

## Risk Acceptance Statement

This system is designated as an **UNCLASSIFIED demonstration system** with no production data processing. The following control gaps are accepted:

1. **No Authentication (AC-2, AC-3, IA-2, IA-3, IA-8)**: Intentional for demo accessibility
2. **No Formal Audit (AU-6)**: CloudWatch provides basic logging sufficient for demo
3. **No System Use Banner (AC-8)**: Not required for demo systems
4. **No Mobile Device Management (AC-19)**: Edge devices are personal phones in demo context

For production deployment, all NON-COMPLIANT controls must be remediated before Authority to Operate (ATO) is granted.
