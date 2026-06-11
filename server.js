const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// rooms: Map<roomId, RoomState>
const rooms = new Map();

function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function makeSharedTimer(focusMinutes = 60, breakMinutes = 15) {
  return {
    running:        false,
    isFocusPhase:   true,
    focusMinutes,
    breakMinutes,
    secondsLeft:    focusMinutes * 60,
    startedAt:      null,
    secondsAtStart: null,
  };
}

function sharedTimerSnapshot(ts) {
  return { ...ts };
}

// Called by server setTimeout when the shared timer phase expires
function onSharedTimerEnd(roomId) {
  if (!rooms.has(roomId)) return;
  const room = rooms.get(roomId);
  const ts = room.sharedTimer;

  ts.running        = false;
  ts.startedAt      = null;
  ts.secondsAtStart = null;

  if (ts.isFocusPhase) {
    ts.isFocusPhase = false;
    ts.secondsLeft  = ts.breakMinutes * 60;
  } else {
    ts.isFocusPhase = true;
    ts.secondsLeft  = ts.focusMinutes * 60;
  }

  io.to(roomId).emit('shared-timer-state', sharedTimerSnapshot(ts));
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Create a new room
app.post('/api/rooms', (req, res) => {
  let roomId;
  let attempts = 0;
  do {
    roomId = generateRoomId();
    attempts++;
  } while (rooms.has(roomId) && attempts < 100);

  rooms.set(roomId, {
    host:              null,
    participants:      new Map(),
    sharedTimer:       makeSharedTimer(),
    sharedTimerTimeout: null,
  });

  console.log(`Room created: ${roomId} (${rooms.size} total rooms)`);
  res.json({ roomId });
});

// Check whether a room exists
app.get('/api/rooms/:roomId', (req, res) => {
  const id = req.params.roomId.toUpperCase();
  if (rooms.has(id)) {
    res.json({ exists: true, participants: rooms.get(id).participants.size });
  } else {
    res.status(404).json({ exists: false, error: 'Room not found' });
  }
});

io.on('connection', (socket) => {

  // ── Join room ─────────────────────────────────────────────────────────

  socket.on('join-room', ({ roomId, nickname, avatar }) => {
    roomId = (roomId || '').toUpperCase();

    if (!rooms.has(roomId)) {
      socket.emit('room-error', { message: 'Room not found. Check the room ID and try again.' });
      return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    const room = rooms.get(roomId);

    if (room.participants.size === 0) {
      room.host = socket.id;
    }

    const participant = {
      id:       socket.id,
      nickname: (nickname || 'Anonymous').slice(0, 20),
      avatar:   avatar || '🐱',
      status:   'Idle',
      isHost:   room.host === socket.id,
      joinedAt: Date.now(),
    };

    room.participants.set(socket.id, participant);

    socket.emit('room-joined', {
      roomId,
      you:          socket.id,
      participants: Array.from(room.participants.values()),
    });

    // Send current shared timer state so late joiners sync immediately
    socket.emit('shared-timer-state', sharedTimerSnapshot(room.sharedTimer));

    socket.to(roomId).emit('participant-joined', { participant });

    console.log(`"${participant.nickname}" joined room ${roomId} (${room.participants.size} in room)`);
  });

  // ── Personal status update ────────────────────────────────────────────

  socket.on('update-status', ({ status }) => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const p = room.participants.get(socket.id);
    if (!p) return;

    p.status = (status || 'Idle').slice(0, 60);
    io.to(roomId).emit('status-updated', { userId: socket.id, status: p.status });
  });

  // ── Shared timer events ───────────────────────────────────────────────

  socket.on('shared-timer-start', () => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const ts   = room.sharedTimer;
    if (ts.running) return;

    ts.running        = true;
    ts.startedAt      = Date.now();
    ts.secondsAtStart = ts.secondsLeft;

    if (room.sharedTimerTimeout) clearTimeout(room.sharedTimerTimeout);
    room.sharedTimerTimeout = setTimeout(
      () => onSharedTimerEnd(roomId),
      ts.secondsLeft * 1000
    );

    io.to(roomId).emit('shared-timer-state', sharedTimerSnapshot(ts));
  });

  socket.on('shared-timer-pause', () => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const ts   = room.sharedTimer;
    if (!ts.running) return;

    const elapsed  = Math.floor((Date.now() - ts.startedAt) / 1000);
    ts.secondsLeft = Math.max(0, ts.secondsAtStart - elapsed);
    ts.running        = false;
    ts.startedAt      = null;
    ts.secondsAtStart = null;

    if (room.sharedTimerTimeout) clearTimeout(room.sharedTimerTimeout);

    io.to(roomId).emit('shared-timer-state', sharedTimerSnapshot(ts));
  });

  socket.on('shared-timer-reset', () => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const ts   = room.sharedTimer;

    if (room.sharedTimerTimeout) clearTimeout(room.sharedTimerTimeout);

    ts.running        = false;
    ts.isFocusPhase   = true;
    ts.secondsLeft    = ts.focusMinutes * 60;
    ts.startedAt      = null;
    ts.secondsAtStart = null;

    io.to(roomId).emit('shared-timer-state', sharedTimerSnapshot(ts));
  });

  socket.on('shared-timer-config', ({ focusMinutes, breakMinutes }) => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    focusMinutes = Math.max(1, Math.min(180, parseInt(focusMinutes) || 60));
    breakMinutes = Math.max(1, Math.min(60,  parseInt(breakMinutes) || 15));

    const room = rooms.get(roomId);
    const ts   = room.sharedTimer;

    if (room.sharedTimerTimeout) clearTimeout(room.sharedTimerTimeout);

    ts.running        = false;
    ts.isFocusPhase   = true;
    ts.focusMinutes   = focusMinutes;
    ts.breakMinutes   = breakMinutes;
    ts.secondsLeft    = focusMinutes * 60;
    ts.startedAt      = null;
    ts.secondsAtStart = null;

    io.to(roomId).emit('shared-timer-state', sharedTimerSnapshot(ts));
  });

  // ── Disconnect ────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.participants.delete(socket.id);
    io.to(roomId).emit('participant-left', { userId: socket.id });

    if (room.participants.size === 0) {
      if (room.sharedTimerTimeout) clearTimeout(room.sharedTimerTimeout);
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
      return;
    }

    if (room.host === socket.id) {
      const newHostId = room.participants.keys().next().value;
      room.host = newHostId;
      room.participants.get(newHostId).isHost = true;
      io.to(roomId).emit('host-changed', { newHostId });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🍃 Focus Site running at http://localhost:${PORT}\n`);
});
