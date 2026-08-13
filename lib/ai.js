// 세 AI 서비스(OpenAI/GPT, Google Gemini, Anthropic/Claude) 호출을 한 군데로 모아둔 파일.
// 각 함수는 (topic, transcript, personaName) 을 받아서 다음 토론 발언 한 마디(문자열)를 반환합니다.
// transcript 는 [{ name, content }, ...] 형태의 지금까지의 대화 기록입니다.

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

function buildSystemPrompt(personaName, topic) {
  return [
    `당신은 "${personaName}"이라는 이름으로 여러 참가자(다른 AI들 및 사람)와 함께 진행되는 온라인 토론에 참여하고 있습니다.`,
    `토론 주제: "${topic}"`,
    '규칙:',
    '- 반드시 한국어로 답변하세요.',
    '- 3~5문장 정도의 분량으로, 직전 발언들에 실제로 반응하며 자신의 논지를 펼치세요.',
    '- 무조건 동의만 하지 말고, 필요하면 다른 참가자의 주장에 근거를 들어 반박하거나 새로운 관점을 제시하세요.',
    '- 예의는 지키되 토론이니만큼 분명한 입장을 가지세요.',
    '- 발언 앞에 자신의 이름이나 따옴표를 붙이지 말고 발언 내용만 출력하세요.',
  ].join('\n');
}

function transcriptToText(transcript) {
  if (transcript.length === 0) return '(아직 아무도 발언하지 않았습니다. 먼저 주제에 대한 입장을 여세요.)';
  return transcript.map((m) => `${m.name}: ${m.content}`).join('\n');
}

async function callOpenAI(topic, transcript, personaName) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(personaName, topic) },
        { role: 'user', content: `지금까지의 대화:\n${transcriptToText(transcript)}\n\n이제 당신 차례입니다.` },
      ],
      temperature: 0.8,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI API 오류 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('OpenAI 응답에서 내용을 찾을 수 없습니다.');
  return content;
}

async function callGemini(topic, transcript, personaName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemPrompt(personaName, topic) }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: `지금까지의 대화:\n${transcriptToText(transcript)}\n\n이제 당신 차례입니다.` }],
        },
      ],
      generationConfig: { temperature: 0.8, maxOutputTokens: 300 },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini API 오류 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
  if (!content) throw new Error('Gemini 응답에서 내용을 찾을 수 없습니다.');
  return content;
}

async function callClaude(topic, transcript, personaName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: buildSystemPrompt(personaName, topic),
      messages: [
        { role: 'user', content: `지금까지의 대화:\n${transcriptToText(transcript)}\n\n이제 당신 차례입니다.` },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API 오류 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.content?.map((p) => p.text).join('').trim();
  if (!content) throw new Error('Claude 응답에서 내용을 찾을 수 없습니다.');
  return content;
}

const PROVIDERS = {
  openai: { call: callOpenAI, isConfigured: () => !!process.env.OPENAI_API_KEY },
  gemini: { call: callGemini, isConfigured: () => !!process.env.GEMINI_API_KEY },
  anthropic: { call: callClaude, isConfigured: () => !!process.env.ANTHROPIC_API_KEY },
};

module.exports = { PROVIDERS };
