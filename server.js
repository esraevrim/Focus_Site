const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// rooms: Map<roomId, { host: socketId|null, participants: Map<socketId, Participant> }>
const rooms = new Map();

function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A3F7B2"
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Create a new room — returns a unique 6-char room ID
app.post('/api/rooms', (req, res) => {
  let roomId;
  let attempts = 0;
  do {
    roomId = generateRoomId();
    attempts++;
  } while (rooms.has(roomId) && attempts < 100);

  rooms.set(roomId, { host: null, participants: new Map() });
  console.log(`Room created: ${roomId} (${rooms.size} total rooms)`);
  res.json({ roomId });
});

// Check whether a room exists before redirecting
app.get('/api/rooms/:roomId', (req, res) => {
  const id = req.params.roomId.toUpperCase();
  if (rooms.has(id)) {
    res.json({ exists: true, participants: rooms.get(id).participants.size });
  } else {
    res.status(404).json({ exists: false, error: 'Room not found' });
  }
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, nickname, avatar }) => {
    roomId = (roomId || '').toUpperCase();

    if (!rooms.has(roomId)) {
      socket.emit('room-error', { message: 'Room not found. Check the room ID and try again.' });
      return;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    const room = rooms.get(roomId);

    // First participant becomes host
    if (room.participants.size === 0) {
      room.host = socket.id;
    }

    const participant = {
      id: socket.id,
      nickname: (nickname || 'Anonymous').slice(0, 20),
      avatar: avatar || '🐱',
      status: 'Idle',
      isHost: room.host === socket.id,
      joinedAt: Date.now(),
    };

    room.participants.set(socket.id, participant);

    // Send the full current room state only to the new joiner
    socket.emit('room-joined', {
      roomId,
      you: socket.id,
      participants: Array.from(room.participants.values()),
    });

    // Notify everyone else that someone new arrived
    socket.to(roomId).emit('participant-joined', { participant });

    console.log(`"${participant.nickname}" joined room ${roomId} (${room.participants.size} in room)`);
  });

  socket.on('update-status', ({ status }) => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    const p = room.participants.get(socket.id);
    if (!p) return;

    p.status = (status || 'Idle').slice(0, 60);
    // Broadcast to ALL in room (including sender so their own card reflects it)
    io.to(roomId).emit('status-updated', { userId: socket.id, status: p.status });
  });

  socket.on('disconnect', () => {
    const { roomId } = socket.data;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    room.participants.delete(socket.id);
    io.to(roomId).emit('participant-left', { userId: socket.id });

    if (room.participants.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
      return;
    }

    // Transfer host to the next participant if host left
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
