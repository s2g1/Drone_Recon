# DISA STIG Compliance Checklist

## ARGUS Tactical Mapping System
**Classification:** UNCLASSIFIED — Demo System  
**Date:** 2026-07-01  
**Version:** 2.0

---

## 1. Web Server STIG (Node.js/Vite Build Server)

> Note: Production static assets are served via CloudFront/S3, not a Node.js server.
> The Vite dev server is development-only. These checks apply to the build tooling.

| STIG ID | Rule | Status | Notes |
|---------|------|--------|-------|
| V-222941 | Web server must limit the number of connections | N/A | CloudFront handles connection limits |
| V-222942 | Web server must use encryption (TLS) | COMPLIANT | CloudFront enforces TLS 1.2+ |
| V-222943 | Web server must have logging enabled | COMPLIANT | CloudFront access logs available; CloudWatch for Lambda |
| V-222944 | Web server content must be on dedicated partition | N/A | S3 managed storage |
| V-222945 | Web server must not have unnecessary scripts | COMPLIANT | Vite tree-shakes unused code; production build minified |
| V-222946 | Directory browsing must be disabled | COMPLIANT | S3 block public access; CloudFront no directory listing |
| V-222947 | Web server must use DoD-approved certificate | NON-COMPLIANT | Uses AWS-managed certificate (ACM), not DoD PKI |
| V-222948 | Web server must have unnecessary modules removed | COMPLIANT | Minimal Lambda runtime (Python 3.12, no extras) |
| V-222949 | Web server must have timeout configured | COMPLIANT | Lambda timeout: 10s; API Gateway timeout: 30s |
| V-222950 | Web server sample content removed | COMPLIANT | No sample content deployed |
| V-222951 | HTTP methods restricted to GET/POST | COMPLIANT | Lambda only handles GET, POST, OPTIONS |
| V-222952 | Error messages must not reveal details | COMPLIANT | Lambda returns generic JSON errors |

---

## 2. Application STIG (React SPA)

| STIG ID | Rule | Status | Notes |
|---------|------|--------|-------|
| V-222396 | Application must use encryption for credentials | N/A | No credentials in system (demo) |
| V-222397 | Session management must be secure | N/A | No sessions — stateless API calls |
| V-222398 | Application must validate input | COMPLIANT | Lambda validates JSON body structure |
| V-222399 | Application must not contain embedded passwords | COMPLIANT | No hardcoded secrets in source |
| V-222400 | Application must protect against XSS | COMPLIANT | React auto-escapes by default; no dangerouslySetInnerHTML |
| V-222401 | Application must protect against CSRF | N/A | No session tokens; stateless API (CORS provides basic protection) |
| V-222402 | Application must protect against SQL injection | N/A | No database; in-memory dict storage |
| V-222403 | Application must implement access controls | NON-COMPLIANT | No authentication (demo system) |
| V-222404 | Application must log security events | NON-COMPLIANT | No application-level security logging |
| V-222405 | Application must use approved cryptographic modules | COMPLIANT | TLS via AWS (FIPS-validated endpoints available) |
| V-222406 | Application must not store sensitive data client-side | COMPLIANT | No sensitive data stored in browser |
| V-222407 | Application must implement role-based access | NON-COMPLIANT | No RBAC (demo system) |
| V-222408 | Application must enforce password complexity | N/A | No passwords in system |
| V-222409 | Application must lock after failed attempts | N/A | No login mechanism |
| V-222410 | Application must terminate session after inactivity | N/A | No sessions |

---

## 3. Cloud STIG (AWS Lambda, S3, CloudFront, API Gateway)

### 3.1 AWS Lambda

