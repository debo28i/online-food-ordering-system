const form = document.querySelector('[data-signup-form]');
const statusEl = document.querySelector('[data-signup-status]');
const nameInput = document.querySelector('#name');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const confirmPasswordInput = document.querySelector('#confirm-password');
const toggleBtn = document.querySelector('[data-toggle-password]');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setFieldError(input, message) {
  const field = input.closest('[data-field]');
  const error = field?.querySelector('[data-error]');
  field?.classList.toggle('has-error', Boolean(message));
  if (error) error.textContent = message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function validateName() { return nameInput.value.trim().length >= 2 ? '' : 'Please enter your full name.'; }
function validateEmail() { return emailPattern.test(emailInput.value.trim()) ? '' : 'Enter a valid email address, e.g. name@example.com.'; }
function validatePassword() { return passwordInput.value.length >= 8 ? '' : 'Password must be at least 8 characters.'; }
function validateConfirmation() {
  if (!confirmPasswordInput.value) return 'Please confirm your password.';
  return passwordInput.value === confirmPasswordInput.value ? '' : 'Passwords do not match.';
}

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    confirmPasswordInput.type = show ? 'text' : 'password';
    toggleBtn.textContent = show ? 'Hide' : 'Show';
    toggleBtn.setAttribute('aria-label', show ? 'Hide passwords' : 'Show passwords');
  });
}

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const checks = [[nameInput, validateName()], [emailInput, validateEmail()], [passwordInput, validatePassword()], [confirmPasswordInput, validateConfirmation()]];
    checks.forEach(([input, message]) => setFieldError(input, message));
    const firstInvalid = checks.find(([, message]) => message);
    if (firstInvalid) {
      statusEl.textContent = 'Please fix the highlighted fields and try again.';
      statusEl.classList.add('is-error');
      firstInvalid[0].focus();
      return;
    }
    statusEl.textContent = 'Welcome to FOODIE.';
    statusEl.classList.remove('is-error');
  });
}
