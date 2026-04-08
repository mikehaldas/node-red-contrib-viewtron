#!/usr/bin/env node
/**
 * Test script — runs the Viewtron node's parsing logic against
 * all example XML files without needing Node-RED installed.
 *
 * Usage: node test.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const EXAMPLES_DIR = path.join(__dirname, "..", "IP-Camera-API", "examples");
const PORT = 15002; // Use a high port to avoid conflicts

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

// Replicate the parsing logic from viewtron-camera.js for testing
function getText(val) {
  if (val == null) return "";
  if (typeof val === "object") return String(val["#text"] || "").trim();
  return String(val).trim();
}

const IPC_TYPES = {
  VEHICE: "lpr", VEHICLE: "lpr", VFD: "face", PEA: "intrusion",
  AOIENTRY: "zone_entry", AOILEAVE: "zone_exit", LOITER: "loitering",
  VSD: "metadata", PASSLINECOUNT: "counting",
};

const NVR_TYPES = {
  vehicle: "lpr", videoFaceDetect: "face", regionIntrusion: "intrusion",
  lineCrossing: "line_crossing", targetCountingByLine: "counting",
  targetCountingByArea: "counting", videoMetadata: "metadata",
};

function testFile(filepath) {
  const filename = path.basename(filepath);
  const xml = fs.readFileSync(filepath, "utf8");

  // Skip keepalives and alarm-status
  if (xml.includes("<DeviceInfo>") || xml.includes("<alarmStatus>")) {
    console.log(`  SKIP  ${filename} (keepalive/alarm-status)`);
    return;
  }

  if (!xml.includes("<?xml")) {
    console.log(`  SKIP  ${filename} (not XML)`);
    return;
  }

  try {
    const parsed = xmlParser.parse(xml);
    const config = parsed.config;
    if (!config) {
      console.log(`  SKIP  ${filename} (no <config> root)`);
      return;
    }

    const version = config["@_version"] || "";
    let category = null;
    let alarmType = null;
    let details = "";

    if (version.startsWith("2")) {
      const msgType = getText(config.messageType);
      alarmType = getText(config.smartType);
      category = NVR_TYPES[alarmType];

      if (category === "lpr" && config.licensePlateListInfo) {
        const items = Array.isArray(config.licensePlateListInfo.item)
          ? config.licensePlateListInfo.item : [config.licensePlateListInfo.item];
        const plate = items[0];
        const attr = plate?.licensePlateAttribute || {};
        details = `plate=${getText(attr.licensePlateNumber)}`;
        const car = plate?.carAttribute || {};
        if (getText(car.brand)) details += ` vehicle=${getText(car.brand)} ${getText(car.model)}`;
      }
      if (category === "face" && config.faceListInfo) {
        const items = Array.isArray(config.faceListInfo.item)
          ? config.faceListInfo.item : [config.faceListInfo.item];
        const face = items[0];
        if (face) details = `age=${getText(face.age)} sex=${getText(face.sex)}`;
      }
      if ((category === "intrusion" || category === "line_crossing" || category === "counting") && config.targetListInfo) {
        const items = Array.isArray(config.targetListInfo.item)
          ? config.targetListInfo.item : [config.targetListInfo.item];
        const target = items[0];
        if (target) details = `target=${getText(target.targetType)}`;
      }
    } else {
      const st = config.smartType;
      alarmType = getText(st) || (typeof st === "string" ? st.trim() : "");
      category = IPC_TYPES[alarmType];

      if (category === "lpr" && config.listInfo) {
        const items = Array.isArray(config.listInfo.item)
          ? config.listInfo.item : [config.listInfo.item];
        for (const item of items) {
          if (item.plateNumber) {
            details = `plate=${getText(item.plateNumber)} list=${getText(item.vehicleListType)}`;
          }
        }
      }
    }

    if (category) {
      console.log(`  PASS  ${filename}  →  type=${alarmType}  category=${category}  ${details}`);
    } else {
      console.log(`  SKIP  ${filename} (unrecognized type: ${alarmType})`);
    }
  } catch (err) {
    console.log(`  FAIL  ${filename}  →  ${err.message}`);
  }
}

// Run tests
console.log("\nTesting IPC v1.x examples:");
console.log("=".repeat(80));
const ipcDir = path.join(EXAMPLES_DIR, "ipc-v1x");
if (fs.existsSync(ipcDir)) {
  for (const file of fs.readdirSync(ipcDir).sort()) {
    if (file.endsWith(".xml")) testFile(path.join(ipcDir, file));
  }
}

console.log("\nTesting NVR v2.0 examples:");
console.log("=".repeat(80));
const nvrDir = path.join(EXAMPLES_DIR, "nvr-v2");
if (fs.existsSync(nvrDir)) {
  for (const file of fs.readdirSync(nvrDir).sort()) {
    if (file.endsWith(".xml")) testFile(path.join(nvrDir, file));
  }
}

console.log("\nDone.\n");
