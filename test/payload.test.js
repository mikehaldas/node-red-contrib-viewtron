'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { ViewtronEvent, ViewtronServer } = require('viewtron-sdk');

const FIXTURES = path.join(__dirname, 'fixtures', 'ipc-v2.1');

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

let CameraNode;

function installCameraNode() {
  if (CameraNode) return;
  const RED = {
    nodes: {
      createNode(instance) {
        instance.sent = [];
        instance.statuses = [];
        instance.handlers = {};
        instance.on = (event, fn) => {
          instance.handlers[event] = fn;
        };
        instance.send = (msg) => {
          instance.sent.push(msg);
        };
        instance.status = (status) => {
          instance.statuses.push(status);
        };
        instance.log = () => {};
        instance.error = () => {};
      },
      registerType(_name, ctor) {
        CameraNode = ctor;
      },
      getNode() {
        return {
          port: 5050,
          addClient() {},
          removeClient() {},
        };
      },
    },
  };
  require('../viewtron-camera.js')(RED);
}

function createNode(config) {
  installCameraNode();
  return new CameraNode(Object.assign({ server: 'server1' }, config));
}

function intrusionEvent() {
  return {
    source: 'IPC',
    category: 'intrusion',
    eventType: 'PEA',
    eventDescription: 'Line Crossing / Intrusion',
    configVersion: '1.7',
    format: 'v1',
    cameraName: 'Viewtron IPC',
    cameraIp: '',
    cameraMac: '00:00:00:00:00:00',
    channelId: '1',
    timestamp: '1700000000',
    eventTime: new Date('2023-11-14T22:13:20.000Z'),
    plateNumber: '',
    plateColor: '',
    plateGroup: '',
    plateList: null,
    direction: null,
    confidence: null,
    carOwner: '',
    vehicle: null,
    vehicleColor: '',
    vehicleBrand: '',
    vehicleType: '',
    vehicleModel: '',
    face: null,
    eventId: '1',
    targetId: '2',
    targetType: 'person',
    status: 'SMART_START',
    boundary: '',
    sourceImage: '',
    targetImage: '',
    sourceImageBytes: null,
    targetImageBytes: null,
    hasImages: false,
  };
}

