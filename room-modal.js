// Homepage modal — handles Create Room and Join Room flows.
// Runs only on index.html; no socket connection here.

(function () {
  const AVATARS = [
    '🐱','🐶','🦊','🐻','🐼','🐨','🐸','🦝',
    '🦇','🦋','🌸','🍵','📚','🌙','⭐','🎵','🌿',
  ];

  let selectedAvatar = AVATARS[0];
  let modalMode = 'create'; // 'create' | 'join'

  const overlay      = document.getElementById('modalOverlay');
  const modalTitle   = document.getElementById('modalTitle');
  const roomIdField  = document.getElementById('roomIdField');
  const roomIdInput  = document.getElementById('roomIdInput');
  const nicknameInput= document.getElementById('nicknameInput');
  const avatarGrid   = document.getElementById('avatarGrid');
  const submitBtn    = document.getElementById('modalSubmit');
  const modalClose   = document.getElementById('modalClose');
  const modalError   = document.getElementById('modalError');

  // Build avatar picker
  AVATARS.forEach((emoji, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-option' + (i === 0 ? ' selected' : '');
    btn.textContent = emoji;
    btn.setAttribute('aria-label', emoji);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAvatar = emoji;
    });
    avatarGrid.appendChild(btn);
  });

  function openModal(mode) {
    modalMode = mode;
    modalError.textContent = '';
    submitBtn.disabled = false;

    if (mode === 'create') {
      modalTitle.textContent = 'Create Study Room';
      roomIdField.style.display = 'none';
      submitBtn.textContent = 'Create Room';
    } else {
      modalTitle.textContent = 'Enter a Study Room';
      roomIdField.style.display = 'block';
      roomIdInput.value = '';
      submitBtn.textContent = 'Join Room';
    }

    overlay.classList.add('active');
    // Focus the first relevant input
    setTimeout(() => {
      (mode === 'join' ? roomIdInput : nicknameInput).focus();
    }, 50);
  }

  function closeModal() {
    overlay.classList.remove('active');
  }

  document.getElementById('createRoomBtn').addEventListener('click', () => openModal('create'));
  document.getElementById('joinRoomBtn').addEventListener('click', () => openModal('join'));
  modalClose.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Allow Enter key to submit
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter') submitBtn.click();
  });

  submitBtn.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim() || 'Anonymous';
    modalError.textContent = '';

    if (modalMode === 'create') {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating…';

      try {
        const res = await fetch('/api/rooms', { method: 'POST' });
        if (!res.ok) throw new Error('Server error');
        const { roomId } = await res.json();
        window.location.href =
          `/room.html?id=${roomId}&nick=${encodeURIComponent(nickname)}&avatar=${encodeURIComponent(selectedAvatar)}`;
      } catch {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Room';
        modalError.textContent = 'Could not create room — is the server running?';
      }

    } else {
      const roomId = roomIdInput.value.trim().toUpperCase();
      if (roomId.length !== 6) {
        modalError.textContent = 'Please enter a valid 6-character room ID.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking…';

      try {
        const res = await fetch(`/api/rooms/${roomId}`);
        if (!res.ok) {
          modalError.textContent = 'Room not found. Double-check the ID and try again.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Join Room';
          return;
        }
        window.location.href =
          `/room.html?id=${roomId}&nick=${encodeURIComponent(nickname)}&avatar=${encodeURIComponent(selectedAvatar)}`;
      } catch {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Join Room';
        modalError.textContent = 'Could not connect to server — is it running?';
      }
    }
  });
})();
