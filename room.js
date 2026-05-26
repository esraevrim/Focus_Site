// Study room client.
// Responsibilities:
//   1. Parse URL params and join the socket room
//   2. Render participant cards and keep them in sync
//   3. Run a personal Pomodoro timer and broadcast status changes
//   4. Keep the top-bar room ID display and "Copy" button working

(function () {

  // ── URL params ────────────────────────────────────────────────────────

  const params   = new URLSearchParams(window.location.search);
  const roomId   = (params.get('id') || '').toUpperCase();
  const nickname = params.get('nick') || 'Anonymous';
  const avatar   = params.get('avatar') || '🐱';

  if (!roomId) {
    window.location.href = '/';
    return;
  }

  // ── Top-bar room ID + copy button ─────────────────────────────────────

  document.getElementById('roomIdDisplay').textContent = roomId;
  document.title = `Study Room ${roomId}`;

  document.getElementById('copyRoomId').addEventListener('click', () => {
    navigator.clipboard.writeText(roomId).then(() => {
      const btn = document.getElementById('copyRoomId');
      btn.textContent = '✓';
      setTimeout(() => (btn.textContent = '📋'), 1500);
    });
  });

  document.getElementById('leaveBtn').addEventListener('click', () => {
    window.location.href = '/';
  });

  // ── Timer logic (mirrors script.js but also emits status via socket) ──

  const timerEl      = document.getElementById('timer');
  const modeEl       = document.getElementById('mode');
  const startPauseBtn= document.getElementById('startPause');
  const resetBtn     = document.getElementById('reset');
  const focusInput   = document.getElementById('focusInput');
  const breakInput   = document.getElementById('breakInput');
  const totalFocusEl = document.getElementById('totalFocus');
  const statusSelect = document.getElementById('statusSelect');

  let timerInterval      = null;
  let focusTrackInterval = null;
  let isRunning    = false;
  let isFocusMode  = true;
  let secondsLeft  = parseInt(focusInput.value) * 60;
  let totalFocusSeconds = 0;

  function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateDisplay() {
    timerEl.textContent = fmt(secondsLeft);
    document.title = `${isFocusMode ? '✅' : '☕'} ${fmt(secondsLeft)} — Room ${roomId}`;
  }

  // Derive the status string to broadcast based on timer state
  function currentStatus() {
    if (!isRunning) return statusSelect.value;
    return isFocusMode ? 'Focused' : 'On a Break';
  }

  function emitStatus() {
    socket.emit('update-status', { status: currentStatus() });
  }

  function onTimerEnd() {
    clearInterval(timerInterval);
    clearInterval(focusTrackInterval);
    isRunning = false;
    startPauseBtn.textContent = 'Start';

    if (isFocusMode) {
      // Switch to break
      isFocusMode = false;
      modeEl.textContent = 'BREAK';
      secondsLeft = parseInt(breakInput.value) * 60;
      statusSelect.value = 'On a Break';
    } else {
      // Switch back to focus
      isFocusMode = true;
      modeEl.textContent = 'FOCUS';
      secondsLeft = parseInt(focusInput.value) * 60;
      statusSelect.value = 'Idle';
    }

    statusSelect.disabled = false;
    updateDisplay();
    emitStatus();
  }

  function tick() {
    if (secondsLeft > 0) {
      secondsLeft--;
      updateDisplay();
    } else {
      onTimerEnd();
    }
  }

  startPauseBtn.addEventListener('click', () => {
    if (isRunning) {
      clearInterval(timerInterval);
      clearInterval(focusTrackInterval);
      isRunning = false;
      startPauseBtn.textContent = 'Start';
      statusSelect.disabled = false;
      // Status reverts to whatever the select shows
      emitStatus();
    } else {
      timerInterval = setInterval(tick, 1000);
      if (isFocusMode) {
        focusTrackInterval = setInterval(() => {
          totalFocusSeconds++;
          totalFocusEl.textContent = fmt(totalFocusSeconds);
        }, 1000);
      }
      isRunning = true;
      startPauseBtn.textContent = 'Pause';
      statusSelect.disabled = true; // auto-derived while running
      emitStatus();
    }
  });

  resetBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    clearInterval(focusTrackInterval);
    isRunning = false;
    isFocusMode = true;
    startPauseBtn.textContent = 'Start';
    modeEl.textContent = 'FOCUS';
    secondsLeft = parseInt(focusInput.value) * 60;
    statusSelect.value = 'Idle';
    statusSelect.disabled = false;
    updateDisplay();
    emitStatus();
  });

  focusInput.addEventListener('change', () => {
    if (!isRunning && isFocusMode) {
      secondsLeft = parseInt(focusInput.value) * 60;
      updateDisplay();
    }
  });

  breakInput.addEventListener('change', () => {
    if (!isRunning && !isFocusMode) {
      secondsLeft = parseInt(breakInput.value) * 60;
      updateDisplay();
    }
  });

  // Manual status change only fires when the timer is stopped
  statusSelect.addEventListener('change', () => {
    if (!isRunning) emitStatus();
  });

  updateDisplay();

  // ── Socket.IO & room state ─────────────────────────────────────────────

  const socket = io();

  // participants: Map<socketId, ParticipantObject>
  const participants = new Map();
  let myId = null;

  const grid = document.getElementById('participantsGrid');

  socket.emit('join-room', { roomId, nickname, avatar });

  socket.on('room-joined', ({ you, participants: list }) => {
    myId = you;
    participants.clear();
    list.forEach(p => participants.set(p.id, p));
    renderAll();
  });

  socket.on('participant-joined', ({ participant }) => {
    participants.set(participant.id, participant);
    renderCard(participant, true);
  });

  socket.on('participant-left', ({ userId }) => {
    participants.delete(userId);
    const el = document.getElementById(`card-${CSS.escape(userId)}`);
    if (el) {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'scale(0.85)';
      setTimeout(() => el.remove(), 300);
    }
    if (participants.size === 0) showEmpty();
  });

  socket.on('status-updated', ({ userId, status }) => {
    const p = participants.get(userId);
    if (!p) return;
    p.status = status;
    updateCardStatus(userId, status);
  });

  socket.on('host-changed', ({ newHostId }) => {
    participants.forEach((p, id) => { p.isHost = (id === newHostId); });
    renderAll(); // re-render so host badge moves
  });

  socket.on('room-error', ({ message }) => {
    alert(message);
    window.location.href = '/';
  });

  // ── Render helpers ─────────────────────────────────────────────────────

  function statusClass(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('focus'))              return 'status-focused';
    if (s.includes('break'))             return 'status-break';
    if (s.includes('pomodoro'))          return 'status-pomodoro';
    if (s.includes('music'))             return 'status-music';
    if (s.includes('done'))              return 'status-done';
    if (s.includes('brb') || s.includes('right back')) return 'status-brb';
    return 'status-idle';
  }

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCard(p, animate) {
    // Remove existing card if re-rendering
    const existing = document.getElementById(`card-${CSS.escape(p.id)}`);
    if (existing) existing.remove();

    const isYou = p.id === myId;

    const card = document.createElement('div');
    card.className = `participant-card${isYou ? ' is-you' : ''}`;
    card.id = `card-${CSS.escape(p.id)}`;
    card.innerHTML = `
      ${isYou ? '<span class="you-badge">You</span>' : ''}
      ${p.isHost ? '<span class="host-badge">Host</span>' : ''}
      <span class="participant-avatar">${p.avatar}</span>
      <div class="participant-name">${escHtml(p.nickname)}</div>
      <span class="participant-status ${statusClass(p.status)}">${escHtml(p.status)}</span>
    `;

    if (!animate) card.style.animation = 'none';
    grid.appendChild(card);
  }

  function renderAll() {
    grid.innerHTML = '';

    if (participants.size === 0) {
      showEmpty();
      return;
    }

    // Own card first, then by join order
    const sorted = [...participants.values()].sort((a, b) => {
      if (a.id === myId) return -1;
      if (b.id === myId) return 1;
      return a.joinedAt - b.joinedAt;
    });

    sorted.forEach(p => renderCard(p, false));
  }

  function updateCardStatus(userId, status) {
    const badge = document.querySelector(`#card-${CSS.escape(userId)} .participant-status`);
    if (!badge) return;
    badge.textContent = status;
    badge.className = `participant-status ${statusClass(status)}`;
  }

  function showEmpty() {
    grid.innerHTML = '<div class="empty-room-msg">Waiting for others to join…<br>Share your room ID!</div>';
  }

})();
