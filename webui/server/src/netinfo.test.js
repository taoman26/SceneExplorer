import test from 'node:test';
import assert from 'node:assert/strict';
import { listenUrls } from './netinfo.js';

const ifaces = {
  lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  eth0: [{ family: 'IPv6', address: 'fe80::1', internal: false }, { family: 'IPv4', address: '192.168.1.20', internal: false }],
};

test('0.0.0.0 lists localhost and external IPv4 addresses only', () => {
  assert.deepEqual(listenUrls('0.0.0.0', 8686, ifaces), ['http://localhost:8686', 'http://192.168.1.20:8686']);
});
test('a specific host is used as is', () => {
  assert.deepEqual(listenUrls('127.0.0.1', 9000, ifaces), ['http://127.0.0.1:9000']);
});
