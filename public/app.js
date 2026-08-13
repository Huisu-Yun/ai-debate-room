const aiOptionsEl = document.getElementById('aiOptions');
const errorEl = document.getElementById('errorMsg');

async function loadConfig() {
  const res = await fetch('/api/config');
  const data = await res.json();
  aiOptionsEl.innerHTML = '';
  data.aiCatalog.forEach((ai) => {
    const row = document.createElement('label');
    row.className = 'ai-option' + (ai.configured ? '' : ' disabled');
    row.style.margin = '0';
    row.innerHTML = `
      <input type="checkbox" data-ai-id="${ai.id}" ${ai.configured ? 'checked' : 'disabled'} />
      <span class="name">${ai.name}</span>
      <span class="hint">${ai.configured ? '' : 'API 키 필요'}</span>
    `;
    aiOptionsEl.appendChild(row);
  });
}

document.getElementById('createBtn').addEventListener('click', async () => {
  errorEl.style.display = 'none';
  const topic = document.getElementById('topic').value.trim();
  const intervalSec = document.getElementById('interval').value;
  const aiIds = Array.from(aiOptionsEl.querySelectorAll('input[type="checkbox"]:checked')).map(
    (el) => el.dataset.aiId
  );

  if (!topic) {
    errorEl.textContent = '토론 주제를 입력해주세요.';
    errorEl.style.display = 'block';
    return;
  }

  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, intervalSec, aiIds }),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = data.error || '방을 만들지 못했습니다.';
    errorEl.style.display = 'block';
    return;
  }
  window.location.href = `/room/${data.id}`;
});

loadConfig();
