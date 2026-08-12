/**
 * Multispectral Image Fusion For Agriculture — Dashboard
 * main.js
 *
 * Handles: primary navigation active state, bottom action-card
 * active state, and lightweight interaction feedback for the
 * notification / profile controls.
 */

document.addEventListener('DOMContentLoaded', () => {
  initActionCards();
});

/**
 * Bottom action cards (Image Analysis / Dataset Explorer / Reports)
 * highlight on click, then navigate to the matching module page.
 */
function initActionCards() {
  const cards = document.querySelectorAll('.action-card');

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      cards.forEach((el) => el.classList.remove('action-card--active'));
      card.classList.add('action-card--active');

      const href = card.getAttribute('data-href');
      if (href) {
        setTimeout(() => { window.location.href = href; }, 150);
      }
    });
  });
}
