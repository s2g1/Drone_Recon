import json
import uuid
import time
import boto3
import base64
import os

# S3 persistence
BUCKET = os.environ.get("S3_BUCKET", "argus-register-361274344489")
s3 = boto3.client("s3")

NODES_KEY = "_nodes.json"
CALIBRATIONS_KEY = "_calibrations.json"
RSSI_KEY = "_rssi.json"
STATUS_KEY = "_status.json"


def _s3_read(key, default=None):
    try:
        obj = s3.get_object(Bucket=BUCKET, Key=key)
        return json.loads(obj["Body"].read().decode("utf-8"))
    except Exception:
        return default if default is not None else {}


def _s3_write(key, data):
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=json.dumps(data).encode("utf-8"),
        ContentType="application/json",
    )


def lambda_handler(event, context):
    method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = event.get("path") or event.get("rawPath", "/")

    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    }

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    # ─── POST /register ───
    if path == "/register" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        node_id = str(uuid.uuid4())
        nodes = _s3_read(NODES_KEY, {})
        node = {
            "nodeId": node_id,
            "ip": body.get("ip", "0.0.0.0"),
            "deviceType": body.get("deviceType", "unknown"),
            "userAgent": body.get("userAgent", ""),
            "capabilities": body.get("capabilities", {}),
            "status": "REGISTERED",
            "registeredAt": int(time.time() * 1000),
            "calibrationProgress": 0,
            "lastSeen": int(time.time() * 1000),
        }
        nodes[node_id] = node
        _s3_write(NODES_KEY, nodes)
        return {"statusCode": 200, "headers": headers, "body": json.dumps(node)}

    # ─── GET /nodes ───
    if path == "/nodes" and method == "GET":
        nodes = _s3_read(NODES_KEY, {})
        calibrations = _s3_read(CALIBRATIONS_KEY, {})
        node_list = []
        for nid, node in nodes.items():
            cal_data = calibrations.get(nid, {})
            corners_done = len([k for k, v in cal_data.items() if v is not None])
            node["calibrationProgress"] = corners_done
            if corners_done >= 4:
                node["status"] = "CALIBRATED"
            elif corners_done > 0:
                node["status"] = "CALIBRATING"
            # Preserve DEPLOYED/DISCONNECTED if already set
            elif node.get("status") not in ("DEPLOYED", "DISCONNECTED"):
                node["status"] = "REGISTERED"
            node_list.append(node)
        return {"statusCode": 200, "headers": headers, "body": json.dumps(node_list)}

    # ─── POST /calibrate ───
    if path == "/calibrate" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        node_id = body.get("nodeId", "")
        corner = body.get("corner", 0)
        gyro = body.get("gyro", {"alpha": 0, "beta": 0, "gamma": 0})
        timestamp = body.get("timestamp", int(time.time() * 1000))
        image_b64 = body.get("image", None)

        # Store image to S3 as separate object if provided
        if image_b64:
            try:
                image_data = base64.b64decode(image_b64)
                image_key = f"calibration/{node_id}/corner_{corner}.jpg"
                s3.put_object(
                    Bucket=BUCKET,
                    Key=image_key,
                    Body=image_data,
                    ContentType="image/jpeg",
                )
            except Exception:
                pass  # Non-fatal: store metadata even if image fails

        calibrations = _s3_read(CALIBRATIONS_KEY, {})
        if node_id not in calibrations:
            calibrations[node_id] = {}

        calibrations[node_id][str(corner)] = {
            "corner": corner,
            "gyro": gyro,
            "timestamp": timestamp,
            "hasImage": image_b64 is not None,
        }

        _s3_write(CALIBRATIONS_KEY, calibrations)

        # Update node status and lastSeen
        nodes = _s3_read(NODES_KEY, {})
        if node_id in nodes:
            corners_done = len([k for k, v in calibrations[node_id].items() if v is not None])
            nodes[node_id]["calibrationProgress"] = corners_done
            nodes[node_id]["lastSeen"] = int(time.time() * 1000)
            if corners_done >= 4:
                nodes[node_id]["status"] = "CALIBRATED"
            else:
                nodes[node_id]["status"] = "CALIBRATING"
            _s3_write(NODES_KEY, nodes)

        progress = len([k for k, v in calibrations[node_id].items() if v is not None])
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"nodeId": node_id, "corner": corner, "progress": progress}),
        }

    # ─── GET /calibrations ───
    if path == "/calibrations" and method == "GET":
        # Return gyro metadata only (no images) to keep response small
        calibrations = _s3_read(CALIBRATIONS_KEY, {})
        return {"statusCode": 200, "headers": headers, "body": json.dumps(calibrations)}

    # ─── POST /rssi ───
    if path == "/rssi" and method == "POST":
        body = json.loads(event.get("body") or "{}")
        from_node_id = body.get("fromNodeId", body.get("nodeId", ""))
        measurements = body.get("measurements", [])
        timestamp = body.get("timestamp", int(time.time() * 1000))

        rssi_data = _s3_read(RSSI_KEY, {})
        rssi_data[from_node_id] = {
            "fromNodeId": from_node_id,
            "measurements": measurements,
            "timestamp": timestamp,
        }
        _s3_write(RSSI_KEY, rssi_data)

        # Update node status
        nodes = _s3_read(NODES_KEY, {})
        if from_node_id in nodes:
            nodes[from_node_id]["status"] = "DEPLOYED"
            nodes[from_node_id]["lastSeen"] = int(time.time() * 1000)
            _s3_write(NODES_KEY, nodes)

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({"fromNodeId": from_node_id, "stored": len(measurements)}),
        }

    # ─── GET /rssi ───
    if path == "/rssi" and method == "GET":
        rssi_data = _s3_read(RSSI_KEY, {})
        return {"statusCode": 200, "headers": headers, "body": json.dumps(rssi_data)}

    # ─── GET /rssi-data (alias) ───
    if path == "/rssi-data" and method == "GET":
        rssi_data = _s3_read(RSSI_KEY, {})
        return {"statusCode": 200, "headers": headers, "body": json.dumps(rssi_data)}

    # ─── GET /status ───
    if path == "/status" and method == "GET":
        status = _s3_read(STATUS_KEY, {"phase": "register"})
        return {"statusCode": 200, "headers": headers, "body": json.dumps(status)}

    # ─── POST /deploy ───
    if path == "/deploy" and method == "POST":
        status = {"phase": "scanning", "timestamp": int(time.time() * 1000)}
        _s3_write(STATUS_KEY, status)

        # Mark all calibrated nodes as DEPLOYED
        nodes = _s3_read(NODES_KEY, {})
        for nid, node in nodes.items():
            if node.get("status") == "CALIBRATED":
                node["status"] = "DEPLOYED"
        _s3_write(NODES_KEY, nodes)

        return {"statusCode": 200, "headers": headers, "body": json.dumps(status)}

    # ─── POST /reset ───
    if path == "/reset" and method == "POST":
        # Delete state files
        for key in [NODES_KEY, CALIBRATIONS_KEY, RSSI_KEY, STATUS_KEY]:
            try:
                s3.delete_object(Bucket=BUCKET, Key=key)
            except Exception:
                pass

        # Clean up calibration images
        try:
            paginator = s3.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=BUCKET, Prefix="calibration/"):
                objects = page.get("Contents", [])
                if objects:
                    s3.delete_objects(
                        Bucket=BUCKET,
                        Delete={"Objects": [{"Key": obj["Key"]} for obj in objects]},
                    )
        except Exception:
            pass

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
