/**
 * Viewtron AI Camera — Listener Node
 *
 * Receives parsed events from a Viewtron Server config node and routes
 * them to 5 category outputs. Multiple listener nodes can share one
 * server. All XML parsing and HTTP handling is done by the Viewtron SDK
 * via the config node — this node routes, optionally filters plates,
 * and displays.
 *
 * https://videos.cctvcamerapros.com/developer/
 * https://github.com/mikehaldas/node-red-contrib-viewtron
 *
 * Written by Mike Haldas — CCTV Camera Pros
 */

'use strict';

// Blank filters pass every plate. A set filter applies only to LPR.
function parseMinConfidence(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function lprAllowed(event, filters) {
  if (!event || event.category !== 'lpr') return true;

  if (filters.direction && event.direction !== filters.direction) return false;
  if (filters.plateList && event.plateList !== filters.plateList) return false;
  if (filters.minConfidence != null) {
    if (event.confidence == null || event.confidence < filters.minConfidence) return false;
  }
  return true;
}

function outputIndex(category) {
  if (category === 'lpr') return 0;
  if (category === 'intrusion') return 1;
  if (category === 'face') return 2;
  if (category === 'counting') return 3;
  return 4;
}

/**
 * Plain payload for a Node-RED message.
 * Image byte getters are resolved here so they survive message cloning.
 * `timestamp` stays the camera's raw currentTime text. `eventTime` is a Date.
 */
function eventToPayload(event, clientIP) {
  const eventTime = event.eventTime instanceof Date ? new Date(event.eventTime.getTime()) : null;

  return {
    source: event.source,
    category: event.category,
    eventType: event.eventType,
    eventDescription: event.eventDescription,
    configVersion: event.configVersion || '',
    format: event.format || '',
    cameraName: event.cameraName,
    cameraIp: event.cameraIp || clientIP,
    cameraMac: event.cameraMac,
    channelId: event.channelId,
    timestamp: event.timestamp,
    eventTime: eventTime,
    // LPR
    plateNumber: event.plateNumber,
    plateColor: event.plateColor,
    plateGroup: event.plateGroup,
    plateList: event.plateList ?? null,
    direction: event.direction ?? null,
    confidence: event.confidence ?? null,
    carOwner: event.carOwner,
    vehicle: event.vehicle,
    vehicleColor: event.vehicleColor || '',
    vehicleBrand: event.vehicleBrand || '',
    vehicleType: event.vehicleType || '',
    vehicleModel: event.vehicleModel || '',
    // Face
    face: event.face,
    // Detection
    eventId: event.eventId,
    targetId: event.targetId,
    targetType: event.targetType,
    status: event.status,
    boundary: event.boundary,
    // Images
    sourceImage: event.sourceImage || undefined,
    targetImage: event.targetImage || undefined,
    sourceImageBytes: event.sourceImageBytes || undefined,
    targetImageBytes: event.targetImageBytes || undefined,
    hasImages: event.hasImages,
  };
}

function lprStatusText(event) {
  let text = `${event.plateNumber} (${event.plateGroup || 'unknown'})`;
  if (event.direction) text += ` ${event.direction}`;
  if (event.confidence != null) text += ` ${event.confidence}`;
  return text;
}

module.exports = function (RED) {
  function ViewtronCameraNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const filters = {
      direction: String(config.direction || '').trim(),
      plateList: String(config.plateList || '').trim(),
      minConfidence: parseMinConfidence(config.minConfidence),
    };

    // Get reference to the shared server config node
    this.serverNode = RED.nodes.getNode(config.server);

    if (!this.serverNode) {
      node.status({ fill: 'red', shape: 'ring', text: 'no server configured' });
      return;
    }

    // Register with the config node to receive events
    this.serverNode.addClient(node);

    node.status({
      fill: 'green',
      shape: 'ring',
      text: `listening on :${this.serverNode.port}`,
    });

    // ==================== Event Handler ====================

    /**
     * Called by the config node when a parsed event arrives.
     * Converts the SDK event to a plain payload object and routes
     * to the appropriate output.
     */
    this.onEvent = function (event, clientIP) {
      if (!lprAllowed(event, filters)) {
        node.status({
          fill: 'grey',
          shape: 'ring',
          text: `filtered ${event.plateNumber || 'plate'}`,
        });
        return;
      }

      const payload = eventToPayload(event, clientIP);

      const msg = {
        payload: payload,
        topic: `viewtron/${event.category}`,
      };

      // Route to output by category: [LPR, Intrusion, Face, Counting, Other]
      const outputs = [null, null, null, null, null];
      outputs[outputIndex(event.category)] = msg;

      node.send(outputs);

      // Update node status with last event info
      let statusText;
      const cat = event.category;
      if (cat === 'lpr') {
        statusText = lprStatusText(event);
      } else if (cat === 'face') {
        statusText = `Face: ${event.face?.age || ''} ${event.face?.sex || ''}`;
      } else if (cat === 'intrusion' || cat === 'counting') {
        statusText = `${event.eventDescription}: ${event.targetType || cat}`;
      } else {
        statusText = event.eventDescription || event.eventType;
      }

      node.status({ fill: 'green', shape: 'dot', text: statusText });
    };

    // ==================== Cleanup ====================

    node.on('close', function (done) {
      if (node.serverNode) {
        node.serverNode.removeClient(node);
      }
      done();
    });
  }

  RED.nodes.registerType('viewtron-camera', ViewtronCameraNode);
};
