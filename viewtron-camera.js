/**
 * Viewtron AI Camera — Listener Node
 *
 * Receives parsed events from a Viewtron Server config node and routes
 * them to 5 category outputs. Multiple listener nodes can share one
 * server. All XML parsing and HTTP handling is done by the Viewtron SDK
 * via the config node — this node just routes and displays.
 *
 * https://videos.cctvcamerapros.com/developer/
 * https://github.com/mikehaldas/node-red-contrib-viewtron
 *
 * Written by Mike Haldas — CCTV Camera Pros
 */

'use strict';

module.exports = function (RED) {
  function ViewtronCameraNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

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
      // Build a plain object payload from the SDK event.
      // SDK events use class getters for image bytes which don't
      // survive Node-RED's message cloning — resolve them eagerly.
      const payload = {
        source: event.source,
        category: event.category,
        eventType: event.eventType,
        eventDescription: event.eventDescription,
        cameraName: event.cameraName,
        cameraIp: event.cameraIp || clientIP,
        cameraMac: event.cameraMac,
        channelId: event.channelId,
        timestamp: event.timestamp,
        // LPR
        plateNumber: event.plateNumber,
        plateColor: event.plateColor,
        plateGroup: event.plateGroup,
        carOwner: event.carOwner,
        vehicle: event.vehicle,
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

      const msg = {
        payload: payload,
        topic: `viewtron/${event.category}`,
      };

      // Route to output by category: [LPR, Intrusion, Face, Counting, Other]
      const outputs = [null, null, null, null, null];
      const cat = event.category;

      if (cat === 'lpr') {
        outputs[0] = msg;
      } else if (cat === 'intrusion') {
        outputs[1] = msg;
      } else if (cat === 'face') {
        outputs[2] = msg;
      } else if (cat === 'counting') {
        outputs[3] = msg;
      } else {
        outputs[4] = msg;
      }

      node.send(outputs);

      // Update node status with last event info
      let statusText;
      if (cat === 'lpr') {
        statusText = `${event.plateNumber} (${event.plateGroup || 'unknown'})`;
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
