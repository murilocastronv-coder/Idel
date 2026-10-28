'use strict';
// Servidor WebSocket mínimo (RFC 6455) sem dependências externas.
// Usado para presença em tempo real (jogadores online) e notificações.
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD = 16 * 1024;

class Client extends EventEmitter {
  constructor(socket, meta) {
    super();
    this.socket = socket;
    this.meta = meta;
    this.alive = true;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }
  _closed() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
  _onData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    if (this.buffer.length > MAX_PAYLOAD * 4) return this.close(1009);
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0], b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0, opcode = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buffer.length < 4) return; len = this.buffer.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buffer.length < 10) return; const big = this.buffer.readBigUInt64BE(2); if (big > BigInt(MAX_PAYLOAD)) return this.close(1009); len = Number(big); off = 10; }
      if (!masked) return this.close(1002); // clientes devem mascarar
      if (len > MAX_PAYLOAD) return this.close(1009);
      if (this.buffer.length < off + 4 + len) return;
      const mask = this.buffer.subarray(off, off + 4);
      const payload = Buffer.from(this.buffer.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = this.buffer.subarray(off + 4 + len);

      if (opcode === 0x8) return this.close(1000);
      if (opcode === 0x9) { this._send(0xA, payload); continue; }
      if (opcode === 0xA) { this.alive = true; continue; }
      if (opcode === 0x1 || opcode === 0x0) {
        this.fragments.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this.alive = true;
          this.emit('message', msg);
        }
      }
    }
  }
  _send(opcode, payload) {
    if (this.closed || this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) header = Buffer.from([0x80 | opcode, len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([header, payload]));
  }
  send(obj) { this._send(0x1, Buffer.from(JSON.stringify(obj))); }
  ping() { this._send(0x9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (this.closed) return;
    const b = Buffer.alloc(2); b.writeUInt16BE(code);
    try { this._send(0x8, b); } catch (_) {}
    this.socket.end();
    this._closed();
  }
}

class WSServer extends EventEmitter {
  constructor(server, { path = '/ws', authenticate, allowedOrigin }) {
    super();
    this.clients = new Set();
    server.on('upgrade', async (req, socket) => {
      try {
        const url = new URL(req.url, 'http://x');
        const key = req.headers['sec-websocket-key'];
        if (url.pathname !== path || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
          socket.destroy(); return;
        }
        if (allowedOrigin && req.headers.origin && !allowedOrigin(req.headers.origin, req)) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
        }
        const meta = authenticate ? await authenticate(req) : {};
        const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
        socket.setNoDelay(true);
        const client = new Client(socket, meta);
        this.clients.add(client);
        client.on('close', () => { this.clients.delete(client); this.emit('disconnect', client); });
        this.emit('connection', client);
      } catch (e) {
        socket.destroy();
      }
    });
    // Heartbeat: derruba conexões mortas (ex.: celular que perdeu internet)
    setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) { c.close(1001); continue; }
        c.alive = false;
        c.ping();
      }
    }, 25_000).unref();
  }
  broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const c of this.clients) c._send(0x1, Buffer.from(data));
  }
}

module.exports = { WSServer };
