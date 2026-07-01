# AWS Services Specification

## ARGUS Tactical Mapping System
**Version:** 2.1  
**Region:** us-east-1  
**Account:** 361274344489

---

## 1. AWS Lambda

| Property | Value |
|----------|-------|
| Function Name | `argus-register` |
| ARN | `arn:aws:lambda:us-east-1:361274344489:function:argus-register` |
| Runtime | Python 3.12 |
| Memory | 128 MB |
| Timeout | 10 seconds |
| Handler | `lambda_function.lambda_handler` |
| Architecture | x86_64 |
| Deployment | Zip upload (lambda.zip) |
| Environment Variables | `S3_BUCKET=argus-register-361274344489` |

### Endpoints Handled
| Method | Path | Purpose |
|--------|------|---------|
| POST | /register | Register new edge device |
| GET | /nodes | List all registered devices with status |
| POST | /calibrate | Submit corner calibration (gyro + image) |
| GET | /calibrations | Get calibration gyro metadata |
| POST | /rssi | Store RSSI measurements |
| GET | /rssi | Get all RSSI data |
| GET | /status | Get current system phase |
| POST | /deploy | Trigger scanning phase |
| POST | /reset | Clear all state + calibration images |

---

## 2. API Gateway

| Property | Value |
|----------|-------|
| API ID | `ksxaeu4eb8` |
| Type | HTTP API (v2) |
| Endpoint | `https://ksxaeu4eb8.execute-api.us-east-1.amazonaws.com` |
| Protocol | HTTPS |
| Stage | `$default` (auto-deploy) |
| Integration | Lambda (argus-register) |
| Route | `$default` → Lambda |
| CORS | Enabled (Allow-Origin: *) |

---

## 3. Amazon S3

| Property | Value |
|----------|-------|
| Bucket Name | `argus-register-361274344489` |
| ARN | `arn:aws:s3:::argus-register-361274344489` |
| Region | us-east-1 |
| Versioning | Disabled |
| Encryption | SSE-S3 (AES-256) |
| Public Access | Blocked (OAI only for static assets) |
| Lifecycle Rules | 1-day expiration on state files |

### Storage Layout
```
argus-register-361274344489/
├── index.html              # Edge device SPA
├── assets/                 # Vite build output (JS/CSS)
├── _nodes.json             # Device registry state
├── _calibrations.json      # Calibration metadata (gyro per corner)
├── _rssi.json              # RSSI measurement data
├── _status.json            # System phase state
└── calibration/            # Calibration images
    ├── {nodeId}/
    │   ├── corner_0.jpg
    │   ├── corner_1.jpg
    │   ├── corner_2.jpg
    │   └── corner_3.jpg
    └── ...
```

---

## 4. CloudFront

| Property | Value |
|----------|-------|
| Distribution ID | `E3DVUUV9HWT05Z` |
| Domain | `dcaloltnto1d8.cloudfront.net` |
| Origin | S3 (argus-register-361274344489) |
| Origin Access | OAI (Origin Access Identity) |
| SSL Certificate | Default CloudFront certificate |
| Price Class | PriceClass_100 (US, Canada, Europe) |
| Default Root Object | `index.html` |
| Error Pages | 403/404 → /index.html (SPA routing) |
| Cache Policy | Managed-CachingOptimized |
| TTL | Default 86400s (1 day) |

---

## 5. Amazon ECR

| Property | Value |
|----------|-------|
| Repository | `argus-register` (created but unused) |
| Status | Empty — deployment uses zip upload to Lambda |
| Notes | Created during initial Docker-based approach, not actively used |

---

## 6. AWS CodeBuild

| Property | Value |
|----------|-------|
| Project | Attempted during initial setup |
| Status | Not actively used |
| Notes | Build/deploy handled via CLI (aws s3 sync, aws lambda update-function-code) |

---

## 7. IAM

### Lambda Execution Role
| Property | Value |
|----------|-------|
| Role Name | `argus-lambda-role` |
| ARN | `arn:aws:iam::361274344489:role/argus-lambda-role` |
| Trust Policy | Lambda service (`lambda.amazonaws.com`) |

### Attached Policies
| Policy | Purpose |
|--------|---------|
| AWSLambdaBasicExecutionRole | CloudWatch Logs |
| Custom S3 policy | Read/Write to `argus-register-361274344489` |

### S3 Policy (inline)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::argus-register-361274344489",
        "arn:aws:s3:::argus-register-361274344489/*"
      ]
    }
  ]
}
```
