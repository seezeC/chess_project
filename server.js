'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4174);
const MAX_FRAME_BYTES = 8 * 1024;
const MAX_CONNECTIONS = 250;
const MAX_CONNECTIONS_PER_IP = 12;
const MAX_ROOMS = 200;
const ROOM_IDLE_MS = 60 * 60 * 1000;
const rooms = new Map();
const peers = new Set();
const actionBuckets = new Map();
const globalBuckets = new Map();
const ipConnections = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const staticFiles = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/game.js', 'game.js']]);
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.chesscomfiles.com; media-src 'self' https://images.chesscomfiles.com; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
};

function sendHttp(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...securityHeaders,
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return sendHttp(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  let pathname;
  try { pathname = new URL(req.url || '/', 'http://localhost').pathname; }
  catch { return sendHttp(res, 400, 'Bad request'); }
  const fileName = staticFiles.get(pathname);
  if (!fileName) return sendHttp(res, 404, 'Not found');
  const file = path.join(ROOT, fileName);
  fs.readFile(file, (error, data) => {
    if (error) return sendHttp(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      ...securityHeaders,
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

function wsFrame(payload, opcode = 1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) header = Buffer.from([0x80 | opcode, body.length]);
  else if (body.length < 65536) {
    header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

function send(peer, data) {
  if (!peer.closed && !peer.socket.destroyed) {
    const payload = JSON.stringify(data);
    if (Buffer.byteLength(payload) <= MAX_FRAME_BYTES) peer.socket.write(wsFrame(payload));
  }
}

function sendRoom(room, data, except = null) {
  for (const peer of room.players.values()) if (peer !== except) send(peer, data);
}

function allowWindow(map, key, limit, windowMs) {
  const now = Date.now();
  let bucket = map.get(key);
  if (!bucket || now - bucket.start >= windowMs) { bucket = { start: now, count: 0 }; map.set(key, bucket); }
  bucket.count++;
  return bucket.count <= limit;
}

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(value => value.trim()).filter(Boolean);
  for (let i = forwarded.length - 1; i >= 0; i--) if (net.isIP(forwarded[i])) return forwarded[i];
  return req.socket.remoteAddress || 'unknown';
}

function roomCode() {
  let code;
  do { code = String(crypto.randomInt(100000, 1000000)); } while (rooms.has(code));
  return code;
}

function initialBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let x = 0; x < 8; x++) {
    board[0][x] = { kind: back[x], color: 'w', hasMoved: false, isRoyal: back[x] === 'k' };
    board[1][x] = { kind: 'p', color: 'w', hasMoved: false, isRoyal: false };
    board[6][x] = { kind: 'p', color: 'b', hasMoved: false, isRoyal: false };
    board[7][x] = { kind: back[x], color: 'b', hasMoved: false, isRoyal: back[x] === 'k' };
  }
  return board;
}

function cloneBoard(board) { return board.map(row => row.map(piece => piece ? { ...piece } : null)); }
function inside(x, y) { return x >= 0 && x < 8 && y >= 0 && y < 8; }
function opposite(color) { return color === 'w' ? 'b' : 'w'; }

function findKing(board, color) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const piece = board[y][x];
    if (piece?.color === color && piece.kind === 'k' && piece.isRoyal) return { x, y };
  }
  return null;
}

function squareAttacked(board, x, y, byColor) {
  const pawnSourceY = y - (byColor === 'w' ? 1 : -1);
  for (const pawnSourceX of [x - 1, x + 1]) {
    const piece = board[pawnSourceY]?.[pawnSourceX];
    if (piece?.color === byColor && piece.kind === 'p') return true;
  }
  const knightSteps = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  for (const [dx, dy] of knightSteps) {
    const piece = board[y - dy]?.[x - dx];
    if (piece?.color === byColor && piece.kind === 'n') return true;
  }
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    const piece = board[y + dy]?.[x + dx];
    if (piece?.color === byColor && piece.kind === 'k') return true;
  }
  const rays = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [dx, dy] of rays) {
    for (let distance = 1; distance < 8; distance++) {
      const xx = x + dx * distance, yy = y + dy * distance;
      if (!inside(xx, yy)) break;
      const piece = board[yy][xx];
      if (!piece) continue;
      if (piece.color === byColor) {
        const orthogonal = dx === 0 || dy === 0;
        if (piece.kind === 'q' || (orthogonal && piece.kind === 'r') || (!orthogonal && piece.kind === 'b')) return true;
      }
      break;
    }
  }
  return false;
}

