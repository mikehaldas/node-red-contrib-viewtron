/**
 * Viewtron Server — Config Node
 *
 * Wraps ViewtronServer from the Viewtron SDK. Creates a shared HTTP
 * server that receives events from cameras. Multiple Viewtron AI Camera
 * listener nodes can share one server instance.
 *
 * Hidden from the palette (category: 'config'). Configured via the
 * server dropdown on the Viewtron AI Camera node.
 */

'use strict';

const { ViewtronServer } = require('viewtron');

module.exports = function (RED) {
  function ViewtronServerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    this.port = parseInt(config.port) || 5050;
    this.clients = [];
    this.server = null;

    // ==================== Client Management ====================

    this.addClient = function (clientNode) {
      node.clients.push(clientNode);
      // If server is already running, update the client's status
      if (node.server && node.server.connectedCameras.size > 0) {
        clientNode.status({
          fill: 'green',
          shape: 'ring',
          text: `listening on :${node.port}`,
        });
      }
    };

    this.removeClient = function (clientNode) {
      node.clients = node.clients.filter((c) => c !== clientNode);
    };

    this.broadcastStatus = function (status) {
      for (const client of node.clients) {
        client.status(status);
      }
    };

    // ==================== Server Lifecycle ====================

    this.server = new ViewtronServer({ port: this.port });

    this.server.on('connect', (clientIP) => {
      node.log(`Camera connected: ${clientIP}`);
      node.broadcastStatus({
        fill: 'green',
        shape: 'ring',
        text: `listening on :${node.port}`,
      });
    });

    this.server.on('event', (event, clientIP) => {
      for (const client of node.clients) {
        client.onEvent(event, clientIP);
      }
    });

    this.server.on('error', (err) => {
      node.error(`Server error: ${err.message}`);
      node.broadcastStatus({
        fill: 'red',
        shape: 'ring',
        text: err.code === 'EADDRINUSE' ? `port ${node.port} in use` : 'server error',
      });
    });

    this.server
      .start()
      .then(({ port, ip }) => {
        node.log(`Listening on ${ip}:${port}`);
        node.broadcastStatus({
          fill: 'green',
          shape: 'ring',
          text: `listening on :${port}`,
        });
      })
      .catch((err) => {
        node.error(`Failed to start server: ${err.message}`);
        node.broadcastStatus({
          fill: 'red',
          shape: 'ring',
          text: err.code === 'EADDRINUSE' ? `port ${node.port} in use` : 'failed to start',
        });
      });

    // ==================== Cleanup ====================

    node.on('close', function (done) {
      if (node.server) {
        node.server.stop().then(() => {
          node.log('Server stopped');
          done();
        });
      } else {
        done();
      }
    });
  }

  RED.nodes.registerType('viewtron-server', ViewtronServerNode);
};
