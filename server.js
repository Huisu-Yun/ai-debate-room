require('dotenv').config();
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const store = require('./lib/store');
const { PROVIDERS } = require('./lib/ai');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// 방마다 최소/최대로 허용할 자동 발언 간격(초)
const MIN_INTERVAL_SEC = 12;
const MAX_MESSAGES_DEFAULT = 60; // API 비용 폭주 방지용 안전장치

const AI_CATALOG = [
  { id: 'gpt', name: 'GPT', provider: 'openai' },
  { id: 'gemini', name: 'Gemini', provider: 'gemini' },
  { id: 'claude', name: 'Claude', provider: 'anthropic' },
];

function configuredAiCatalog() {
  return AI_CATALOG.map((p) => ({ ...p, configured: PROVIDERS[p.provider].isConfigured() }));
}

function publicRoomView(room) {
  return {
    id: room.id,
    topic: room.topic,
    createdAt: room.createdAt,
    intervalMs: room.intervalMs,
    autoActive: room.autoActive,
    aiParticipants: room.aiParticipants,
    humanParticipants: room.humanParticipants,
    maxMessages: room.maxMessages,
    messageCount: room.messages.length,
  };
}

// ---------- API: 사용 가능한 AI 목록 ----------
app.get('/api/config', (req, res) => {
  res.json({ aiCatalog: configuredAiCatalog() });
});

// ---------- API: 방 생성 ----------
app.post('/api/rooms', (req, res) => {
  const { topic, intervalSec, aiIds } = req.body || {};
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: '토론 주제를 입력해주세요.' });
  }

  const catalog = configuredAiCatalog();
  const chosen = (Array.isArray(aiIds) ? aiIds : [])
    .map((id) => catalog.find((c) => c.id === id))
    .filter((c) => c && c.configured)
    .map(({ id, name, provider }) => ({ id, name, provider }));

  const interval = Math.max(MIN_INTERVAL_SEC, Number(intervalSec) || 20) * 1000;

  const room = {
    id: uuidv4(),
    topic: topic.trim(),
    createdAt: Date.now(),
    intervalMs: interval,
    autoActive: chosen.length > 0,
    aiParticipants: chosen,
    humanParticipants: [],
    messages: [],
    seq: 0,
    nextAiIndex: 0,
    lastMessageAt: Date.now(),
    generating: false,
    maxMessages: MAX_MESSAGES_DEFAULT,
  };

  store.setRoom(room.id, room);
  res.json({ id: room.id });
});

// ---------- API: 방 정보 ----------
app.get('/api/rooms/:id', (req, res) => {
  const room = store.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
  res.json(publicRoomView(room));
});

// ---------- API: 참가(입장) ----------
app.post('/api/rooms/:id/join', (req, res) => {
  const room = store.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });

  const name = (req.body?.name || '').trim().slice(0, 20);
  if (!name) return res.status(400).json({ error: '이름을 입력해주세요.' });

  const participantId = uuidv4();
  room.humanParticipants.push({ id: participantId, name, joinedAt: Date.now() });
  room.messages.push({
    id: ++room.seq,
    participantId: 'system',
    name: '시스템',
    type: 'system',
    content: `${name}님이 입장했습니다.`,
    ts: Date.now(),
  });
  store.setRoom(room.id, room);
  res.json({ participantId, name });
});

// ---------- API: 메시지 조회 (폴링) ----------
app.get('/api/rooms/:id/messages', (req, res) => {
  const room = store.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });

  const since = Number(req.query.since) || 0;
  const messages = room.messages.filter((m) => m.id > since);
  res.json({
    messages,
    autoActive: room.autoActive,
    messageCount: room.messages.length,
    maxMessages: room.maxMessages,
    humanParticipants: room.humanParticipants,
  });
});

