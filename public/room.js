const roomId = window.location.pathname.split('/').pop();
const storageKey = `debate:${roomId}`;

const messagesEl = document.getElementById('messages');
const joinOverlay = document.getElementById('joinOverlay');
const joinTopicPreview = document.getElementById('joinTopicPreview');
const joinError = document.getElementById('joinError');
const toggleBtn = document.getElementById('toggleBtn');
const toggleLabel = document.getElementById('toggleLabel');
const statusDot = document.getElementById('statusDot');

let me = null; // { participantId, name }
let lastSeq = 0;
let autoActive = false;
let roomInfo = null;

function aiChipClass(id) {
  if (id === 'gpt') return 'ai-gpt';
  if (id === 'gemini') return 'ai-gemini';
  if (id === 'claude') return 'ai-claude';
  return '';
}

function renderChips() {
  const chipsEl = document.getElementById('chips');
  chipsEl.innerHTML = '';
  (roomInfo.aiParticipants || []).forEach((p) => {
    const c = document.createElement('span');
    c.className = `chip ${aiChipClass(p.id)}`;
    c.textContent = `🤖 ${p.name}`;
    chipsEl.appendChild(c);
  });
  const humanCount = (roomInfo.humanParticipants || []).length;
  if (humanCount > 0) {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = `🙋 참가자 ${humanCount}명`;
    chipsEl.appendChild(c);
  }
}

function updateToggleUI() {
  toggleLabel.textContent = autoActive ? '자동 토론 진행 중 (누르면 정지)' : '정지됨 (누르면 재개)';
  statusDot.classList.toggle('active', autoActive);
}

function isNearBottom() {
  return window.innerHeight + window.scrollY >= document.body.scrollHeight - 150;
}

function renderMessage(m) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${m.type}`;
  if (m.type === 'system') {
    wrap.innerHTML = `<div class="bubble">${escapeHtml(m.content)}</div>`;
  } else {
    const time = new Date(m.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    wrap.innerHTML = `<div class="meta">${escapeHtml(m.name)} · ${time}</div><div class="bubble">${escapeHtml(m.content)}</div>`;
  }
  messagesEl.appendChild(wrap);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function loadRoomInfo() {
  const res = await fetch(`/api/rooms/${roomId}`);
  if (!res.ok) {
    document.getElementById('roomTopic').textContent = '방을 찾을 수 없습니다.';
    return null;
  }
  roomInfo = await res.json();
  document.getElementById('roomTopic').textContent = `💬 ${roomInfo.topic}`;
  joinTopicPreview.textContent = `주제: ${roomInfo.topic}`;
  autoActive = roomInfo.autoActive;
  updateToggleUI();
  renderChips();
  return roomInfo;
}

async function poll() {
  try {
    const res = await fetch(`/api/rooms/${roomId}/messages?since=${lastSeq}`);
    if (!res.ok) return;
    const data = await res.json();
    const stick = isNearBottom();
    data.messages.forEach((m) => {
      renderMessage(m);
      lastSeq = Math.max(lastSeq, m.id);
    });
    if (data.messages.length && stick) {
      window.scrollTo({ top: document.body.scrollHeight });
    }
    autoActive = data.autoActive;
    updateToggleUI();
    if (roomInfo) roomInfo.humanParticipants = data.humanParticipants;
  } catch (e) {
    // 네트워크 순간 오류는 다음 폴링에서 알아서 재시도되므로 조용히 무시
  }
}

async function ensureJoined() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    me = JSON.parse(saved);
    joinOverlay.style.display = 'none';
    return;
  }
  joinOverlay.style.display = 'flex';
}

document.getElementById('joinBtn').addEventListener('click', async () => {
  const name = document.getElementById('nameInput').value.trim();
  joinError.style.display = 'none';
  if (!name) {
    joinError.textContent = '이름을 입력해주세요.';
    joinError.style.display = 'block';
    return;
  }
  const res = await fetch(`/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) {
    joinError.textContent = data.error || '입장하지 못했습니다.';
    joinError.style.display = 'block';
    return;
  }
  me = { participantId: data.participantId, name: data.name };
  localStorage.setItem(storageKey, JSON.stringify(me));
  joinOverlay.style.display = 'none';
});

async function sendMessage() {
  const input = document.getElementById('input');
  const content = input.value.trim();
  if (!content || !me) return;
  input.value = '';
  input.style.height = 'auto';
  await fetch(`/api/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participantId: me.participantId, content }),
  });
  poll();
}

document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
document.getElementById('input').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
});

toggleBtn.addEventListener('click', async () => {
  const action = autoActive ? 'pause' : 'start';
  const res = await fetch(`/api/rooms/${roomId}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const data = await res.json();
  if (res.ok) {
    autoActive = data.autoActive;
    updateToggleUI();
  }
});

document.getElementById('shareBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    document.getElementById('shareBtn').textContent = '✅ 복사됨';
    setTimeout(() => { document.getElementById('shareBtn').textContent = '🔗 링크 공유'; }, 1500);
  } catch (e) {
    prompt('아래 링크를 복사하세요:', window.location.href);
  }
});

(async function init() {
  const info = await loadRoomInfo();
  if (!info) return;
  await ensureJoined();
  await poll();
  setInterval(poll, 2500);
})();