function inCheck(board, color) {
  const king = findKing(board, color);
  return !!king && squareAttacked(board, king.x, king.y, opposite(color));
}

function pseudoMoves(state, color) {
  const { board } = state, moves = [];
  const add = (piece, fx, fy, tx, ty, extra = {}) => {
    if (!inside(tx, ty)) return;
    const target = board[ty][tx];
    if (target?.color === color || target?.isRoyal) return;
    moves.push({ fx, fy, tx, ty, ...extra });
  };
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const piece = board[y][x];
    if (!piece || piece.color !== color) continue;
    if (piece.kind === 'p') {
      const direction = color === 'w' ? 1 : -1, one = y + direction, start = color === 'w' ? 1 : 6;
      if (inside(x, one) && !board[one][x]) {
        add(piece, x, y, x, one);
        const two = y + direction * 2;
        if (y === start && inside(x, two) && !board[two][x]) add(piece, x, y, x, two, { double: true });
      }
      for (const dx of [-1, 1]) {
        const tx = x + dx, ty = y + direction;
        if (!inside(tx, ty)) continue;
        const target = board[ty][tx];
        if (target && target.color !== color && !target.isRoyal) add(piece, x, y, tx, ty);
        else if (state.ep && state.ep.x === tx && state.ep.y === y && board[y][tx]?.kind === 'p' && board[y][tx]?.color === opposite(color)) add(piece, x, y, tx, ty, { ep: true });
      }
      continue;
    }
    if (piece.kind === 'n') {
      for (const [dx, dy] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) add(piece, x, y, x + dx, y + dy);
      continue;
    }
    if (piece.kind === 'b' || piece.kind === 'r' || piece.kind === 'q') {
      const dirs = piece.kind === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : piece.kind === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dx, dy] of dirs) for (let distance = 1; distance < 8; distance++) {
        const tx = x + dx * distance, ty = y + dy * distance;
        if (!inside(tx, ty)) break;
        const target = board[ty][tx];
        if (!target) add(piece, x, y, tx, ty);
        else { if (target.color !== color && !target.isRoyal) add(piece, x, y, tx, ty); break; }
      }
      continue;
    }
    if (piece.kind === 'k') {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) add(piece, x, y, x + dx, y + dy);
      const homeY = color === 'w' ? 0 : 7;
      if (!piece.hasMoved && x === 4 && y === homeY && !inCheck(board, color)) {
        for (const side of ['k', 'q']) {
          const rookX = side === 'k' ? 7 : 0, rook = board[y][rookX];
          const emptyFiles = side === 'k' ? [5, 6] : [1, 2, 3];
          const safeFiles = side === 'k' ? [5, 6] : [3, 2];
          if (rook?.kind !== 'r' || rook.color !== color || rook.hasMoved || !emptyFiles.every(file => !board[y][file])) continue;
          if (!safeFiles.every(file => !squareAttacked(board, file, y, opposite(color)))) continue;
          moves.push({ fx: x, fy: y, tx: side === 'k' ? 6 : 2, ty: y, castle: side });
        }
      }
    }
  }
  return moves;
}

function applyChessMove(state, move) {
  const board = cloneBoard(state.board), piece = board[move.fy][move.fx], target = board[move.ty][move.tx];
  const capture = !!target || !!move.ep, pawnMove = piece.kind === 'p';
  let ep = null;
  if (move.ep) board[move.fy][move.tx] = null;
  board[move.fy][move.fx] = null;
  if (move.castle) {
    const rookX = move.castle === 'k' ? 7 : 0, rookToX = move.castle === 'k' ? 5 : 3, rook = board[move.fy][rookX];
    board[move.fy][rookX] = null;rook.x = rookToX;rook.y = move.fy;rook.hasMoved = true;board[move.fy][rookToX] = rook;
  }
  piece.x = move.tx;piece.y = move.ty;piece.hasMoved = true;
  if (piece.kind === 'p' && (move.ty === 0 || move.ty === 7)) piece.kind = 'q';
  board[move.ty][move.tx] = piece;
  if (move.double) ep = { x: move.tx, y: move.ty };
  return { board, ep, capture, pawnMove };
}

function legalMoves(state, color) {
  return pseudoMoves(state, color).filter(move => !inCheck(applyChessMove(state, move).board, color));
}

