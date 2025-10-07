const form = document.getElementById('generator-form');
const lengthInput = document.getElementById('length');
const lengthValue = document.getElementById('length-value');
const resultsList = document.getElementById('results-list');
const toast = document.getElementById('toast');
const levelSelect = document.getElementById('level');
let currentMode = 'password';
// History UI
const showHistoryBtn = document.getElementById('show-history');
const clearHistoryBtn = document.getElementById('clear-history');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const copyAllBtn = document.getElementById('copy-all');

async function loadHistory() {
  const res = await fetch('/history');
  const data = await res.json();
  historyList.innerHTML = '';
  (data.history || []).forEach(it => {
    const li = document.createElement('li');
    li.textContent = it.p;
    historyList.appendChild(li);
  });
}

showHistoryBtn?.addEventListener('click', async () => {
  historyPanel.classList.toggle('hidden');
  if (!historyPanel.classList.contains('hidden')) {
    await loadHistory();
  }
});

clearHistoryBtn?.addEventListener('click', async () => {
  await fetch('/clear_history', { method: 'POST' });
  await loadHistory();
  showToast('История очищена');
});

copyAllBtn?.addEventListener('click', async () => {
  const texts = Array.from(document.querySelectorAll('.password')).map(x => x.textContent.replace(/^🔒\s*/, ''));
  if (!texts.length) { showToast('Нет данных для копирования'); return; }
  try {
    await navigator.clipboard.writeText(texts.join('\n'));
    showToast('Скопировано все');
  } catch {
    showToast('Не удалось скопировать');
  }
});
const cbUpper = document.getElementById('uppercase');
const cbLower = document.getElementById('lowercase');
const cbNums = document.getElementById('numbers');
const cbSyms = document.getElementById('symbols');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function strengthToColor(percent) {
  if (percent >= 80) return 'var(--ok)';
  if (percent >= 60) return '#80e27e';
  if (percent >= 40) return 'var(--warn)';
  return 'var(--bad)';
}

function createCard(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card';

  const pass = document.createElement('div');
  pass.className = 'password';
  pass.textContent = `🔒 ${item.password}`;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Копировать';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(item.password);
      showToast('Пароль скопирован');
    } catch (e) {
      showToast('Не удалось скопировать');
    }
  });

  const meter = document.createElement('div');
  meter.className = 'meter';
  const fill = document.createElement('div');
  fill.className = 'meter-fill';
  fill.style.width = `${item.score_percent}%`;
  fill.style.background = strengthToColor(item.score_percent);
  meter.appendChild(fill);

  const label = document.createElement('div');
  label.className = 'meter-label';
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = item.strength;
  badge.style.background = strengthToColor(item.score_percent);
  const mascot = document.createElement('span');
  mascot.style.marginRight = '6px';
  const p = item.score_percent;
  mascot.textContent = p >= 90 ? '🛡️' : p >= 70 ? '✅' : p >= 50 ? '⚠️' : p >= 30 ? '❗' : '🕳️';
  const crack = estimateCrackTime(item.bits || 0);
  label.textContent = `Энтропия: ${item.bits || 0} бит · ${crack} · `;
  label.prepend(mascot);
  label.appendChild(badge);

  wrapper.appendChild(pass);
  wrapper.appendChild(copyBtn);
  wrapper.appendChild(meter);
  wrapper.appendChild(label);
  return wrapper;
}

function estimateCrackTime(bits) {
  // Приблизительно: 1e12 попыток/сек (современные GPU кластеры)
  const attemptsPerSec = 1e12;
  const space = Math.pow(2, Math.max(0, bits));
  const seconds = space / attemptsPerSec;
  if (seconds < 1) return 'мгновенно';
  let value = seconds; let idx = 0;
  const names = ['сек', 'мин', 'ч', 'дн', 'лет', 'веков'];
  const divs = [60, 60, 24, 365, 100, 10];
  while (idx < divs.length && value >= divs[idx]) {
    value /= divs[idx];
    idx++;
  }
  // Если вышли за пределы шкалы — показываем как «веков+»
  if (idx >= names.length) {
    return 'веков+';
  }
  return `${value.toFixed(1)} ${names[idx]}`;
}

