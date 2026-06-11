// Study room client.
// Responsibilities:
//   1. Parse URL params and join the socket room
//   2. Render participant cards and keep them in sync
//   3. Run a personal OR shared Pomodoro timer and broadcast status changes
//   4. Keep the top-bar room ID display and "Copy" button working

(function () {

  // ── URL params ────────────────────────────────────────────────────────────

  const params   = new URLSearchParams(window.location.search);
  const roomId   = (params.get('id') || '').toUpperCase();
  const nickname = params.get('nick') || 'Anonymous';
  const avatar   = params.get('avatar') || '🐱';

  if (!roomId) {
    window.location.href = '/';
    return;
  }

  // ── Top-bar ───────────────────────────────────────────────────────────────

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

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const timerEl        = document.getElementById('timer');
  const modeEl         = document.getElementById('mode');
  const startPauseBtn  = document.getElementById('startPause');
  const resetBtn       = document.getElementById('reset');
  const focusInput     = document.getElementById('focusInput');
  const breakInput     = document.getElementById('breakInput');
  const totalFocusEl   = document.getElementById('totalFocus');
  const statusSelect   = document.getElementById('statusSelect');
  const personalModeBtn= document.getElementById('personalModeBtn');
  const sharedModeBtn  = document.getElementById('sharedModeBtn');
  const sharedBadge    = document.getElementById('sharedTimerBadge');

  // ── Utility ───────────────────────────────────────────────────────────────

  function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // ── Timer mode ('personal' | 'shared') ────────────────────────────────────

  let timerMode = 'personal';

  function setTimerMode(mode) {
    timerMode = mode;

    personalModeBtn.classList.toggle('active', mode === 'personal');
    sharedModeBtn.classList.toggle('active',   mode === 'shared');
    sharedBadge.style.display = mode === 'shared' ? 'block' : 'none';

    if (mode === 'personal') {
      // Stop shared display; restore personal UI state
      stopSharedDisplay();
      updatePersonalDisplay();
      setPersonalControlsEnabled(true);
    } else {
      // Stop personal timer if running
      if (personalRunning) pausePersonalTimer();
      startSharedDisplay();
      applySharedState();
    }
  }

  personalModeBtn.addEventListener('click', () => setTimerMode('personal'));
  sharedModeBtn.addEventListener('click',   () => setTimerMode('shared'));

  // ── Personal timer ────────────────────────────────────────────────────────

  let personalInterval      = null;
  let focusTrackInterval    = null;
  let personalRunning       = false;
  let personalIsFocusPhase  = true;
  let personalSecondsLeft   = parseInt(focusInput.value) * 60;
  let totalFocusSeconds     = 0;

  function updatePersonalDisplay() {
    timerEl.textContent = fmt(personalSecondsLeft);
    modeEl.textContent  = personalIsFocusPhase ? 'FOCUS' : 'BREAK';
    document.title = `${personalIsFocusPhase ? '✅' : '☕'} ${fmt(personalSecondsLeft)} — Room ${roomId}`;
  }

  function setPersonalControlsEnabled(enabled) {
    startPauseBtn.disabled = !enabled;
    resetBtn.disabled      = !enabled;
    focusInput.disabled    = !enabled;
    breakInput.disabled    = !enabled;
  }

  function pausePersonalTimer() {
    clearInterval(personalInterval);
    clearInterval(focusTrackInterval);
    personalRunning = false;
    startPauseBtn.textContent = 'Start';
    statusSelect.disabled = false;
    emitStatus();
  }

  function onPersonalTimerEnd() {
    clearInterval(personalInterval);
    clearInterval(focusTrackInterval);
    personalRunning = false;
    startPauseBtn.textContent = 'Start';

    if (personalIsFocusPhase) {
      personalIsFocusPhase = false;
      modeEl.textContent   = 'BREAK';
      personalSecondsLeft  = parseInt(breakInput.value) * 60;
      statusSelect.value   = 'On a Break';
    } else {
      personalIsFocusPhase = true;
      modeEl.textContent   = 'FOCUS';
      personalSecondsLeft  = parseInt(focusInput.value) * 60;
      statusSelect.value   = 'Idle';
    }

    statusSelect.disabled = false;
    updatePersonalDisplay();
    emitStatus();
  }

  function personalTick() {
    if (personalSecondsLeft > 0) {
      personalSecondsLeft--;
      updatePersonalDisplay();
    } else {
      onPersonalTimerEnd();
    }
  }

  startPauseBtn.addEventListener('click', () => {
    if (timerMode === 'shared') {
      // Delegate to shared timer
      if (sharedState && sharedState.running) {
        socket.emit('shared-timer-pause');
      } else {
        socket.emit('shared-timer-start');
      }
      return;
    }

    if (personalRunning) {
      pausePersonalTimer();
    } else {
      personalInterval = setInterval(personalTick, 1000);
      if (personalIsFocusPhase) {
        focusTrackInterval = setInterval(() => {
          totalFocusSeconds++;
          totalFocusEl.textContent = fmt(totalFocusSeconds);
        }, 1000);
      }
      personalRunning = true;
      startPauseBtn.textContent = 'Pause';
      statusSelect.disabled = true;
      emitStatus();
    }
  });

  resetBtn.addEventListener('click', () => {
    if (timerMode === 'shared') {
      socket.emit('shared-timer-reset');
      return;
    }

    clearInterval(personalInterval);
    clearInterval(focusTrackInterval);
    personalRunning      = false;
    personalIsFocusPhase = true;
    startPauseBtn.textContent = 'Start';
    modeEl.textContent   = 'FOCUS';
    personalSecondsLeft  = parseInt(focusInput.value) * 60;
    statusSelect.value   = 'Idle';
    statusSelect.disabled = false;
    updatePersonalDisplay();
    emitStatus();
  });

  focusInput.addEventListener('change', () => {
    if (timerMode === 'shared') {
      socket.emit('shared-timer-config', {
        focusMinutes: parseInt(focusInput.value) || 60,
        breakMinutes: parseInt(breakInput.value) || 15,
      });
      return;
    }
    if (!personalRunning && personalIsFocusPhase) {
      personalSecondsLeft = parseInt(focusInput.value) * 60;
      updatePersonalDisplay();
    }
  });

  breakInput.addEventListener('change', () => {
    if (timerMode === 'shared') {
      socket.emit('shared-timer-config', {
        focusMinutes: parseInt(focusInput.value) || 60,
        breakMinutes: parseInt(breakInput.value) || 15,
      });
      return;
    }
    if (!personalRunning && !personalIsFocusPhase) {
      personalSecondsLeft = parseInt(breakInput.value) * 60;
      updatePersonalDisplay();
    }
  });

  statusSelect.addEventListener('change', () => {
    if (!personalRunning) emitStatus();
  });

  updatePersonalDisplay();

  // ── Shared timer ──────────────────────────────────────────────────────────

  let sharedState       = null;
  let sharedDisplayInterval = null;

  function calcSharedSecondsLeft(state) {
    if (!state.running) return state.secondsLeft;
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    return Math.max(0, state.secondsAtStart - elapsed);
  }

  function applySharedState() {
    if (!sharedState || timerMode !== 'shared') return;

    const sLeft = calcSharedSecondsLeft(sharedState);
    timerEl.textContent = fmt(sLeft);
    modeEl.textContent  = sharedState.isFocusPhase ? 'FOCUS' : 'BREAK';

    startPauseBtn.textContent = sharedState.running ? 'Pause' : 'Start';
    startPauseBtn.disabled    = false;
    resetBtn.disabled         = false;

    // Sync inputs to reflect shared config
    focusInput.value = sharedState.focusMinutes;
    breakInput.value = sharedState.breakMinutes;

    // Status follows shared timer
    if (sharedState.running) {
      statusSelect.value    = sharedState.isFocusPhase ? 'Focused' : 'On a Break';
      statusSelect.disabled = true;
    } else {
      statusSelect.disabled = false;
    }

    document.title = `${sharedState.isFocusPhase ? '✅' : '☕'} ${fmt(sLeft)} — Room ${roomId}`;
  }

  function startSharedDisplay() {
    if (sharedDisplayInterval) clearInterval(sharedDisplayInterval);
    // Update twice per second for smooth display without heavy load
    sharedDisplayInterval = setInterval(() => {
      if (sharedState && timerMode === 'shared') applySharedState();
    }, 500);
  }

  function stopSharedDisplay() {
    clearInterval(sharedDisplayInterval);
    sharedDisplayInterval = null;
  }

  // ── Socket.IO & room state ─────────────────────────────────────────────────

  const socket = io();

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

  socket.on('shared-timer-state', (state) => {
    sharedState = state;
    if (timerMode === 'shared') applySharedState();
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
      el.style.opacity    = '0';
      el.style.transform  = 'scale(0.85)';
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
    renderAll();
  });

  socket.on('room-error', ({ message }) => {
    alert(message);
    window.location.href = '/';
  });

  // ── Status emission ───────────────────────────────────────────────────────

  function currentStatus() {
    if (timerMode === 'shared') {
      if (!sharedState) return statusSelect.value;
      if (!sharedState.running) return statusSelect.value;
      return sharedState.isFocusPhase ? 'Focused' : 'On a Break';
    }
    if (!personalRunning) return statusSelect.value;
    return personalIsFocusPhase ? 'Focused' : 'On a Break';
  }

  function emitStatus() {
    socket.emit('update-status', { status: currentStatus() });
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function statusClass(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('focus'))                       return 'status-focused';
    if (s.includes('break'))                       return 'status-break';
    if (s.includes('pomodoro'))                    return 'status-pomodoro';
    if (s.includes('music'))                       return 'status-music';
    if (s.includes('done'))                        return 'status-done';
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
    const existing = document.getElementById(`card-${CSS.escape(p.id)}`);
    if (existing) existing.remove();

    const isYou = p.id === myId;
    const card  = document.createElement('div');
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
    if (participants.size === 0) { showEmpty(); return; }

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
    badge.className   = `participant-status ${statusClass(status)}`;
  }

  function showEmpty() {
    grid.innerHTML = '<div class="empty-room-msg">Waiting for others to join…<br>Share your room ID!</div>';
  }

})();
