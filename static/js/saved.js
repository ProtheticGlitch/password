// Лёгкий модуль для вкладки «Сохраненные»
// Работает совместно с основным script.js

(function() {
  function qs(id) { return document.getElementById(id); }
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  }

  // Переключатели вкладок из шапки
  window.showGenerator = function showGenerator() {
    qs('generator-tab')?.classList.add('active');
    qs('saved-tab')?.classList.remove('active');
    const controls = document.querySelector('.controls');
    const results = document.querySelector('.results');
    if (controls) controls.style.display = '';
    if (results) results.style.display = '';
    qs('saved-passwords-section').style.display = 'none';
  };

  window.showSavedPasswords = function showSavedPasswords() {
    qs('saved-tab')?.classList.add('active');
    qs('generator-tab')?.classList.remove('active');
    const controls = document.querySelector('.controls');
    const results = document.querySelector('.results');
    if (controls) controls.style.display = 'none';
    if (results) results.style.display = 'none';
    qs('saved-passwords-section').style.display = 'block';
    loadSavedPasswords();
  };

  // Форма Добавить/Изменить
  window.showPasswordForm = function showPasswordForm(mode, data = {}) {
    // Переключаемся на вкладку «Сохраненные», чтобы форма была видна
    try { window.showSavedPasswords(); } catch (_) {}
    qs('form-title').textContent = mode === 'edit' ? 'Изменить пароль' : 'Добавить пароль';
    qs('password-id').value = data.id || '';
    qs('website-input').value = data.website || '';
    qs('login-input').value = data.login || '';
    qs('password-input').value = data.password || '';
    qs('password-form').classList.remove('hidden');
    qs('website-input').focus();
    showToast('Открыта форма сохранения');
  };

  window.hidePasswordForm = function hidePasswordForm() {
    qs('password-form').classList.add('hidden');
    qs('password-form-element').reset();
    qs('password-id').value = '';
  };

  // Переключатель видимости поля Пароль в форме
  window.toggleFormPassword = function toggleFormPassword() {
    const input = qs('password-input');
    const btn = qs('toggle-password-btn');
    if (!input || !btn) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? '🙈' : '👁️';
    btn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  };

  window.handlePasswordFormSubmit = async function handlePasswordFormSubmit(e) {
    e.preventDefault();
    const id = qs('password-id').value.trim();
    const payload = {
      website: qs('website-input').value.trim(),
      login: qs('login-input').value.trim(),
      password: qs('password-input').value.trim(),
    };
    if (!payload.website || !payload.login || !payload.password) {
      showToast('Заполните все поля');
      return;
    }
    const url = id ? `/saved_passwords/${id}` : '/saved_passwords';
    const method = id ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) return showToast('Ошибка: ' + data.error);
      showToast(data.message || 'Сохранено');
      hidePasswordForm();
      await loadSavedPasswords();
    } catch {
      showToast('Ошибка сети');
    }
  };

  async function loadSavedPasswords() {
    try {
      const res = await fetch('/saved_passwords', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.error) return showToast('Ошибка: ' + data.error);
      renderTable(data.passwords || []);
    } catch {
      showToast('Ошибка сети');
    }
  }

  function renderTable(items) {
    const tbody = qs('passwords-tbody');
    tbody.innerHTML = '';
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:18px; color:var(--muted)">Нет сохраненных паролей</td></tr>';
      return;
    }
    for (const row of items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.website)}</td>
        <td>${escapeHtml(row.login)}</td>
        <td class="password-cell">
          <span class="password-masked" data-password="${escapeHtml(row.password)}">••••••••</span>
          <button class="toggle-password" data-password="${escapeHtml(row.password)}">👁️</button>
        </td>
        <td class="password-actions">
          <button class="copy-password" data-password="${escapeHtml(row.password)}">Копировать</button>
          <button class="edit-password" data-id="${row.id}" data-website="${escapeHtml(row.website)}" data-login="${escapeHtml(row.login)}" data-password="${escapeHtml(row.password)}">Изменить</button>
          <button class="delete-password danger" data-id="${row.id}">Удалить</button>
        </td>`;
      tbody.appendChild(tr);
    }
    bindRowActions();
  }

  function bindRowActions() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pw = e.currentTarget.getAttribute('data-password');
        const span = e.currentTarget.previousElementSibling;
        const masked = span.classList.contains('password-masked');
        if (masked) { span.textContent = pw; span.classList.remove('password-masked'); e.currentTarget.textContent = '🙈'; }
        else { span.textContent = '••••••••'; span.classList.add('password-masked'); e.currentTarget.textContent = '👁️'; }
      });
    });
    document.querySelectorAll('.copy-password').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const pw = e.currentTarget.getAttribute('data-password');
        try { await navigator.clipboard.writeText(pw); showToast('Пароль скопирован'); } catch { showToast('Не удалось скопировать'); }
      });
    });
    document.querySelectorAll('.edit-password').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const t = e.currentTarget;
        window.showPasswordForm('edit', {
          id: t.getAttribute('data-id'),
          website: t.getAttribute('data-website'),
          login: t.getAttribute('data-login'),
          password: t.getAttribute('data-password'),
        });
      });
    });
    document.querySelectorAll('.delete-password').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (!confirm('Удалить запись?')) return;
        try {
          const res = await fetch(`/saved_passwords/${id}`, { method: 'DELETE', credentials: 'same-origin' });
          const data = await res.json();
          if (data.error) return showToast('Ошибка: ' + data.error);
          showToast('Удалено');
          await loadSavedPasswords();
        } catch { showToast('Ошибка сети'); }
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Показ генератора по умолчанию
  document.addEventListener('DOMContentLoaded', () => {
    const saved = qs('saved-passwords-section');
    if (saved) { saved.style.display = 'none'; }
  });
})();