function createGame() {
  const game = { board: initialBoard(), side: 'w', ep: null, halfmoveClock: 0, repetitions: new Map(), finished: false };
  game.repetitions.set(positionKey(game), 1);
  return game;
}

function positionKey(game) {
  let rows = '';
  for (let y = 7; y >= 0; y--) for (let x = 0; x < 8; x++) {
    const piece = game.board[y][x];rows += piece ? `${piece.color}${piece.kind},` : '__,';
  }
  let castling = '';
  for (const color of ['w', 'b']) {
    const rank = color === 'w' ? 0 : 7, king = game.board[rank][4];
    if (king?.color !== color || king.kind !== 'k' || king.hasMoved) continue;
    for (const [file, flag] of [[7, color === 'w' ? 'K' : 'k'], [0, color === 'w' ? 'Q' : 'q']]) {
      const rook = game.board[rank][file];
      if (rook?.color === color && rook.kind === 'r' && !rook.hasMoved) castling += flag;
    }
  }
  return `${rows}|${game.side}|${castling || '-'}|${game.ep ? `${game.ep.x},${game.ep.y}` : '-'}`;
}

function insufficientMaterial(board) {
  const pieces = board.flat().filter(piece => piece && piece.kind !== 'k');
  if (pieces.length === 0) return true;
  if (pieces.some(piece => ['p', 'r', 'q'].includes(piece.kind))) return false;
  if (pieces.length === 1) return true;
  if (pieces.every(piece => piece.kind === 'b')) {
    const colors = new Set();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (board[y][x]?.kind === 'b') colors.add((x + y) % 2);
    return colors.size <= 1;
  }
  return false;
}

function gameResult(game) {
  const moves = legalMoves(game, game.side);
  if (!moves.length) return inCheck(game.board, game.side) ? { outcome: opposite(game.side), reason: '체크메이트' } : { outcome: 'draw', reason: '스테일메이트' };
  if (game.halfmoveClock >= 100) return { outcome: 'draw', reason: '50수 규칙 무승부' };
  if (insufficientMaterial(game.board)) return { outcome: 'draw', reason: '기물 부족 무승부' };
  if ((game.repetitions.get(positionKey(game)) || 0) >= 3) return { outcome: 'draw', reason: '동일 포지션 3회 반복 무승부' };
  return null;
}

function createRoom() {
  return { code: roomCode(), players: new Map(), owner: null, ready: { w: false, b: false }, started: false, game: null, lastActivity: Date.now() };
}

function startRoom(room) {
  if (room.started || room.players.size !== 2) return false;
  room.game = createGame();room.started = true;room.lastActivity = Date.now();
  sendRoom(room, { type: 'start', formations: { w: 'standard', b: 'standard' } });
  return true;
}

function detachPeer(peer) {
  if (peer.closed) return;
  peer.closed = true;peers.delete(peer);
  const count = (ipConnections.get(peer.ip) || 1) - 1;
  if (count > 0) ipConnections.set(peer.ip, count); else ipConnections.delete(peer.ip);
  const room = peer.room;
  if (!room) return;
  peer.room = null;
  const wasOwner = room.owner === peer;
  if (room.players.get(peer.side) === peer) room.players.delete(peer.side);
  room.ready = { w: false, b: false };room.started = false;room.game = null;room.lastActivity = Date.now();
  sendRoom(room, { type: 'peer-left' });
  if (room.players.size === 0) rooms.delete(room.code);
  else if (wasOwner) room.owner = null;
  peer.side = null;
}

function sendError(peer, message) { send(peer, { type: 'error', message }); }

function attachPeerToRoom(peer, room, side) {
  peer.room = room;peer.side = side;room.players.set(side, peer);room.lastActivity = Date.now();
  if (!room.owner && side === 'w') room.owner = peer;
}

