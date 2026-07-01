# ARGUS — Autonomous Reconnaissance Ground Unit System

A real-time tactical mapping system that turns mobile phones into sensor nodes for indoor reconnaissance. Edge devices register via QR code, calibrate against reference points, and form a mesh network. The Battle Management Station (BMS) displays a live tactical map showing node positions, health status, RSSI mesh connectivity, and detected environmental features.

Built in a single session using AI-assisted development with Kiro.

![BMS Calibration Screen](docs/screenshots/bms-calibration.png)

## Demo

> Recording of live demo with multiple devices will be added here after testing.

![Live Demo](docs/screenshots/demo-recording.gif)

## How It Works

1. **Register** — Scan the QR code on the BMS screen from any phone. The device auto-registers with the ARGUS network.

2. **Calibrate** — Point your device camera at each of the 4 numbered corners on the BMS screen and tap MARK. The system captures gyro orientation and an image at each corner to compute the device's spatial position.

3. **Deploy** — The operator clicks DEPLOY on the BMS. All registered devices activate their cameras and begin continuous RSSI scanning every 2 seconds.

4. **Live Map** — The BMS tactical map shows all nodes in real-time. Green nodes are active (RSSI received within 6s). Red nodes are stale. RSSI proximity lines show mesh connectivity. Nodes move on the map as devices physically move (tracked via gyroscope). Plane detection warnings (wall/floor/table) appear as yellow indicators.

## Architecture

```
Edge Devices (phones)
    │
    ├── Register via HTTPS POST
    ├── Calibrate (image + gyro per corner)
    ├── RSSI ping every 2s (gyro + plane detection)
    │
    ▼
CloudFront (static SPA hosting)
    │
    ▼
API Gateway (HTTP API)
    │
    ▼
Lambda (Python 3.12) ──── S3 (state + images)
    │
    ▼
BMS (local browser) polls API every 2s
```

## Running Locally

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Start the server (BMS at http://localhost:3000/bms)
pnpm --filter @argus/server dev
```

## AWS Services Used

| Service | Purpose |
|---------|---------|
| Lambda | API backend (registration, calibration, RSSI, deploy) |
| API Gateway | HTTPS endpoint for edge devices |
| S3 | Static hosting + state persistence + calibration images |
| CloudFront | CDN for edge device web app |
| IAM | Service roles |

## Key URLs

| Component | URL |
|-----------|-----|
| BMS Display | http://localhost:3000/bms |
| Edge Device App | https://dcaloltnto1d8.cloudfront.net |
| API Endpoint | https://ksxaeu4eb8.execute-api.us-east-1.amazonaws.com |

## Documentation

See the `docs/` folder for:
- Network topology and data flow diagrams
- NIST 800-53 compliance mapping
- DISA STIG checklist
- Architecture Design Document (ADD)
- Version Description Document (VDD)
- User Manual
- Cost analysis
- AWS services specification

## Load Testing

For tomorrow's demo:
1. Open BMS on the presenter's screen
2. Have volunteers scan the QR code
3. Guide them through 4-corner calibration
4. Click DEPLOY — watch nodes appear and move on the tactical map
5. Screen record the map for the demo gif

### Creating the Demo GIF

After the demo, convert the screen recording to a gif:
```bash
ffmpeg -i recording.mp4 -vf "fps=10,scale=800:-1" docs/screenshots/demo-recording.gif
```

Use OBS or the built-in screen recorder to capture the live demo.

## Repository

https://github.com/s2g1/Drone_Recon