async function postBody(xml) {
  const events = [];
  const unparsed = [];
  const server = new ViewtronServer({ port: 0 });
  server.on('event', (event, clientIp) => events.push({ event, clientIp }));
  server.on('unparsed', (body, clientIp, reason) => unparsed.push({ body, clientIp, reason }));
  const { port } = await server.start();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/API`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
    });
    assert.equal(response.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { events, unparsed };
  } finally {
    await server.stop();
  }
}

test('plate fixture payload keeps existing fields and adds the 1.1.0 plate fields', () => {
  const event = ViewtronEvent(fixture('lpr.xml'));
  assert.ok(event);

  const node = createNode({});
  node.onEvent(event, '192.168.1.100');

  assert.equal(node.sent.length, 1);
  const outputs = node.sent[0];
  assert.equal(outputs.length, 5);
  assert.equal(outputs[1], null);
  assert.equal(outputs[2], null);
  assert.equal(outputs[3], null);
  assert.equal(outputs[4], null);

  const msg = outputs[0];
  assert.equal(msg.topic, 'viewtron/lpr');
  const payload = msg.payload;

  assert.equal(payload.source, 'IPC');
  assert.equal(payload.category, 'lpr');
  assert.equal(payload.eventType, 'VEHICE');
  assert.equal(payload.eventDescription, 'License Plate Detection');
  assert.equal(payload.configVersion, '1.7');
  assert.equal(payload.format, 'v1');
  assert.equal(payload.cameraName, 'Viewtron IPC');
  assert.equal(payload.cameraIp, '192.168.1.100');
  assert.equal(payload.cameraMac, '00:00:00:00:00:00');
  assert.equal(payload.channelId, '1');
  assert.equal(payload.timestamp, '1791408287427999');
  assert.ok(payload.eventTime instanceof Date);
  assert.equal(payload.eventTime.toISOString(), '2026-10-07T21:24:47.427Z');
  assert.notEqual(payload.eventTime, event.eventTime);

  assert.equal(payload.plateNumber, 'AIDRIVE');
  assert.equal(payload.plateGroup, 'blackList');
  assert.equal(payload.plateColor, '');
  assert.equal(payload.carOwner, '');
  assert.equal(payload.plateList, 'blackList');
  assert.equal(payload.direction, 'away');
  assert.equal(payload.confidence, 99);
  assert.equal(payload.vehicleColor, 'grey');
  assert.equal(payload.vehicleBrand, 'Tesla');
  assert.equal(payload.vehicleType, 'saloon car');
  assert.equal(payload.vehicleModel, 'Tesla_ModelS');
  assert.deepEqual(payload.vehicle, {
    type: 'saloon car',
    color: 'grey',
    brand: 'Tesla',
    model: 'Tesla_ModelS',
  });
  assert.equal(payload.hasImages, false);
  assert.equal(payload.sourceImage, undefined);
  assert.equal(payload.targetImage, undefined);
  assert.equal(payload.sourceImageBytes, undefined);
  assert.equal(payload.targetImageBytes, undefined);

  const status = node.statuses[node.statuses.length - 1];
  assert.equal(status.fill, 'green');
  assert.equal(status.text, 'AIDRIVE (blackList) away 99');
});

test('default filters pass the plate fixture, including a node with no new config', () => {
  const event = ViewtronEvent(fixture('lpr.xml'));
  for (const config of [{}, { direction: '', minConfidence: '', plateList: '' }]) {
    const node = createNode(config);
    node.onEvent(event, '192.168.1.100');
    assert.equal(node.sent.length, 1);
    assert.equal(node.sent[0][0].payload.plateNumber, 'AIDRIVE');
  }
});

test('LPR filters drop non-matching plates and leave other categories alone', () => {
  const event = ViewtronEvent(fixture('lpr.xml'));

  const dropped = [
    { direction: 'approach' },
    { plateList: 'whiteList' },
    { minConfidence: '100' },
    { minConfidence: 100 },
    { direction: 'away', plateList: 'blackList', minConfidence: '100' },
  ];
  for (const config of dropped) {
    const node = createNode(config);
    node.onEvent(event, '192.168.1.100');
    assert.equal(node.sent.length, 0, JSON.stringify(config));
    const status = node.statuses[node.statuses.length - 1];
    assert.equal(status.fill, 'grey');
    assert.equal(status.text, 'filtered AIDRIVE');
  }

  const passed = createNode({
    direction: 'away',
    plateList: 'blackList',
    minConfidence: '90',
  });
  passed.onEvent(event, '192.168.1.100');
  assert.equal(passed.sent.length, 1);
  assert.equal(passed.sent[0][0].payload.confidence, 99);

  const zero = ViewtronEvent(fixture('lpr.xml'));
  zero.confidence = 0;
  const atLeastZero = createNode({ minConfidence: '0' });
  atLeastZero.onEvent(zero, '192.168.1.100');
  assert.equal(atLeastZero.sent.length, 1);
  assert.equal(atLeastZero.sent[0][0].payload.confidence, 0);

  const missing = ViewtronEvent(fixture('lpr.xml'));
  missing.confidence = null;
  const needsConfidence = createNode({ minConfidence: 0 });
  needsConfidence.onEvent(missing, '192.168.1.100');
  assert.equal(needsConfidence.sent.length, 0);

  const intrusion = createNode({
    direction: 'approach',
    plateList: 'whiteList',
    minConfidence: '90',
  });
  intrusion.onEvent(intrusionEvent(), '192.168.1.100');
  assert.equal(intrusion.sent.length, 1);
  const outputs = intrusion.sent[0];
  assert.equal(outputs[0], null);
  assert.equal(outputs[1].topic, 'viewtron/intrusion');
  assert.equal(outputs[1].payload.cameraIp, '192.168.1.100');
  assert.equal(outputs[1].payload.plateList, null);
  assert.equal(outputs[1].payload.direction, null);
  assert.equal(outputs[1].payload.confidence, null);
  assert.equal(outputs[1].payload.eventTime.toISOString(), '2023-11-14T22:13:20.000Z');
  assert.equal(outputs[2], null);
  assert.equal(outputs[3], null);
  assert.equal(outputs[4], null);
});

test('a posted plate fixture is routed, and alarm status and keepalive are not', async () => {
  const plate = await postBody(fixture('lpr.xml'));
  assert.equal(plate.unparsed.length, 0);
  assert.equal(plate.events.length, 1);

  const node = createNode({});
  node.onEvent(plate.events[0].event, plate.events[0].clientIp);
  const payload = node.sent[0][0].payload;
  assert.equal(payload.category, 'lpr');
  assert.equal(payload.plateNumber, 'AIDRIVE');
  assert.equal(payload.plateList, 'blackList');
  assert.equal(payload.direction, 'away');
  assert.equal(payload.confidence, 99);
  assert.equal(payload.timestamp, '1791408287427999');
  assert.equal(payload.eventTime.toISOString(), '2026-10-07T21:24:47.427Z');
  assert.ok(payload.cameraIp === '127.0.0.1' || payload.cameraIp === '::1');

  for (const name of ['alarm-status-on.xml', 'alarm-status-off.xml']) {
    const result = await postBody(fixture(name));
    assert.equal(result.events.length, 0, name);
    assert.equal(result.unparsed.length, 1, name);
    assert.equal(result.unparsed[0].reason, 'alarmStatus');
  }

  const keepalive = await postBody(fixture('keepalive.xml'));
  assert.equal(keepalive.events.length, 0);
  assert.equal(keepalive.unparsed.length, 0);
});
