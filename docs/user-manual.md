# ARGUS User Manual

## Version 2.0 — Tactical Room Mapping System

---

## BMS Interface

![BMS Calibration Screen](../docs/screenshots/bms-calibration.png)

The BMS screen shows:
- **Corner markers (1-4)** — Large green numbered circles at screen corners for device calibration
- **QR Code** — Scan with any phone to register as an edge node
- **Device list** — Shows all registered nodes with status (REGISTERED/CALIBRATING/CALIBRATED/STALE)
- **DEPLOY button** — Activates all edge device cameras and RSSI scanning
- **RESET DEMO** — Clears all registered devices and state
- **CALIBRATE/MAP tabs** — Switch between registration view and live tactical map

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Operator (BMS) Workflow](#operator-bms-workflow)
3. [Edge Device User Workflow](#edge-device-user-workflow)
4. [System Reset Procedure](#system-reset-procedure)
5. [Troubleshooting](#troubleshooting)

---

## System Overview

ARGUS is a multi-device tactical room mapping system. An operator at the Battle Management System (BMS) coordinates edge devices (mobile phones) to calibrate room corners and execute a synchronized camera scan, producing a tactical map.

**Components:**
- **BMS Client**: Desktop web application for the operator
- **Edge Device Client**: Mobile web application for field devices
- **Cloud Backend**: AWS Lambda API for coordination

---

## Operator (BMS) Workflow

### Step 1: Open BMS Console

Open the BMS client in a desktop browser. The interface shows:
- Header with ARGUS BMS logo, CALIBRATE/MAP tabs, and device count
- Main area with QR code and device list
- Corner markers (1-4) positioned at room corners of the display

> **Screenshot description**: Dark tactical interface with green accent colors. Left panel shows a QR code in a white container. Right panel shows registered devices list with calibration status.

### Step 2: Register Edge Devices

1. Display the QR code on the BMS screen
2. Have edge device users scan the QR code with their phone cameras
3. Devices will appear in the "REGISTERED DEVICES" list as they connect
4. Status indicators:
   - **Yellow** dot: REGISTERED (awaiting calibration)
   - **Blue** dot: Calibrating (1-3 corners done)
   - **Green** dot: READY (4/4 corners calibrated)

> **Screenshot description**: Device list showing NODE-01 (GREEN, "4/4 READY"), NODE-02 (BLUE, "2/4"), NODE-03 (YELLOW, "REGISTERED").

### Step 3: Monitor Calibration

Watch the device list as edge device users calibrate their corners. Each device needs to mark all 4 room corners (TOP-LEFT, TOP-RIGHT, BOTTOM-RIGHT, BOTTOM-LEFT).

The physical corner markers (numbered 1-4) on the BMS display correspond to room corners that edge devices should point at.

### Step 4: Deploy

Once devices are calibrated, click the **▶ DEPLOY** button:
- The system enters scanning mode
- A 5-second countdown begins
- All edge devices activate cameras simultaneously
- After countdown, the system transitions to the tactical map

> **Screenshot description**: Deploy phase showing green pulsing circle, "DEPLOYING — Cameras Active" text, 5-second countdown, and list of recording devices.

### Step 5: View Tactical Map

After deployment completes, the MAP view shows:
- Room boundaries (green lines)
- Corner markers (TL, TR, BR, BL)
- Exit/door locations (blue dashed lines)
- Obstacles (red filled rectangles)
- Node positions (green dots with labels)
- Legend at bottom

Use the **CALIBRATE** and **MAP** tabs in the header to switch between views at any time.

> **Screenshot description**: Canvas-rendered tactical map with green room boundary, blue exit markers, red obstacle rectangles, and green node position dots.

### Step 6: Reset (Optional)

Click the **RESET DEMO** button (red, below the Deploy button on the Calibrate tab) to clear all devices and start fresh.

---

## Edge Device User Workflow

### Step 1: Scan QR Code

1. Open your phone's camera app
2. Point at the QR code displayed on the BMS screen
3. Tap the link that appears to open the ARGUS registration page

> **Screenshot description**: Phone camera viewfinder with QR code detected, showing a URL banner at the top.

### Step 2: Auto-Registration

The device automatically registers with the ARGUS network:
- A spinner shows "Registering..."
- Once connected, you'll see "Connecting to ARGUS network"
- Registration takes 1-2 seconds

> **Screenshot description**: Dark screen with green spinner and "Registering..." text.

### Step 3: Calibrate Room Corners

After registration, the camera activates and calibration begins:

1. **Camera shows live video feed** as the background
2. A semi-transparent overlay shows instructions
3. Point your device at **Corner 1 (TOP-LEFT)** of the room
4. Tap **MARK CORNER**
5. Repeat for corners 2 (TOP-RIGHT), 3 (BOTTOM-RIGHT), 4 (BOTTOM-LEFT)
6. Progress dots fill in as you complete each corner

> **Screenshot description**: Camera live feed with dark overlay. Shows "CALIBRATION" heading, corner instruction text, 4 progress dots (2 filled green, 2 empty), and green "MARK CORNER" button.

### Step 4: Standby

After all 4 corners are marked:
- You'll see "Calibrated ✓" with a green checkmark
- "Standing by for deploy" message
- Your device ID badge is displayed
- Wait for the operator to trigger DEPLOY

> **Screenshot description**: Dark screen with green checkmark, "Calibrated ✓" text, and device ID badge in blue.

### Step 5: Scanning

When the operator deploys:
- Your camera reactivates (full-screen live feed)
- "RECORDING" badge with red dot appears top-left
- Countdown timer (5s) appears top-right
- Hold your device steady pointed at the room

> **Screenshot description**: Full-screen camera view with "● RECORDING" badge and "5s" countdown overlay.

### Step 6: Complete

After the countdown:
- Camera stops
- "Scan complete" confirmation appears
- "Data captured" message displays

> **Screenshot description**: Dark screen with green checkmark and "Scan complete" text.

---

## System Reset Procedure

### Method 1: BMS RESET DEMO Button

1. Navigate to the **CALIBRATE** tab in the BMS
2. Click the red **RESET DEMO** button below the Deploy button
3. This clears all registered devices from the backend and local state
4. Edge devices will need to re-register (refresh their browser)

### Method 2: API Reset

Send a POST request directly to the reset endpoint:
```
POST https://ksxaeu4eb8.execute-api.us-east-1.amazonaws.com/reset
```

No request body needed.

### Method 3: Lambda Cold Start

The Lambda function uses in-memory storage. If the function goes cold (no requests for ~15 minutes), all state is automatically cleared.

---

## Troubleshooting

### Edge Device Issues

| Problem | Solution |
|---------|----------|
| QR code won't scan | Ensure good lighting; try moving closer/further from screen |
| "Registration Failed" error | Check internet connection; try refreshing the page |
| Camera not working | Grant camera permission when prompted; check browser settings |
| Stuck on "Registering..." | Backend may be cold-starting; wait 5-10 seconds and refresh |
| Camera feed is black | Some browsers block camera on HTTP; ensure HTTPS connection |

### BMS Issues

| Problem | Solution |
|---------|----------|
| No devices appearing | Ensure edge devices completed registration; check network |
| Calibration not updating | Poll interval is 2s; wait a moment for updates |
| Deploy button unresponsive | Click is always enabled; check browser console for errors |
| Map not rendering | Ensure canvas is supported; try refreshing |
| Tabs not switching | Click directly on tab text; ensure JavaScript is enabled |

### System Issues

| Problem | Solution |
|---------|----------|
| API returning 404 | Check the endpoint URL; ensure Lambda is deployed |
| All devices disappeared | Lambda cold-started and lost state; re-register devices |
| CORS errors in console | Ensure accessing via HTTPS; clear browser cache |
| Slow API response | Lambda cold start takes 1-2s; subsequent calls are fast |

---

## Quick Reference

| Action | How |
|--------|-----|
| Register device | Scan QR code on BMS screen |
| Calibrate | Point at corners, tap MARK (4 times) |
| Deploy scan | Click ▶ DEPLOY on BMS |
| View map | Click MAP tab on BMS |
| Reset system | Click RESET DEMO on BMS |
| Switch views | Use CALIBRATE / MAP tabs |
