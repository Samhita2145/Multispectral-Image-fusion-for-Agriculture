/**
 * Login page — client-side validation + simulated auth.
 * No backend: on "success" we store a demo session flag and
 * redirect to the dashboard.
 */

document.addEventListener('DOMContentLoaded', () => {
  initPasswordToggle();
  initFormValidation();
  initForgotPassword();
  initGoogleLogin();

  document.getElementById('createAccountLink').addEventListener('click', (e) => {
    e.preventDefault();
    toast('Account creation is disabled in this demo — use any email/password to log in.', 'success');
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

    setTimeout(() => {
      Session.login(email.value.trim());
      toast('Login successful — welcome back!', 'success');
      setTimeout(() => { window.location.href = 'index.html'; }, 500);
    }, 900);
  });

  [email, password].forEach((input) => {
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
    toast(`Reset link sent to ${resetEmail} (demo)`, 'success');
  });
}

function initGoogleLogin() {
  document.getElementById('googleLoginBtn').addEventListener('click', () => {
    toast('Signed in with Google (demo)', 'success');
    Session.login('demo.user@gmail.com');
    setTimeout(() => { window.location.href = 'index.html'; }, 700);
  });
}
