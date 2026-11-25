const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4174);
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, requested);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

function frame(text, opcode = 1) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) header = Buffer.from([0x80 | opcode, payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
  return Buffer.concat([header, payload]);
}
function send(peer, data) { if (!peer.closed) peer.socket.write(frame(JSON.stringify(data))); }
function sendRoom(room, data, except = null) { for (const peer of room.players.values()) if (peer !== except) send(peer, data); }
function roomCode() {
  let code;
  do { code = String(crypto.randomInt(100000, 1000000)); } while (rooms.has(code));
  return code;
}
function detach(peer) {
  if (peer.closed) return;
  peer.closed = true;
  const room = peer.room;
  if (room) {
    room.players.delete(peer.side);
    room.ready = { w: null, b: null };
    room.formations = { w: null, b: null };
    room.started = false;
    sendRoom(room, { type: 'peer-left' });
    if (!room.players.size) rooms.delete(room.code);
  }
}
function handle(peer, message) {
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'create') {
    if (peer.room) return;
    const code = roomCode();
    const room = { code, players: new Map(), ready: { w: null, b: null }, formations: { w: null, b: null }, started: false };
    peer.room = room; peer.side = 'w'; room.players.set('w', peer); rooms.set(code, room);
    send(peer, { type: 'created', code, side: 'w' });
    return;
  }
  if (message.type === 'join') {
    const code = String(message.code || '').replace(/\D/g, '').slice(0, 6);
    const room = rooms.get(code);
    if (!room) { send(peer, { type: 'error', message: '방 번호를 찾을 수 없습니다.' }); return; }
    if (room.players.has('b') || room.started) { send(peer, { type: 'error', message: '이 방은 이미 가득 찼습니다.' }); return; }
    peer.room = room; peer.side = 'b'; room.players.set('b', peer);
    send(peer, { type: 'joined', code, side: 'b' });
    sendRoom(room, { type: 'peer-joined' }, peer);
    return;
  }
  const room = peer.room;
  if (!room) { send(peer, { type: 'error', message: '먼저 방을 만들거나 입장하세요.' }); return; }
  if (message.type === 'ready') {
    if (!room.players.has('w') || !room.players.has('b')) { send(peer, { type: 'error', message: '상대가 입장할 때까지 기다려 주세요.' }); return; }
    room.ready[peer.side] = String(message.formation || 'standard');
    const other = room.players.get(peer.side === 'w' ? 'b' : 'w');
    send(other, { type: 'peer-ready' });
    if (room.ready.w && room.ready.b) {
      room.started = true;
      sendRoom(room, { type: 'start', formations: { ...room.ready } });
    }
    return;
  }
  if (message.type === 'select') {
    if (room.started) return;
    room.formations[peer.side] = String(message.formation || 'standard');
    return;
  }
  if (message.type === 'begin') {
    if (peer.side !== 'w') { send(peer, { type: 'error', message: '방 생성자만 게임을 시작할 수 있습니다.' }); return; }
    if (!room.players.has('w') || !room.players.has('b')) { send(peer, { type: 'error', message: '참가자 2명이 모두 입장해야 시작할 수 있습니다.' }); return; }
    if (room.started) return;
    room.started = true;
    const formations = { w: 'standard', b: 'standard' };
    sendRoom(room, { type: 'start', formations });
    return;
  }
  if (message.type === 'unready') {
    room.ready = { w: null, b: null };
    room.formations = { w: null, b: null };
    room.started = false;
    sendRoom(room, { type: 'peer-waiting' });
    return;
  }
  if (message.type === 'move') {
    if (!room.started || !room.players.has(peer.side === 'w' ? 'b' : 'w')) return;
    sendRoom(room, { type: 'move', side: peer.side, move: message.move }, peer);
    return;
  }
  if (message.type === 'leave') detach(peer);
}

server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws' || !req.headers['sec-websocket-key']) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const peer = { socket, buffer: Buffer.alloc(0), room: null, side: null, closed: false };
  socket.on('data', chunk => {
    peer.buffer = Buffer.concat([peer.buffer, chunk]);
    while (peer.buffer.length >= 2) {
      const first = peer.buffer[0], second = peer.buffer[1], opcode = first & 0x0f, masked = !!(second & 0x80);
      let length = second & 0x7f, offset = 2;
      if (length === 126) { if (peer.buffer.length < 4) break; length = peer.buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (peer.buffer.length < 10) break; const big = peer.buffer.readBigUInt64BE(2); if (big > 1048576n) { socket.destroy(); return; } length = Number(big); offset = 10; }
      if (masked) offset += 4;
      if (peer.buffer.length < offset + length) break;
      let payload = peer.buffer.subarray(offset, offset + length);
      if (masked) { const mask = peer.buffer.subarray(offset - 4, offset); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]; }
      peer.buffer = peer.buffer.subarray(offset + length);
      if (opcode === 8) { socket.end(frame('', 8)); detach(peer); return; }
      if (opcode === 9) { socket.write(frame(payload, 10)); continue; }
      if (opcode !== 1) continue;
      try { handle(peer, JSON.parse(payload.toString('utf8'))); } catch { send(peer, { type: 'error', message: '요청을 읽을 수 없습니다.' }); }
    }
  });
  socket.on('close', () => detach(peer));
  socket.on('error', () => detach(peer));
});

server.listen(PORT, '0.0.0.0', () => console.log(`Chess room server listening on http://localhost:${PORT}`));

