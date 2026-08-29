/**
 * Login page — client-side validation + REAL backend auth via js/api.js
 * (POST /api/auth/login, /api/auth/register). On success the JWT is stored
 * (handled inside API.login/register) and we redirect to the dashboard.
 */

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggle();
  initFormValidation();
  initForgotPassword();
  initGoogleLogin();
  initRegisterForm();

  document.getElementById('createAccountLink').addEventListener('click', (e) => {
    e.preventDefault();
    openModal('registerModal');
  });
});

function initPasswordToggle() {
  const toggle = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');
  toggle.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggle.textContent = isPassword ? 'HIDE' : 'SHOW';
  });
}

function initFormValidation() {
  const form = document.getElementById('loginForm');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const emailField = document.getElementById('emailField');
  const passwordField = document.getElementById('passwordField');
  const submitBtn = document.getElementById('loginSubmit');
  const submitText = document.getElementById('loginSubmitText');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    const passwordValid = password.value.trim().length >= 6;

    emailField.classList.toggle('has-error', !emailValid);
    passwordField.classList.toggle('has-error', !passwordValid);

    if (!emailValid || !passwordValid) return;

    submitBtn.disabled = true;
    submitText.innerHTML = '<span class="spinner"></span> Logging in…';

    API.login(email.value.trim(), password.value)
      .then(() => {
        toast('Login successful — welcome back!', 'success');
        setTimeout(() => { window.location.href = 'index.html'; }, 400);
      })
      .catch((err) => {
        toast(err.message || 'Login failed', 'error');
        submitBtn.disabled = false;
        submitText.textContent = 'Log In';
      });
  });

  [email, password].forEach((input) => {
    input.addEventListener('input', () => {
      input.closest('.field').classList.remove('has-error');
    });
  });
}

function initRegisterForm() {
  const form = document.getElementById('registerForm');
  if (!form) return;

  const nameInput = document.getElementById('registerName');
  const emailInput = document.getElementById('registerEmail');
  const passwordInput = document.getElementById('registerPassword');
  const nameField = document.getElementById('registerNameField');
  const emailField = document.getElementById('registerEmailField');
  const passwordField = document.getElementById('registerPasswordField');
  const submitBtn = document.getElementById('registerSubmit');
  const submitText = document.getElementById('registerSubmitText');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const nameValid = nameInput.value.trim().length >= 2;
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim());
    const pwd = passwordInput.value;
    const passwordValid = pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /[0-9]/.test(pwd);

    nameField.classList.toggle('has-error', !nameValid);
    emailField.classList.toggle('has-error', !emailValid);
    passwordField.classList.toggle('has-error', !passwordValid);

    if (!nameValid || !emailValid || !passwordValid) return;

    submitBtn.disabled = true;
    submitText.innerHTML = '<span class="spinner"></span> Creating account…';

    API.register(nameInput.value.trim(), emailInput.value.trim(), pwd)
      .then(() => {
        toast('Account created — welcome!', 'success');
        closeModal('registerModal');
        setTimeout(() => { window.location.href = 'index.html'; }, 400);
      })
      .catch((err) => {
        toast(err.message || 'Registration failed', 'error');
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitText.textContent = 'Create account';
      });
  });

  [nameInput, emailInput, passwordInput].forEach((input) => {
    input.addEventListener('input', () => {
      input.closest('.field').classList.remove('has-error');
    });
  });
}

function initForgotPassword() {
  document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    openModal('forgotModal');
  });

  document.getElementById('sendResetBtn').addEventListener('click', () => {
    const resetEmail = document.getElementById('resetEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) {
      toast('Enter a valid email to receive a reset link', 'error');
      return;
    }
    closeModal('forgotModal');
    toast(`Reset link sent to ${resetEmail} (demo — password reset isn't implemented on the backend yet)`, 'success');
  });
}

function initGoogleLogin() {
  document.getElementById('googleLoginBtn').addEventListener('click', () => {
    toast('Google sign-in is not implemented on the backend — please use email/password.', 'error');
  });
}