// ---------- API: 사람 메시지 전송 ----------
app.post('/api/rooms/:id/messages', (req, res) => {
  const room = store.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });

  const { participantId, content } = req.body || {};
  const participant = room.humanParticipants.find((p) => p.id === participantId);
  if (!participant) return res.status(400).json({ error: '먼저 방에 입장해주세요.' });
  if (!content || !content.trim()) return res.status(400).json({ error: '내용을 입력해주세요.' });

  room.messages.push({
    id: ++room.seq,
    participantId: participant.id,
    name: participant.name,
    type: 'human',
    content: content.trim().slice(0, 1000),
    ts: Date.now(),
  });
  room.lastMessageAt = Date.now();
  store.setRoom(room.id, room);
  res.json({ ok: true });
});

// ---------- API: 자동 토론 시작/정지 ----------
app.post('/api/rooms/:id/control', (req, res) => {
  const room = store.getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });

  const { action } = req.body || {};
  if (action === 'start') {
    if (room.aiParticipants.length === 0) {
      return res.status(400).json({ error: '자동으로 참여할 AI가 없습니다.' });
    }
    room.autoActive = true;
    room.lastMessageAt = Date.now() - room.intervalMs; // 바로 다음 틱에 발언하도록
  } else if (action === 'pause') {
    room.autoActive = false;
  } else {
    return res.status(400).json({ error: '알 수 없는 동작입니다.' });
  }
  store.setRoom(room.id, room);
  res.json({ autoActive: room.autoActive });
});

// ---------- 방 페이지 ----------
app.get('/room/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.get('/health', (req, res) => res.send('ok'));

// ---------- 자동 토론 진행 루프 ----------
async function tick() {
  const rooms = store.allRooms();
  for (const room of rooms) {
    try {
      if (!room.autoActive || room.generating) continue;
      if (room.aiParticipants.length === 0) continue;
      if (room.messages.length >= room.maxMessages) {
        room.autoActive = false;
        room.messages.push({
          id: ++room.seq,
          participantId: 'system',
          name: '시스템',
          type: 'system',
          content: '메시지 한도에 도달해 자동 토론을 멈췄습니다. 필요하면 다시 시작해주세요.',
          ts: Date.now(),
        });
        store.setRoom(room.id, room);
        continue;
      }
      const elapsed = Date.now() - room.lastMessageAt;
      if (elapsed < room.intervalMs) continue;

      room.generating = true;
      store.setRoom(room.id, room);

      const participant = room.aiParticipants[room.nextAiIndex % room.aiParticipants.length];
      room.nextAiIndex += 1;

      const transcript = room.messages
        .filter((m) => m.type !== 'system')
        .slice(-16)
        .map((m) => ({ name: m.name, content: m.content }));

      try {
        const content = await PROVIDERS[participant.provider].call(room.topic, transcript, participant.name);
        room.messages.push({
          id: ++room.seq,
          participantId: participant.id,
          name: participant.name,
          type: 'ai',
          content,
          ts: Date.now(),
        });
        room.lastMessageAt = Date.now();
      } catch (err) {
        console.error(`[${room.id}] ${participant.name} 응답 생성 오류:`, err.message);
        room.messages.push({
          id: ++room.seq,
          participantId: 'system',
          name: '시스템',
          type: 'system',
          content: `${participant.name}의 응답을 가져오지 못했습니다 (${err.message}).`,
          ts: Date.now(),
        });
        // 같은 오류로 바로바로 재시도하며 API를 두들기지 않도록 다음 시도까지 텀을 둡니다.
        room.lastMessageAt = Date.now();
      } finally {
        room.generating = false;
        store.setRoom(room.id, room);
      }
    } catch (outerErr) {
      console.error('틱 처리 중 예상치 못한 오류:', outerErr);
      room.generating = false;
      store.setRoom(room.id, room);
    }
  }
}

setInterval(() => {
  tick().catch((err) => console.error('tick() 오류:', err));
}, 4000);

app.listen(PORT, () => {
  console.log(`AI 토론방 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
