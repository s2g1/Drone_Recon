import json
import uuid
import time

# In-memory storage (resets on cold start)
nodes = {}
calibrations = {}  # nodeId -> [corner0_ts, corner1_ts, ...]
system_phase = {"phase": "register"}


def lambda_handler(event, context):
    method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("path") or event.get("rawPath", "/")

    # CORS headers
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    }

    # Handle OPTIONS preflight
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    # POST /register
    if path == "/register" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        node_id = str(uuid.uuid4())
        node = {
            "nodeId": node_id,
            "ip": body.get("ip", "0.0.0.0"),
            "deviceType": body.get("deviceType", "unknown"),
            "userAgent": body.get("userAgent", ""),
            "capabilities": body.get("capabilities", {}),
            "status": "REGISTERED",
            "registeredAt": int(time.time() * 1000),
            "calibrationProgress": 0,
        }
        nodes[node_id] = node
        calibrations[node_id] = []
        return {"statusCode": 200, "headers": headers, "body": json.dumps(node)}

    # GET /nodes
    if path == "/nodes" and method == "GET":
        node_list = []
        for nid, node in nodes.items():
            node["calibrationProgress"] = len(calibrations.get(nid, []))
            node_list.append(node)
        return {"statusCode": 200, "headers": headers, "body": json.dumps(node_list)}

    # POST /calibrate
    if path == "/calibrate" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        node_id = body.get("nodeId", "")
        corner = body.get("corner", 0)
        timestamp = body.get("timestamp", int(time.time() * 1000))

        if node_id not in calibrations:
            calibrations[node_id] = []

        # Store corner calibration (append timestamp for corner index)
        while len(calibrations[node_id]) <= corner:
            calibrations[node_id].append(None)
        calibrations[node_id][corner] = timestamp

        # Update node calibration progress
        progress = sum(1 for c in calibrations[node_id] if c is not None)
        if node_id in nodes:
            nodes[node_id]["calibrationProgress"] = progress

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"nodeId": node_id, "corner": corner, "progress": progress}),
        }

    # GET /calibrations
    if path == "/calibrations" and method == "GET":
        result = {}
        for nid, corners in calibrations.items():
            result[nid] = [i for i, c in enumerate(corners) if c is not None]
        return {"statusCode": 200, "headers": headers, "body": json.dumps(result)}

    # GET /status
    if path == "/status" and method == "GET":
        return {"statusCode": 200, "headers": headers, "body": json.dumps(system_phase)}

    # POST /deploy
    if path == "/deploy" and method == "POST":
        system_phase["phase"] = "scanning"
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"phase": "scanning", "timestamp": int(time.time() * 1000)}),
        }

    # POST /reset — clears all in-memory state
    if path == "/reset" and method == "POST":
        nodes.clear()
        calibrations.clear()
        system_phase["phase"] = "register"
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"status": "reset", "timestamp": int(time.time() * 1000)}),
        }

    # 404
    return {
        "statusCode": 404,
        "headers": headers,
        "body": json.dumps({"error": "Not found", "path": path}),
    }