function handleMove(peer, room, rawMove) {
  const game = room.game;
  if (!room.started || !game || game.finished) return sendError(peer, '대국이 진행 중이 아닙니다.');
  if (peer.side !== game.side) return sendError(peer, '상대 차례입니다.');
  if (!rawMove || typeof rawMove !== 'object' || Array.isArray(rawMove)) return sendError(peer, '수 형식이 올바르지 않습니다.');
  const keys = Object.keys(rawMove);
  if (keys.length !== 4 || keys.some(key => !['fx', 'fy', 'tx', 'ty'].includes(key))) return sendError(peer, '수 형식이 올바르지 않습니다.');
  const { fx, fy, tx, ty } = rawMove;
  if (![fx, fy, tx, ty].every(Number.isInteger) || ![fx, fy, tx, ty].every(value => value >= 0 && value < 8) || (fx === tx && fy === ty)) return sendError(peer, '칸 좌표가 올바르지 않습니다.');
  const move = legalMoves(game, game.side).find(candidate => candidate.fx === fx && candidate.fy === fy && candidate.tx === tx && candidate.ty === ty);
  if (!move) return sendError(peer, '현재 보드에서 둘 수 없는 수입니다.');
  const result = applyChessMove(game, move);
  game.board = result.board;game.ep = result.ep;game.halfmoveClock = result.pawnMove || result.capture ? 0 : game.halfmoveClock + 1;game.side = opposite(game.side);
  const key = positionKey(game);game.repetitions.set(key, (game.repetitions.get(key) || 0) + 1);room.lastActivity = Date.now();
  sendRoom(room, { type: 'move', side: peer.side, move: { fx, fy, tx, ty } }, peer);
  const ending = gameResult(game);
  if (ending) { game.finished = true;sendRoom(room, { type: 'end', outcome: ending.outcome, reason: ending.reason }); }
}