function setCheckboxesDisabled(disabled) {
  [cbUpper, cbLower, cbNums, cbSyms].forEach(cb => {
    cb.disabled = disabled;
    const parent = cb.closest('.checkbox');
    if (parent) parent.classList.toggle('is-disabled', disabled);
  });
}

function applyPreset(level) {
  if (level === 'low') {
    cbLower.checked = true; cbUpper.checked = false; cbNums.checked = true; cbSyms.checked = false;
    setCheckboxesDisabled(true);
  } else if (level === 'medium') {
    cbLower.checked = true; cbUpper.checked = true; cbNums.checked = true; cbSyms.checked = false;
    setCheckboxesDisabled(true);
  } else if (level === 'high' || level === 'max') {
    cbLower.checked = true; cbUpper.checked = true; cbNums.checked = true; cbSyms.checked = true;
    setCheckboxesDisabled(true);
  } else {
    // custom
    setCheckboxesDisabled(false);
  }
}

levelSelect.addEventListener('change', () => {
  applyPreset(levelSelect.value);
  // сохранить выбранный пресет сразу
  const saved = JSON.parse(localStorage.getItem('settings') || '{}');
  saved.level = levelSelect.value;
  localStorage.setItem('settings', JSON.stringify(saved));
});

// Если пользователь меняет чекбоксы — автоматически переключаемся на custom
[cbUpper, cbLower, cbNums, cbSyms].forEach(cb => {
  cb.addEventListener('change', () => {
    if (levelSelect.value !== 'custom') {
      levelSelect.value = 'custom';
      applyPreset('custom');
    }
  });
});

function syncUIFromSettings() {
  const saved = JSON.parse(localStorage.getItem('settings') || '{}');
  if (saved.length) lengthInput.value = saved.length;
  if (saved.level) levelSelect.value = saved.level;
  if (saved.uppercase !== undefined) cbUpper.checked = saved.uppercase;
  if (saved.lowercase !== undefined) cbLower.checked = saved.lowercase;
  if (saved.numbers !== undefined) cbNums.checked = saved.numbers;
  if (saved.symbols !== undefined) cbSyms.checked = saved.symbols;
  if (saved.count) document.getElementById('count').value = saved.count;
  lengthValue.textContent = lengthInput.value;
  applyPreset(levelSelect.value || 'custom');
}

function saveSettings(payload) {
  localStorage.setItem('settings', JSON.stringify(payload));
}

lengthInput.addEventListener('input', () => {
  lengthValue.textContent = lengthInput.value;
});

// режим пассфразы удалён

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    length: Number(document.getElementById('length').value),
    level: levelSelect.value,
    uppercase: cbUpper.checked,
    lowercase: cbLower.checked,
    numbers: cbNums.checked,
    symbols: cbSyms.checked,
    count: Number(document.getElementById('count').value),
    mode: currentMode
  };

  saveSettings(payload);

  const btn = document.getElementById('generate-btn');
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Генерация…';
  try {
    const res = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    resultsList.innerHTML = '';
    if (data.error) {
      showToast('Ошибка: ' + data.error);
    } else {
      data.passwords.forEach(p => resultsList.appendChild(createCard(p)));
    }
  } catch (err) {
    showToast('Ошибка сети');
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
});

// init
syncUIFromSettings();
lengthValue.textContent = lengthInput.value;

// Theme toggle удалён по запросу пользователя

// поддержка ripple координат
document.addEventListener('pointerdown', (e) => {
  const target = e.target.closest('button, .toolbar a.ghost');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  target.style.setProperty('--x', x + '%');
  target.style.setProperty('--y', y + '%');
});


