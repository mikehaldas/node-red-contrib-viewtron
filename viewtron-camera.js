/**
 * node-red-contrib-viewtron
 *
 * Receive AI detection events from Viewtron IP cameras and NVRs.
 * The camera sends HTTP POST with XML payloads when it detects
 * license plates, people, vehicles, or faces. This node parses
 * those events and outputs structured JSON messages.
 *
 * Supports both IPC v1.x (direct from camera) and NVR v2.0
 * (forwarded via NVR) event formats. Version detection is automatic.
 *
 * https://videos.cctvcamerapros.com/developer/
 * https://github.com/mikehaldas/node-red-contrib-viewtron
 *
 * Written by Mike Haldas — CCTV Camera Pros
 */

const http = require("http");
const { XMLParser } = require("fast-xml-parser");

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

// Success response to keep the camera's HTTP connection alive
const SUCCESS_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<config version="1.0" xmlns="http://www.ipc.com/ver10">' +
  "<status>success</status></config>";

// IPC v1.x alarm types
const IPC_TYPES = {
  VEHICE: "lpr",
  VEHICLE: "lpr",
  VFD: "face",
  PEA: "intrusion",
  AOIENTRY: "zone_entry",
  AOILEAVE: "zone_exit",
  LOITER: "loitering",
  VSD: "metadata",
  PASSLINECOUNT: "counting",
};

// NVR v2.0 alarm types
const NVR_TYPES = {
  vehicle: "lpr",
  videoFaceDetect: "face",
  regionIntrusion: "intrusion",
  lineCrossing: "line_crossing",
  targetCountingByLine: "counting",
  targetCountingByArea: "counting",
  videoMetadata: "metadata",
};

// Target type mapping (IPC v1.x uses numbers)
const TARGET_TYPES = { 1: "person", 2: "car", 4: "motorcycle" };

