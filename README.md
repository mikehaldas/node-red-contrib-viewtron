# node-red-contrib-viewtron

Node-RED node for receiving AI detection events from Viewtron IP cameras and NVRs. License plate recognition (LPR/ALPR), human detection, vehicle detection, face detection, people counting, and line crossing — all processed on the camera hardware with no cloud service required.

## Install

In Node-RED: **Menu > Manage palette > Install** > search `node-red-contrib-viewtron`

Or via command line:

```bash
cd ~/.node-red
npm install node-red-contrib-viewtron
```

## How It Works

Viewtron AI cameras run detection on-device and send HTTP POST events with XML payloads when they detect a license plate, person, vehicle, or face. This node receives those events, parses the XML, and outputs structured JSON messages into your flow.

```
Viewtron Camera → HTTP POST (XML) → node-red-contrib-viewtron → JSON msg → Your Flow
```

No bridge, no middleware, no cloud API. The node listens on a configurable port and handles everything.

## Camera Setup

1. Drag the **viewtron camera** node onto your flow canvas
2. Set the listen port (default: 5002)
3. In your camera's web interface: **Network > HTTP POST > Edit > Add**
   - Server IP: your Node-RED machine's IP
   - Port: 5002 (or your configured port)
   - Path: `/API`
4. Deploy the flow — events start arriving

## Outputs

The node has 5 outputs, one per detection category:

| Output | Category | Key Fields |
|--------|----------|------------|
| 1 | **LPR** | `plate_number`, `plate_status` (Authorized/Blacklisted/Temporary/Unknown), `vehicle` (brand, color, type — NVR v2.0) |
| 2 | **Intrusion** | `target_type` (person, car, motorcycle), `event_id`, `status` |
| 3 | **Face** | `face.age`, `face.sex`, `face.glasses`, `face.mask` (NVR v2.0) |
| 4 | **Counting** | `target_type`, `boundary` |
| 5 | **Other** | Video metadata and unclassified events |

Wire each output to the flow logic you need — separate handling for plates vs. people vs. faces.

## Example: LPR Gate Access

```json
[
    {
        "id": "viewtron1",
        "type": "viewtron-camera",
        "name": "Driveway LPR",
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

## Supported Event Types

### IPC v1.x (Direct from Camera)

| Alarm Type | Category | Detection |
|-----------|----------|-----------|
| `VEHICE` / `VEHICLE` | lpr | License plate recognition |
| `VFD` | face | Face detection |
| `PEA` | intrusion | Perimeter intrusion / line crossing |
| `AOIENTRY` | zone_entry | Zone entry |
| `AOILEAVE` | zone_exit | Zone exit |
| `LOITER` | loitering | Loitering detection |
| `VSD` | metadata | Video metadata (continuous detection) |
| `PASSLINECOUNT` | counting | People/vehicle counting |

### NVR v2.0 (Forwarded via NVR)

| Alarm Type | Category | Detection |
|-----------|----------|-----------|
| `vehicle` | lpr | LPR with vehicle brand, color, type, model |
| `videoFaceDetect` | face | Face detection with age, sex, glasses, mask |
| `regionIntrusion` | intrusion | Perimeter intrusion |
| `lineCrossing` | line_crossing | Tripwire line crossing |
| `targetCountingByLine` | counting | Counting by line |
| `targetCountingByArea` | counting | Counting by area |
| `videoMetadata` | metadata | Continuous object detection |

Version detection is automatic — the node handles both formats.

## Options

| Setting | Default | Description |
|---------|---------|-------------|
| **Port** | 5002 | HTTP listener port for camera events |
| **Include images** | Off | Include base64 JPEG images in output (`source_image`, `target_image`). These can be large — enable only if needed. |

## Compatible Cameras

Any [Viewtron AI security camera](https://www.cctvcamerapros.com/AI-security-cameras-s/1512.htm) or [NVR](https://www.cctvcamerapros.com/IP-Camera-NVRs-s/1472.htm) with HTTP POST support:

- [LPR-IP4](https://www.cctvcamerapros.com/LPR-Camera-p/lpr-ip4.htm) — 4MP LPR camera, on-camera ALPR
- [AI security cameras](https://www.cctvcamerapros.com/AI-security-cameras-s/1512.htm) — person/vehicle/face detection
- [NVRs](https://www.cctvcamerapros.com/IP-Camera-NVRs-s/1472.htm) — forward events from all connected cameras

All Viewtron products are NDAA compliant.

## Documentation

- [Viewtron API Developer Docs](https://videos.cctvcamerapros.com/developer/) — full API documentation portal
- [Python SDK](https://videos.cctvcamerapros.com/developer/docs/getting-started/python-sdk/) — `pip install viewtron` for Python projects
- [Home Assistant Integration](https://videos.cctvcamerapros.com/developer/docs/integrations/home-assistant/) — MQTT bridge for HA users
- [LPR Application Guide](https://videos.cctvcamerapros.com/developer/docs/applications/license-plate-recognition-camera-api/) — webhook formats and code examples

## Related Projects

- [viewtron-home-assistant](https://github.com/mikehaldas/viewtron-home-assistant) — HA integration via MQTT
- [viewtron-python-sdk](https://github.com/mikehaldas/viewtron-python-sdk) — Python SDK (`pip install viewtron`)
- [IP-Camera-API](https://github.com/mikehaldas/IP-Camera-API) — API server, XML examples, documentation

## Author

Mike Haldas — [CCTV Camera Pros](https://www.cctvcamerapros.com)
mike@cctvcamerapros.net
