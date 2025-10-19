// Простая версия JavaScript для переключения вкладок
function showGenerator() {
  console.log('Показываем генератор');
  
  // Убираем активный класс со всех вкладок
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  // Добавляем активный класс к вкладке генератора
  document.getElementById('generator-tab').classList.add('active');
  
  // Скрываем секцию сохраненных паролей
  const savedSection = document.getElementById('saved-passwords-section');
  if (savedSection) {
    savedSection.style.display = 'none';
  }
  
  // Показываем секцию генератора
  const generatorSection = document.querySelector('.layout');
  if (generatorSection) {
    generatorSection.style.display = 'grid';
  }
}

function showSavedPasswords() {
  console.log('Показываем сохраненные пароли');
  
  // Убираем активный класс со всех вкладок
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  // Добавляем активный класс к вкладке сохраненных
  document.getElementById('saved-tab').classList.add('active');
  
  // Скрываем секцию генератора
  const generatorSection = document.querySelector('.layout');
  if (generatorSection) {
    generatorSection.style.display = 'none';
  }
  
  // Показываем секцию сохраненных паролей
  const savedSection = document.getElementById('saved-passwords-section');
  if (savedSection) {
    savedSection.style.display = 'block';
    console.log('Секция сохраненных паролей показана');
  }
}

function showPasswordForm(mode, data = {}) {
  console.log('Показываем форму пароля, режим:', mode);
  
  const form = document.getElementById('password-form');
  const title = document.getElementById('form-title');
  const websiteInput = document.getElementById('website-input');
  const loginInput = document.getElementById('login-input');
  const passwordInput = document.getElementById('password-input');
  const passwordIdInput = document.getElementById('password-id');
  
  if (form) {
    form.classList.remove('hidden');
  }
  
  if (title) {
    title.textContent = mode === 'edit' ? 'Изменить пароль' : 'Добавить пароль';
  }
  
  if (websiteInput) websiteInput.value = data.website || '';
  if (loginInput) loginInput.value = data.login || '';
  if (passwordInput) passwordInput.value = data.password || '';
  if (passwordIdInput) passwordIdInput.value = data.id || '';
  
  if (websiteInput) websiteInput.focus();
}

function hidePasswordForm() {
  console.log('Скрываем форму пароля');
  
  const form = document.getElementById('password-form');
  if (form) {
    form.classList.add('hidden');
  }
  
  // Очищаем форму
  const formElement = document.getElementById('password-form-element');
  if (formElement) {
    formElement.reset();
  }
  
  const passwordIdInput = document.getElementById('password-id');
  if (passwordIdInput) {
    passwordIdInput.value = '';
  }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM загружен, инициализируем...');
  
  // Показываем генератор по умолчанию
  const generatorSection = document.querySelector('.layout');
  const savedSection = document.getElementById('saved-passwords-section');
  
  if (generatorSection && savedSection) {
    generatorSection.style.display = 'grid';
    savedSection.style.display = 'none';
    console.log('Инициализация завершена');
  }
});