module.exports = function (RED) {
  function ViewtronCameraNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const port = parseInt(config.port) || 5002;
    const includeImages = config.includeImages !== false;

    let server = null;
    const connectedCameras = {};

    // ==================== XML PARSING ====================

    function getText(val) {
      if (val == null) return "";
      if (typeof val === "object") {
        return String(val["#text"] || "").trim();
      }
      return String(val).trim();
    }

    function parseIPC(config, body) {
      const st = config.smartType;
      const alarmType = getText(st) || (typeof st === "string" ? st.trim() : "");

      if (!IPC_TYPES[alarmType]) return null;

      const category = IPC_TYPES[alarmType];
      const msg = {
        event_type: alarmType,
        category: category,
        timestamp: getText(config.currentTime),
      };

      // LPR — plate number and group
      if (category === "lpr") {
        const listInfo = config.listInfo;
        if (listInfo) {
          const items = Array.isArray(listInfo.item)
            ? listInfo.item
            : [listInfo.item];
          for (const item of items) {
            if (item.plateNumber) {
              msg.plate_number = getText(item.plateNumber);
              msg.plate_group = getText(item.vehicleListType);
            }
          }
        }
      }

      // Intrusion — zone polygon, target info
      if (category === "intrusion" || category === "zone_entry" || category === "zone_exit" || category === "loitering") {
        const perimeter = config.perimeter;
        if (perimeter && perimeter.perInfo) {
          const items = Array.isArray(perimeter.perInfo.item)
            ? perimeter.perInfo.item
            : [perimeter.perInfo.item];
          const info = items[0];
          if (info) {
            msg.event_id = getText(info.eventId);
            msg.target_id = getText(info.targetId);
            msg.status = getText(info.status);
          }
        }
        // Target type from listInfo
        const listInfo = config.listInfo;
        if (listInfo) {
          const items = Array.isArray(listInfo.item)
            ? listInfo.item
            : [listInfo.item];
          const target = items[0];
          if (target && target.targetImageData) {
            const tt = getText(target.targetImageData.targetType);
            msg.target_type = TARGET_TYPES[tt] || tt;
          }
        }
      }

      // Face — crop image
      if (category === "face") {
        // IPC v1.x face detection has minimal fields
        msg.event_description = "Face Detected";
      }

      // Images — base64 strings and decoded Buffer bytes
      if (includeImages) {
        // IPC puts overview in sourceDataInfo OR in listInfo item[0]
        const src = config.sourceDataInfo;
        if (src && src.sourceBase64Data) {
          const data = getText(src.sourceBase64Data);
          if (data && !data.startsWith("BASE64")) {
            msg.source_image = data;
            msg.source_image_bytes = Buffer.from(data, "base64");
          }
        }
        const listInfo = config.listInfo;
        if (listInfo) {
          const items = Array.isArray(listInfo.item)
            ? listInfo.item
            : [listInfo.item];
          if (items.length >= 2) {
            // Two items: first is overview, second is target crop
            const overview = items[0];
            if (!msg.source_image && overview && overview.targetImageData) {
              const data = getText(overview.targetImageData.targetBase64Data);
              if (data && !data.startsWith("BASE64")) {
                msg.source_image = data;
                msg.source_image_bytes = Buffer.from(data, "base64");
              }
            }
            const target = items[1];
            if (target && target.targetImageData) {
              const data = getText(target.targetImageData.targetBase64Data);
              if (data && !data.startsWith("BASE64")) {
                msg.target_image = data;
                msg.target_image_bytes = Buffer.from(data, "base64");
              }
            }
          } else if (items.length === 1) {
            // Single item — treat as target crop
            const item = items[0];
            if (item && item.targetImageData) {
              const data = getText(item.targetImageData.targetBase64Data);
              if (data && !data.startsWith("BASE64")) {
                msg.target_image = data;
                msg.target_image_bytes = Buffer.from(data, "base64");
              }
            }
          }
        }
      }

      return msg;
    }

    function parseNVR(config, body) {
      const msgType = getText(config.messageType);
      if (msgType !== "alarmData") return null;

      const alarmType = getText(config.smartType);
      if (!NVR_TYPES[alarmType]) return null;

      const category = NVR_TYPES[alarmType];
      const deviceInfo = config.deviceInfo || {};

      const msg = {
        event_type: alarmType,
        category: category,
        camera_name: getText(deviceInfo.deviceName),
        camera_ip: getText(deviceInfo.ip),
        camera_mac: getText(deviceInfo.mac),
        channel_id: getText(deviceInfo.channelId),
        timestamp: getText(config.currentTime),
      };

      // LPR — plate, vehicle attributes, and plate group
      if (category === "lpr" && config.licensePlateListInfo) {
        const items = Array.isArray(config.licensePlateListInfo.item)
          ? config.licensePlateListInfo.item
          : [config.licensePlateListInfo.item];
        const plate = items[0];
        if (plate) {
          const attr = plate.licensePlateAttribute || {};
          msg.plate_number = getText(attr.licensePlateNumber);
          msg.plate_color = getText(attr.color);
          const car = plate.carAttribute || {};
          if (getText(car.brand)) {
            msg.vehicle = {
              type: getText(car.carType),
              color: getText(car.color),
              brand: getText(car.brand),
              model: getText(car.model),
            };
          }
          const matchInfo = plate.licensePlateMatchInfo || {};
          msg.plate_group = getText(matchInfo.groupName);
          const owner = getText(matchInfo.carOwner);
          if (owner) msg.car_owner = owner;
        }
      }

      // Face — attributes
      if (category === "face" && config.faceListInfo) {
        const items = Array.isArray(config.faceListInfo.item)
          ? config.faceListInfo.item
          : [config.faceListInfo.item];
        const face = items[0];
        if (face) {
          msg.face = {
            age: getText(face.age),
            sex: getText(face.sex),
            glasses: getText(face.glasses),
            mask: getText(face.mask),
          };
        }
      }

      // Intrusion / line crossing — event info and target type
      if (
        category === "intrusion" ||
        category === "line_crossing" ||
        category === "counting"
      ) {
        const eventInfo = config.eventInfo;
        if (eventInfo) {
          const items = Array.isArray(eventInfo.item)
            ? eventInfo.item
            : [eventInfo.item];
          const ev = items[0];
          if (ev) {
            msg.event_id = getText(ev.eventId);
            msg.target_id = getText(ev.targetId);
            msg.boundary = getText(ev.boundary);
          }
        }
        const targetList = config.targetListInfo;
        if (targetList) {
          const items = Array.isArray(targetList.item)
            ? targetList.item
            : [targetList.item];
          const target = items[0];
          if (target) {
            msg.target_type = getText(target.targetType);
          }
        }
      }

      // Images — base64 strings and decoded Buffer bytes
      if (includeImages) {
        const src = config.sourceDataInfo;
        if (src && src.sourceBase64Data) {
          const data = getText(src.sourceBase64Data);
          if (data && !data.startsWith("BASE64")) {
            msg.source_image = data;
            msg.source_image_bytes = Buffer.from(data, "base64");
          }
        }
        // Target image from various list structures
        for (const listKey of [
          "targetListInfo",
          "licensePlateListInfo",
          "faceListInfo",
        ]) {
          const list = config[listKey];
          if (list) {
            const items = Array.isArray(list.item) ? list.item : [list.item];
            const item = items[0];
            if (item && item.targetImageData) {
              const data = getText(item.targetImageData.targetBase64Data);
              if (data && !data.startsWith("BASE64")) {
                msg.target_image = data;
                msg.target_image_bytes = Buffer.from(data, "base64");
                break;
              }
            }
          }
        }
      }

      return msg;
    }

    // ==================== HTTP SERVER ====================

    function handleRequest(req, res) {
      // Send success response immediately (keeps camera connection alive)
      res.writeHead(200, {
        "Content-Type": "application/xml",
        "Content-Length": Buffer.byteLength(SUCCESS_XML),
      });
      res.end(SUCCESS_XML);

      if (req.method !== "POST") return;

      const MAX_BODY = 5 * 1024 * 1024; // 5MB
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY) {
          body = "";
          req.destroy();
        }
      });
      req.on("end", () => {
        // Keepalive — empty body, keepalive messageType, or deviceInfo-only (no smartType)
        if (!body || body.length === 0 || body.includes("<messageType>keepalive</messageType>") ||
            (body.toLowerCase().includes("<deviceinfo>") && !body.includes("smartType"))) {
          const ip = req.socket.remoteAddress?.replace("::ffff:", "") || "unknown";
          if (!connectedCameras[ip]) {
            connectedCameras[ip] = true;
            node.log(`Camera connected: ${ip}`);
          }
          return;
        }

        if (!body.includes("<?xml")) return;

        // Skip traject (high-volume continuous tracking data)
        if (body.includes('<traject type="list"')) return;

        // Skip alarmStatus (just alarm on/off, no detection data)
        if (body.includes("alarmStatusInfo")) return;

        try {
          const parsed = xmlParser.parse(body);
          const xmlConfig = parsed.config;
          if (!xmlConfig) return;

          const version = xmlConfig["@_version"] || "";
          let event = null;
          let cameraIP =
            req.socket.remoteAddress?.replace("::ffff:", "") || "unknown";

          if (version.startsWith("2")) {
            event = parseNVR(xmlConfig, body);
            if (event && event.camera_ip) cameraIP = event.camera_ip;
          } else {
            event = parseIPC(xmlConfig, body);
          }

          if (!event) return;

          // Add source IP if not already set
          if (!event.camera_ip) event.camera_ip = cameraIP;

          // Build Node-RED message
          const msg = {
            payload: event,
            topic: `viewtron/${event.category}`,
          };

          // Add separate outputs by category
          const outputs = {
            lpr: null,
            intrusion: null,
            face: null,
            counting: null,
            other: null,
          };

          const cat = event.category;
          if (cat === "lpr") outputs.lpr = msg;
          else if (
            cat === "intrusion" ||
            cat === "zone_entry" ||
            cat === "zone_exit" ||
            cat === "loitering" ||
            cat === "line_crossing"
          )
            outputs.intrusion = msg;
          else if (cat === "face") outputs.face = msg;
          else if (cat === "counting") outputs.counting = msg;
          else outputs.other = msg;

          // Send to all outputs: [lpr, intrusion, face, counting, other]
          node.send([
            outputs.lpr,
            outputs.intrusion,
            outputs.face,
            outputs.counting,
            outputs.other,
          ]);

          // Update node status
          const statusText =
            cat === "lpr"
              ? `${event.plate_number} (${event.plate_group || "unknown"})`
              : cat === "face"
              ? `Face: ${event.face?.age || ""} ${event.face?.sex || ""}`
              : `${event.event_type}: ${event.target_type || cat}`;

          node.status({
            fill: "green",
            shape: "dot",
            text: statusText,
          });
        } catch (err) {
          node.error("Parse error: " + err.message);
          node.status({ fill: "red", shape: "ring", text: "parse error" });
        }
      });
    }

    // ==================== LIFECYCLE ====================

    try {
      server = http.createServer(handleRequest);
      // Camera sends heartbeats every 30s — keep connections alive long enough
      server.keepAliveTimeout = 60000;
      server.headersTimeout = 65000;
      server.listen(port, () => {
        node.log(`Listening on port ${port}`);
        node.status({
          fill: "green",
          shape: "ring",
          text: `listening on :${port}`,
        });
      });

      server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          node.error(`Port ${port} is already in use`);
          node.status({
            fill: "red",
            shape: "ring",
            text: `port ${port} in use`,
          });
        } else {
          node.error("Server error: " + err.message);
          node.status({ fill: "red", shape: "ring", text: "server error" });
        }
      });
    } catch (err) {
      node.error("Failed to start server: " + err.message);
      node.status({ fill: "red", shape: "ring", text: "failed to start" });
    }

    node.on("close", function (done) {
      if (server) {
        server.close(() => {
          node.log("Server stopped");
          done();
        });
      } else {
        done();
      }
    });
  }

  RED.nodes.registerType("viewtron-camera", ViewtronCameraNode);
};
