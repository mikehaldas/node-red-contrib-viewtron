#!/usr/bin/env node
/**
 * Viewtron Debug Server — logs every HTTP POST from cameras and NVRs.
 *
 * Dumps raw headers, body preview, and connection info for troubleshooting.
 * No parsing, no filtering — shows everything the camera sends.
 *
 * Usage: node debug-server.js [port]
 * Default port: 5002
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.argv[2]) || 5002;
const RAW_DIR = path.join(__dirname, "raw_posts");

if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR);

const SUCCESS_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<config version="1.0" xmlns="http://www.ipc.com/ver10">' +
  "<status>success</status></config>";

let postCount = 0;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "application/xml",
    "Content-Length": Buffer.byteLength(SUCCESS_XML),
  });
  res.end(SUCCESS_XML);

  const ip = req.socket.remoteAddress?.replace("::ffff:", "") || "unknown";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -1);

  if (req.method !== "POST") {
    console.log(`[${ts}] ${req.method} ${req.url} from ${ip}`);
    return;
  }

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
    postCount++;
    const len = body.length;

    // Classify the post
    let type = "unknown";
    if (len === 0) type = "keepalive (empty)";
    else if (body.includes("<messageType>keepalive</messageType>")) type = "keepalive (xml)";
    else if (body.includes("alarmStatusInfo")) type = "alarm status";
    else if (body.includes('<traject type="list"')) type = "traject";
    else if (body.includes("alarmData")) type = "alarm data";
    else if (body.includes("smartType")) type = "smart event";
    else if (body.includes("<deviceInfo>") || body.includes("<deviceinfo>")) type = "device info";

    // Console output
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[#${postCount}] ${type} | ${len} bytes | from ${ip}`);
    console.log(`  Method: ${req.method} ${req.url}`);
    console.log(`  Headers: ${JSON.stringify(req.headers)}`);
    if (len > 0) {
      const preview = body.substring(0, 500).replace(/[\r\n]+/g, " ");
      console.log(`  Body: ${preview}${len > 500 ? "..." : ""}`);
    }

    // Save raw XML (skip empty keepalives)
    if (len > 0) {
      const safeIP = ip.replace(/\./g, "-");
      const filename = `${RAW_DIR}/raw_${ts}_${safeIP}.xml`;
      fs.writeFileSync(filename, body);
      console.log(`  Saved: ${filename}`);
    }
  });
});

server.keepAliveTimeout = 60000;
server.headersTimeout = 65000;

server.listen(PORT, () => {
  const ifaces = require("os").networkInterfaces();
  let lanIP = "127.0.0.1";
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        lanIP = iface.address;
        break;
      }
    }
  }
  console.log(`\nViewtron Debug Server`);
  console.log(`Listening on http://${lanIP}:${PORT}`);
  console.log(`Saving raw posts to ${RAW_DIR}/`);
  console.log(`Logging ALL requests — no filtering\n`);
});
