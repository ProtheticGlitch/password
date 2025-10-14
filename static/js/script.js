const form = document.getElementById('generator-form');
const lengthInput = document.getElementById('length');
const resultsList = document.getElementById('results-list');
const toast = document.getElementById('toast');
// presets removed
const levelSelect = null;
let currentMode = 'password';
// History UI
const showHistoryBtn = document.getElementById('show-history');
const clearHistoryBtn = document.getElementById('clear-history');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const favoritesList = document.getElementById('favorites-list');
const favCount = document.getElementById('fav-count');
const toggleViewBtn = document.getElementById('toggle-view');
const copyAllBtn = document.getElementById('copy-all');
const confettiCanvas = document.getElementById('confetti-canvas');
let confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
let confettiParticles = [];
// strength filter removed

function resizeCanvas() {
  if (!confettiCanvas) return;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

async function loadHistory() {
  const res = await fetch('/history');
  const data = await res.json();
  historyList.innerHTML = '';
  (data.history || []).forEach(it => {
    const li = document.createElement('li');
    li.textContent = it.p;
    historyList.appendChild(li);
  });
  // favorites
  renderFavorites();
  updateFavCounter();
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

function spawnConfetti(x, y) {
  if (!confettiCtx) return;
  const colors = ['#fff', '#4cc9f0', '#f72585', '#80e27e', '#ffb300'];
  for (let i = 0; i < 60; i++) {
    confettiParticles.push({
      x, y,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * -6 - 2,
      g: 0.15 + Math.random() * 0.2,
      s: 2 + Math.random() * 3,
      c: colors[Math.floor(Math.random() * colors.length)],
      a: 1,
      r: Math.random() * Math.PI
    });
  }
}

function stepConfetti() {
  if (!confettiCtx) return;
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParticles.forEach(p => {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.a -= 0.006; p.r += 0.1;
  });
  confettiParticles = confettiParticles.filter(p => p.a > 0 && p.y < confettiCanvas.height + 20);
  confettiParticles.forEach(p => {
    confettiCtx.save();
    confettiCtx.globalAlpha = Math.max(0, p.a);
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.r);
    confettiCtx.fillStyle = p.c;
    confettiCtx.fillRect(-p.s, -p.s, p.s * 2, p.s * 2);
    confettiCtx.restore();
  });
  requestAnimationFrame(stepConfetti);
}
requestAnimationFrame(stepConfetti);

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
  if (item.score_percent >= 90) {
    // салют для отличного пароля
    setTimeout(() => spawnConfetti(window.innerWidth * 0.6, window.innerHeight * 0.25), 50);
  }
  const mascot = document.createElement('span');
  mascot.style.marginRight = '6px';
  const p = item.score_percent;
  mascot.textContent = p >= 90 ? '🛡️' : p >= 70 ? '✅' : p >= 50 ? '⚠️' : p >= 30 ? '❗' : '🕳️';
  const crack = estimateCrackTime(item.bits || 0);
  label.textContent = `Энтропия: ${item.bits || 0} бит · ${crack} · `;
  label.prepend(mascot);
  label.appendChild(badge);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';

  const favBtn = document.createElement('button');
  favBtn.className = 'icon-btn';
  favBtn.type = 'button';
  favBtn.innerHTML = '★ Избранное';
  favBtn.setAttribute('aria-pressed', isFavorite(item.password) ? 'true' : 'false');
  favBtn.addEventListener('click', () => {
    toggleFavorite(item.password);
    favBtn.setAttribute('aria-pressed', isFavorite(item.password) ? 'true' : 'false');
    showToast(isFavorite(item.password) ? 'Добавлено в избранное' : 'Удалено из избранного');
    renderFavorites();
    updateFavCounter();
  });

  actions.appendChild(favBtn);
  

  wrapper.appendChild(pass);
  wrapper.appendChild(copyBtn);
  wrapper.appendChild(meter);
  wrapper.appendChild(label);
  wrapper.appendChild(actions);
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

// checkbox enabling helper removed with presets

// presets removed

function syncUIFromSettings() {
  const saved = JSON.parse(localStorage.getItem('settings') || '{}');
  if (saved.length) lengthInput.value = saved.length;
  if (saved.uppercase !== undefined) cbUpper.checked = saved.uppercase;
  if (saved.lowercase !== undefined) cbLower.checked = saved.lowercase;
  if (saved.numbers !== undefined) cbNums.checked = saved.numbers;
  if (saved.symbols !== undefined) cbSyms.checked = saved.symbols;
  if (saved.count) document.getElementById('count').value = saved.count;
  
}

function saveSettings(payload) {
  localStorage.setItem('settings', JSON.stringify(payload));
}

// manual numeric input — no slider label updates

// режим пассфразы удалён

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    length: Number(document.getElementById('length').value),
    level: 'custom',
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

// footer year
const yearEl = document.getElementById('year');
if (yearEl) { yearEl.textContent = new Date().getFullYear(); }

// Ctrl+Enter to generate
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    form?.requestSubmit?.();
  }
});

function currentUserKey() {
  const root = document.getElementById('app-root');
  const name = root?.getAttribute('data-user') || 'guest';
  return `favorites:${name}`;
}
function favoritesStorage() {
  const raw = localStorage.getItem(currentUserKey());
  try { return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []; } catch { return []; }
}
function saveFavorites(arr) { localStorage.setItem(currentUserKey(), JSON.stringify(arr.slice(0, 200))); }
function isFavorite(pwd) { return favoritesStorage().includes(pwd); }
function toggleFavorite(pwd) {
  const list = favoritesStorage();
  const idx = list.indexOf(pwd);
  if (idx >= 0) list.splice(idx, 1); else list.unshift(pwd);
  saveFavorites(list);
}
function renderFavorites() {
  if (!favoritesList) return;
  const favs = favoritesStorage();
  favoritesList.innerHTML = '';
  favs.forEach(p => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = p;
    text.style.flex = '1 1 auto';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn';
    removeBtn.textContent = 'Удалить';
    removeBtn.addEventListener('click', () => {
      toggleFavorite(p);
      renderFavorites();
      updateFavCounter();
      showToast('Удалено из избранного');
    });

    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.gap = '8px';
    li.appendChild(text);
    li.appendChild(removeBtn);
    favoritesList.appendChild(li);
  });
}

// mask toggle removed

// strength filter removed

// toggle view
function setViewMode(mode) {
  const compact = mode === 'compact';
  resultsList.classList.toggle('compact', compact);
  localStorage.setItem('viewMode', compact ? 'compact' : 'cards');
  if (toggleViewBtn) toggleViewBtn.textContent = compact ? 'Вид: список' : 'Вид: карточки';
}
if (toggleViewBtn) {
  toggleViewBtn.addEventListener('click', () => {
    const current = localStorage.getItem('viewMode') || 'cards';
    setViewMode(current === 'cards' ? 'compact' : 'cards');
  });
  setViewMode(localStorage.getItem('viewMode') || 'cards');
}

function updateFavCounter() {
  if (favCount) favCount.textContent = String(favoritesStorage().length);
}

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