| STIG ID | Rule | Status | Notes |
|---------|------|--------|-------|
| V-259701 | Lambda must use minimum required permissions | COMPLIANT | Role: argus-lambda-role (invoke only) |
| V-259702 | Lambda must be current runtime | COMPLIANT | Python 3.12 (latest supported) |
| V-259703 | Lambda must not have excessive timeout | COMPLIANT | Timeout: 10 seconds |
| V-259704 | Lambda must not have excessive memory | COMPLIANT | Memory: 128 MB (minimum) |
| V-259705 | Lambda environment variables must not contain secrets | COMPLIANT | No environment variables configured |
| V-259706 | Lambda must have dead letter queue | NON-COMPLIANT | No DLQ configured (demo) |
| V-259707 | Lambda must have reserved concurrency | NON-COMPLIANT | Using default unreserved concurrency |
| V-259708 | Lambda must enable tracing | NON-COMPLIANT | X-Ray tracing not enabled |

### 3.2 Amazon S3

| STIG ID | Rule | Status | Notes |
|---------|------|--------|-------|
| V-259801 | S3 bucket must block public access | COMPLIANT | BlockPublicAccess enabled |
| V-259802 | S3 must enable versioning | NON-COMPLIANT | Versioning not enabled (ephemeral demo data) |
| V-259803 | S3 must enable encryption | COMPLIANT | SSE-S3 (AES-256) default encryption |
| V-259804 | S3 must enable access logging | NON-COMPLIANT | Server access logging not configured |
| V-259805 | S3 must have lifecycle policy | COMPLIANT | 1-day expiration policy |
| V-259806 | S3 bucket policy must restrict access | COMPLIANT | OAI-only access for CloudFront |
| V-259807 | S3 must not allow ACL grants | COMPLIANT | No ACL grants; bucket owner enforced |

### 3.3 CloudFront

| STIG ID | Rule | Status | Notes |
|---------|------|--------|-------|
| V-259901 | CloudFront must enforce HTTPS | COMPLIANT | Viewer protocol: redirect-to-HTTPS |
| V-259902 | CloudFront must use TLS 1.2+ | COMPLIANT | Minimum protocol version: TLSv1.2 |
| V-259903 | CloudFront must have logging enabled | NON-COMPLIANT | Standard logging not configured |
| V-259904 | CloudFront must use custom error pages | COMPLIANT | Custom 403/404 → /index.html (SPA routing) |
| V-259905 | CloudFront must restrict origin access | COMPLIANT | OAI configured for S3 origin |
| V-259906 | CloudFront must use WAF | NON-COMPLIANT | AWS WAF not attached (demo) |

### 3.4 API Gateway

| STIG ID | Rule | Status | Notes |
|---------|------|--------|-------|
| V-260001 | API Gateway must enforce HTTPS | COMPLIANT | HTTP API default: HTTPS only |
| V-260002 | API Gateway must have throttling | COMPLIANT | Default throttling limits active |
| V-260003 | API Gateway must have access logging | NON-COMPLIANT | Access logging not configured |
| V-260004 | API Gateway must require authentication | NON-COMPLIANT | No auth (demo system) |
| V-260005 | API Gateway must validate request payload | NON-COMPLIANT | No request validation configured |
| V-260006 | API Gateway must use custom domain | NON-COMPLIANT | Using default execute-api endpoint |

---

## Summary

| Category | Compliant | Non-Compliant | N/A | Total |
|----------|-----------|---------------|-----|-------|
| Web Server | 9 | 1 | 2 | 12 |
| Application | 5 | 3 | 7 | 15 |
| Lambda | 5 | 3 | 0 | 8 |
| S3 | 5 | 2 | 0 | 7 |
| CloudFront | 4 | 2 | 0 | 6 |
| API Gateway | 2 | 4 | 0 | 6 |
| **Total** | **30** | **15** | **9** | **54** |

---

## Remediation Plan (Production)

For production deployment, the following items require remediation:
1. Implement DoD PKI certificates or approved CA
2. Add user authentication (OAuth2/SAML via Cognito)
3. Enable CloudWatch/CloudTrail security logging
4. Configure AWS WAF on CloudFront
5. Enable X-Ray tracing on Lambda
6. Add DLQ for Lambda async invocations
7. Enable S3 versioning and access logging
8. Configure API Gateway request validation and access logging
