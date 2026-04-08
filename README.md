# node-red-contrib-viewtron

Viewtron AI camera node for Node-RED node received AI detection events from [Viewtron IP cameras](https://www.cctvcamerapros.com/AI-security-cameras-s/1512.htm). License plate recognition (LPR/ALPR), human detection, vehicle detection, face detection, people counting, and intrusion detection — all processed on the camera with no cloud service required.

![Viewtron AI Camera node in Node-RED with live LPR events](https://videos.cctvcamerapros.com/wp-content/files/Node-RED-LPR-camera-integration.jpg)

## Install

In Node-RED: **Menu > Manage palette > Install** > search `node-red-contrib-viewtron`

Or via command line:

```bash
cd ~/.node-red
npm install node-red-contrib-viewtron
```

## How It Works

Viewtron AI cameras process detection on-device and push HTTP POST events when they detect a license plate, person, vehicle, or face. The **Viewtron AI Camera** node receives those events directly, parses the XML, and outputs structured JSON messages to your flow.

```
Viewtron Camera --> HTTP POST (XML) --> Viewtron AI Camera node --> JSON msg --> Your Flow
```

No middleware, no bridge, no cloud API. The node listens on a configurable port and the camera posts directly to it.

## Camera Setup

### 1. Add the node to your flow

Drag the **Viewtron AI Camera** node from the palette onto the canvas and set the listen port.

### 2. Configure HTTP POST on the camera

Open your camera's web interface and navigate to **Network > Advanced > HTTP Notification**.

![Viewtron camera HTTP POST settings](https://videos.cctvcamerapros.com/wp-content/files/IP-camera-HTTP-Post-Settings.jpg)

Set the **Push Protocol Version** to **V1**, then click **Add** to create a server entry.

### 3. Configure the server connection

![HTTP POST server configuration](https://videos.cctvcamerapros.com/wp-content/files/IP-camera-HTTP-Post-Server.jpg)

| Setting | Value |
|---------|-------|
| **Enable** | Checked |
| **Domain/IP** | Your Node-RED machine's IP address |
| **Server Port** | Port configured in the node (default: 5002) |
| **Path** | `/API` |
| **Connection Type** | Persistent connection |
| **Send Heartbeat** | Checked |
| **Heartbeat Interval** | 30 seconds |
| **Smart Alarm Data** | Check **Smart event data** |
| **Original picture** | Check to include full scene image in events |
| **Target picture** | Check to include cropped target image in events |
| **Smart Alarm Type** | Select the detection types you want (e.g., License Plate Detection) |

Click **Save**, then deploy your flow in Node-RED. Events start arriving immediately.

### Connection status

The camera maintains a persistent HTTP connection and sends heartbeats to confirm the server is reachable. The node status shows a green dot when listening and updates with the latest event data (e.g., plate number and status).

## Outputs

The node has 5 outputs, one per detection category:

| Output | Category | Key Fields |
|--------|----------|------------|
| 1 | **LPR** | `plate_number`, `plate_status` (Authorized / Blacklisted / Temporary / Unknown), `vehicle` (brand, color, type) |
| 2 | **Intrusion** | `target_type` (person, car, motorcycle), `event_id`, `status` |
| 3 | **Face** | `face.age`, `face.sex`, `face.glasses`, `face.mask` |
| 4 | **Counting** | `target_type`, `boundary` |
| 5 | **Other** | Video metadata and unclassified events |

Wire each output to the flow logic you need — separate handling for plates vs. people vs. faces.

### Common fields

Every event message includes:

| Field | Description |
|-------|-------------|
| `msg.payload.event_type` | Raw alarm type from camera (e.g., `VEHICE`, `PEA`) |
| `msg.payload.category` | Normalized category: `lpr`, `intrusion`, `face`, `counting`, `metadata` |
| `msg.payload.camera_ip` | IP address of the camera that sent the event |
| `msg.payload.timestamp` | Event timestamp from the camera |
| `msg.topic` | Set to `viewtron/{category}` for easy MQTT republishing |

### Images

When **Original picture** and **Target picture** are enabled on the camera, `msg.payload.source_image` (full scene) and `msg.payload.target_image` (cropped detection target) are included as base64 JPEG strings. With V1 protocol, images are included automatically when the camera is configured to send them. These payloads can be large (300KB+) — leave unchecked if you only need the detection data.

The **Include images** checkbox on the node controls whether the node passes images through to the output or strips them.

## Example: LPR Gate Access

Import this flow to get started with license plate gate access control. The Viewtron AI Camera node reads plates, and a Switch node routes authorized vehicles to one action and unknown vehicles to another.

```json
[
    {
        "id": "viewtron1",
        "type": "viewtron-camera",
        "name": "Gate Camera",
        "port": "5002",
        "includeImages": false,
        "wires": [["switch1"], [], [], [], []]
    },
    {
        "id": "switch1",
        "type": "switch",
        "name": "Authorized?",
        "property": "payload.plate_status",
        "rules": [
            {"t": "eq", "v": "Authorized"},
            {"t": "eq", "v": "Unknown"}
        ],
        "outputs": 2,
        "wires": [["gate_open"], ["notify"]]
    },
    {
        "id": "gate_open",
        "type": "debug",
        "name": "Open Gate"
    },
    {
        "id": "notify",
        "type": "debug",
        "name": "Alert: Unknown Vehicle"
    }
]
```

## Plate Status

The camera maintains an on-device plate database. Each detected plate is matched against the database and assigned a status:

| Status | Meaning |
|--------|---------|
| **Authorized** | Plate is on the camera's allow list |
| **Blacklisted** | Plate is on the camera's block list |
| **Temporary** | Plate is on a temporary list with a valid date range |
| **Unknown** | Plate is not in the database, or a temporary plate's date range has expired |

Plates are added to the camera's database through its web interface or via the [Viewtron API](https://videos.cctvcamerapros.com/developer/docs/api-reference/smart-detection/license-plate-recognition-config/).

## Supported Event Types

### IPC v1.x (Direct from Camera)

| Alarm Type | Category | Detection |
|-----------|----------|-----------|
| `VEHICE` / `VEHICLE` | lpr | License plate recognition |
| `VFD` | face | Face detection |
| `PEA` | intrusion | Perimeter intrusion |
| `AOIENTRY` | zone_entry | Zone entry |
| `AOILEAVE` | zone_exit | Zone exit |
| `LOITER` | loitering | Loitering detection |
| `VSD` | metadata | Video metadata |
| `PASSLINECOUNT` | counting | People/vehicle counting |

### NVR v2.0 (Forwarded via NVR)

| Alarm Type | Category | Detection |
|-----------|----------|-----------|
| `vehicle` | lpr | LPR with vehicle brand, color, type, model |
| `videoFaceDetect` | face | Face with age, sex, glasses, mask attributes |
| `regionIntrusion` | intrusion | Perimeter intrusion |
| `lineCrossing` | line_crossing | Tripwire line crossing |
| `targetCountingByLine` | counting | Counting by line |
| `targetCountingByArea` | counting | Counting by area |
| `videoMetadata` | metadata | Continuous object detection |

Version detection is automatic — the node handles both formats.

## Node Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Port** | 5002 | HTTP listener port for camera events |
| **Include images** | Off | Pass base64 JPEG images through to output (`source_image`, `target_image`) |

## Compatible Cameras

Any [Viewtron AI security camera](https://www.cctvcamerapros.com/AI-security-cameras-s/1512.htm) or [NVR](https://www.cctvcamerapros.com/IP-Camera-NVRs-s/1472.htm) with HTTP POST support:

- [LPR-IP4](https://www.cctvcamerapros.com/LPR-Camera-p/lpr-ip4.htm) — 4MP LPR camera with on-camera plate recognition
- [AI security cameras](https://www.cctvcamerapros.com/AI-security-cameras-s/1512.htm) — person, vehicle, and face detection
- [NVRs](https://www.cctvcamerapros.com/IP-Camera-NVRs-s/1472.htm) — forward events from all connected cameras

All Viewtron products are NDAA compliant.

## Documentation

- [Viewtron API Developer Docs](https://videos.cctvcamerapros.com/developer/) — full API reference
- [HTTP POST Setup Guide](https://videos.cctvcamerapros.com/support/topic/ip-camera-api-webbooks) — camera configuration walkthrough with screenshots
- [Python SDK](https://videos.cctvcamerapros.com/developer/docs/getting-started/python-sdk/) — `pip install viewtron` for Python projects
- [Home Assistant Integration](https://videos.cctvcamerapros.com/developer/docs/integrations/home-assistant/) — MQTT bridge for Home Assistant

## Related Projects

- [viewtron-home-assistant](https://github.com/mikehaldas/viewtron-home-assistant) — Home Assistant integration via MQTT
- [viewtron-python-sdk](https://github.com/mikehaldas/viewtron-python-sdk) — Python SDK (`pip install viewtron`)
- [IP-Camera-API](https://github.com/mikehaldas/IP-Camera-API) — API documentation, XML examples, Docusaurus site

## Author

Mike Haldas — [CCTV Camera Pros](https://www.cctvcamerapros.com)
