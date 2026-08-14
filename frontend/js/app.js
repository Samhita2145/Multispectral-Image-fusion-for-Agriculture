/**
 * Multispectral Image Fusion For Agriculture
 * app.js — shared utilities loaded on every page:
 *   - active nav-link highlighting based on the current file
 *   - notification / profile icon feedback
 *   - toast notifications
 *   - modal open/close helpers
 *   - animated number counters
 *   - mock auth guard (redirects to login.html if not "logged in")
 */

document.addEventListener('DOMContentLoaded', () => {
  initPrimaryNav();
  initTopBarControls();
  initModalDismiss();
  initCounters();
  initProfileMenu();
});

/* ---------------------------------------------------------
   Nav: highlight the link matching the current page
--------------------------------------------------------- */
function initPrimaryNav() {
  const navLinks = document.querySelectorAll('.nav-link');
  const current = (window.location.pathname.split('/').pop() || 'index.html');

  navLinks.forEach((link) => {
    const href = (link.getAttribute('href') || '').split('/').pop();
    link.classList.remove('nav-link--active');
    link.removeAttribute('aria-current');

    if (href === current || (href === 'index.html' && current === '')) {
      link.classList.add('nav-link--active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

/* ---------------------------------------------------------
   Notification bell + profile menu feedback
--------------------------------------------------------- */
function initTopBarControls() {
  const notificationBtn = document.querySelector('.icon-btn');
  const profileBtn = document.querySelector('.profile-btn');

  if (notificationBtn) {
    notificationBtn.addEventListener('click', () => {
      toast('You have 3 new analysis notifications', 'success');
    });
  }

  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      const menu = document.getElementById('profileMenu');
      if (menu) menu.classList.toggle('is-open');
    });
  }
}

/* ---------------------------------------------------------
   Profile dropdown — show the logged-in user + working logout
--------------------------------------------------------- */
function initProfileMenu() {
  const menu = document.getElementById('profileMenu');
  const profileBtn = document.querySelector('.profile-btn');
  if (!menu || !profileBtn) return;

  // Populate with the current demo session's email, if any.
  const emailEl = menu.querySelector('.profile-dropdown__user span');
  const nameEl = menu.querySelector('.profile-dropdown__user strong');
  if (window.Session && Session.isLoggedIn()) {
    const email = Session.email();
    if (emailEl) emailEl.textContent = email;
    if (nameEl) nameEl.textContent = email.split('@')[0]
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Wire the "Log out" link to actually clear the session.
  const logoutLink = menu.querySelector('.profile-dropdown__link--danger');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.Session) Session.logout();
      toast('Logged out successfully', 'success');
      setTimeout(() => { window.location.href = logoutLink.getAttribute('href') || 'login.html'; }, 400);
    });
  }

  // Close the dropdown on outside click / Escape.
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('is-open')) return;
    if (menu.contains(e.target) || profileBtn.contains(e.target)) return;
    menu.classList.remove('is-open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') menu.classList.remove('is-open');
  });
}

/* ---------------------------------------------------------
   Toasts
--------------------------------------------------------- */
function toast(message, type = 'success', duration = 3200) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast__dot"></span><span>${message}</span>`;
  stack.appendChild(el);

  setTimeout(() => {
    el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 300);
  }, duration);
}
window.toast = toast;

/* ---------------------------------------------------------
   Modals
--------------------------------------------------------- */
function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('is-open');
}
function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('is-open');
}
window.openModal = openModal;
window.closeModal = closeModal;

function initModalDismiss() {
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('is-open');
    });
  });
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay) overlay.classList.remove('is-open');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.is-open').forEach((o) => o.classList.remove('is-open'));
    }
  });
}

/* ---------------------------------------------------------
   Animated counters — <span data-counter="1234" data-suffix="%">
--------------------------------------------------------- */
function initCounters() {
  const counters = document.querySelectorAll('[data-counter]');
  if (!counters.length) return;

  const animate = (el) => {
    const target = parseFloat(el.getAttribute('data-counter'));
    const suffix = el.getAttribute('data-suffix') || '';
    const decimals = el.getAttribute('data-decimals') ? parseInt(el.getAttribute('data-decimals'), 10) : 0;
    const duration = 1100;
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = target * eased;
      el.textContent = value.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animate(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });

  counters.forEach((el) => observer.observe(el));
}

/* ---------------------------------------------------------
   Shared dummy "session" — lets Login / Logout feel connected
   across pages without a backend. Uses in-memory + a simple
   flag on window.name so it can (optionally) survive a
   same-tab navigation during a demo walkthrough.
--------------------------------------------------------- */
const Session = {
  isLoggedIn() {
    return sessionStorage.getItem('mif_demo_session') === 'active';
  },
  login(email) {
    sessionStorage.setItem('mif_demo_session', 'active');
    sessionStorage.setItem('mif_demo_email', email || 'demo.user@agri.edu');
  },
  logout() {
    sessionStorage.removeItem('mif_demo_session');
  },
  email() {
    return sessionStorage.getItem('mif_demo_email') || 'demo.user@agri.edu';
  }
};
window.Session = Session;