function handle(peer, message) {
  if (peer.closed || !message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
  if (!allowWindow(peer.messages, 'all', 100, 10000)) return closePeer(peer, 1008);
  const ip = peer.ip;
  if (message.type === 'create') {
    if (!allowWindow(globalBuckets, 'create', 40, 60000)) return sendError(peer, '방 생성 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    if (!allowWindow(actionBuckets, `create:${ip}`, 5, 60000)) return sendError(peer, '방 생성 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    if (peer.room) return sendError(peer, '이미 방에 참여 중입니다.');
    if (rooms.size >= MAX_ROOMS) return sendError(peer, '현재 생성할 수 있는 방이 가득 찼습니다.');
    const room = createRoom();attachPeerToRoom(peer, room, 'w');rooms.set(room.code, room);
    send(peer, { type: 'created', code: room.code, side: 'w' });return;
  }
  if (message.type === 'join') {
    if (!allowWindow(globalBuckets, 'join', 240, 60000)) return sendError(peer, '방 참가 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    if (!allowWindow(actionBuckets, `join:${ip}`, 10, 60000)) return sendError(peer, '방 번호 입력이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    if (peer.room) return sendError(peer, '이미 방에 참여 중입니다.');
    const code = typeof message.code === 'string' ? message.code : '';
    if (!/^\d{6}$/.test(code)) return sendError(peer, '6자리 방 번호를 입력해 주세요.');
    const room = rooms.get(code);
    if (!room || room.started || room.players.size >= 2) return sendError(peer, '방에 참가할 수 없습니다. 방 번호를 확인해 주세요.');
    const side = room.players.has('w') ? 'b' : 'w';attachPeerToRoom(peer, room, side);
    if (!room.owner && side === 'w') room.owner = peer;
    send(peer, { type: 'joined', code, side });sendRoom(room, { type: 'peer-joined' }, peer);return;
  }
  const room = peer.room;
  if (!room || room.players.get(peer.side) !== peer) return sendError(peer, '먼저 방을 만들거나 입장하세요.');
  room.lastActivity = Date.now();
  if (message.type === 'begin') {
    if (peer !== room.owner) return sendError(peer, '방 생성자만 게임을 시작할 수 있습니다.');
    if (room.players.size !== 2) return sendError(peer, '참가자 2명이 모두 입장해야 시작할 수 있습니다.');
    if (!startRoom(room)) return sendError(peer, '게임을 시작할 수 없습니다.');
    return;
  }
  if (message.type === 'ready') {
    if (room.players.size !== 2) return sendError(peer, '상대가 입장할 때까지 기다려 주세요.');
    room.ready[peer.side] = true;
    send(room.players.get(opposite(peer.side)), { type: 'peer-ready' });
    if (room.ready.w && room.ready.b) startRoom(room);
    return;
  }
  if (message.type === 'unready') {
    if (room.started || peer !== room.owner) return;
    room.ready = { w: false, b: false };sendRoom(room, { type: 'peer-waiting' });return;
  }
  if (message.type === 'select') return;
  if (message.type === 'move') { handleMove(peer, room, message.move);return; }
  if (message.type === 'leave') return closePeer(peer, 1000);
  sendError(peer, '지원하지 않는 요청입니다.');
}

function closePeer(peer, code = 1002) {
  if (peer.closed) return;
  detachPeer(peer);
  if (!peer.socket.destroyed) {
    const payload = Buffer.alloc(2);payload.writeUInt16BE(code);
    peer.socket.end(wsFrame(payload, 8));
  }
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers.host || '').trim().toLowerCase();
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host.toLowerCase() === host;
  } catch { return false; }
}

server.on('upgrade', (req, socket) => {
  if (req.url !== '/ws' || !originAllowed(req) || !/^websocket$/i.test(req.headers.upgrade || '') || !String(req.headers.connection || '').toLowerCase().split(',').map(x => x.trim()).includes('upgrade') || req.headers['sec-websocket-version'] !== '13') {
    socket.destroy();return;
  }
  const key = req.headers['sec-websocket-key'];
  const ip = requestIp(req), liveForIp = ipConnections.get(ip) || 0;
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key) || Buffer.from(key, 'base64').length !== 16 || peers.size >= MAX_CONNECTIONS || liveForIp >= MAX_CONNECTIONS_PER_IP) { socket.destroy();return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\nUpgrade: websocket\nConnection: Upgrade\nSec-WebSocket-Accept: ' + accept + '\n\n');
  socket.setNoDelay(true);
  const peer = { socket, buffer: Buffer.alloc(0), room: null, side: null, closed: false, ip, messages: new Map(), lastSeen: Date.now(), lastPing: Date.now() };
  ipConnections.set(ip, liveForIp + 1);
  peers.add(peer);
  socket.on('data', chunk => {
    if (peer.closed) return;
    peer.lastSeen = Date.now();peer.buffer = Buffer.concat([peer.buffer, chunk]);
    if (peer.buffer.length > MAX_FRAME_BYTES + 14) return closePeer(peer, 1009);
    while (peer.buffer.length >= 2) {
      const first = peer.buffer[0], second = peer.buffer[1], fin = !!(first & 0x80), rsv = first & 0x70, opcode = first & 0x0f, masked = !!(second & 0x80);
      let length = second & 0x7f, offset = 2;
      if (!fin || rsv || !masked || ![1, 8, 9, 10].includes(opcode)) return closePeer(peer, 1002);
      if (length === 126) { if (peer.buffer.length < 4) return;length = peer.buffer.readUInt16BE(2);offset = 4; }
      else if (length === 127) { if (peer.buffer.length < 10) return;const big = peer.buffer.readBigUInt64BE(2);if (big > BigInt(MAX_FRAME_BYTES)) return closePeer(peer, 1009);length = Number(big);offset = 10; }
      if (length > MAX_FRAME_BYTES || ([8, 9, 10].includes(opcode) && length > 125)) return closePeer(peer, 1009);
      if (peer.buffer.length < offset + 4 + length) return;
      const mask = peer.buffer.subarray(offset, offset + 4);offset += 4;
      const payload = Buffer.from(peer.buffer.subarray(offset, offset + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      peer.buffer = peer.buffer.subarray(offset + length);
      if (opcode === 8) return closePeer(peer, 1000);
      if (opcode === 9) { peer.socket.write(wsFrame(payload, 10));continue; }
      if (opcode === 10) continue;
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(payload);
        handle(peer, JSON.parse(text));
      } catch { sendError(peer, '요청을 읽을 수 없습니다.'); }
      if (peer.closed) return;
    }
  });
  socket.on('close', () => detachPeer(peer));
  socket.on('error', () => detachPeer(peer));
});

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.lastActivity > ROOM_IDLE_MS) {
    sendRoom(room, { type: 'peer-left' });
    for (const peer of room.players.values()) { peer.room = null;peer.side = null; }
    room.players.clear();rooms.delete(code);
  }
  for (const [key, bucket] of actionBuckets) if (now - bucket.start > 10 * 60 * 1000) actionBuckets.delete(key);
  for (const [key, bucket] of globalBuckets) if (now - bucket.start > 10 * 60 * 1000) globalBuckets.delete(key);
}, 60 * 1000);
sweeper.unref();

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const peer of peers) {
    if (now - peer.lastSeen > 90 * 1000) { closePeer(peer, 1001);continue; }
    if (now - peer.lastPing > 25 * 1000 && !peer.socket.destroyed) {
      peer.lastPing = now;peer.socket.write(wsFrame(Buffer.alloc(0), 9));
    }
  }
}, 25 * 1000);
heartbeat.unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Chess room server listening on port ${PORT}`));
