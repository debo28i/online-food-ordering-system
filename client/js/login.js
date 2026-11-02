const form = document.querySelector('[data-login-form]');
const statusEl = document.querySelector('[data-login-status]');
const submitBtn = document.querySelector('[data-submit]');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const toggleBtn = document.querySelector('[data-toggle-password]');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setFieldError(input, message) {
  const field = input.closest('[data-field]');
  const error = field ? field.querySelector('[data-error]') : null;
  if (field) field.classList.toggle('has-error', Boolean(message));
  if (error) error.textContent = message || '';
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('is-error', isError);
}

function validateEmail() {
  const value = emailInput.value.trim();
  if (!value) return 'Please enter your email address.';
  if (!emailPattern.test(value)) return 'Enter a valid email address, e.g. name@example.com.';
  return '';
}

function validatePassword() {
  const value = passwordInput.value;
  if (!value) return 'Please enter your password.';
  if (value.length < 8) return 'Password must be at least 8 characters.';
  return '';
}

if (toggleBtn && passwordInput) {
  toggleBtn.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    toggleBtn.textContent = show ? 'Hide' : 'Show';
    toggleBtn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    passwordInput.focus();
  });
}

if (emailInput) {
  emailInput.addEventListener('input', () => {
    if (emailInput.closest('[data-field]')?.classList.contains('has-error')) {
      setFieldError(emailInput, validateEmail());
    }
  });
}

if (passwordInput) {
  passwordInput.addEventListener('input', () => {
    if (passwordInput.closest('[data-field]')?.classList.contains('has-error')) {
      setFieldError(passwordInput, validatePassword());
    }
  });
}

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setStatus('');

    const emailError = validateEmail();
    const passwordError = validatePassword();
    setFieldError(emailInput, emailError);
    setFieldError(passwordInput, passwordError);

    if (emailError || passwordError) {
      setStatus('Please fix the highlighted fields and try again.', true);
      (emailError ? emailInput : passwordInput).focus();
      return;
    }

    setStatus('Welcome back.');
  });
}

