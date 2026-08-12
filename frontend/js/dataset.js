/**
 * Dataset Explorer
 *
 * REAL IMAGES ARE WIRED UP for all six classes below (see `files`
 * in each CLASSES entry). If you add/remove photos in
 * assets/dataset/<slug>/, just update that class's `files` array
 * to match — filenames don't need any particular pattern.
 *
 * Each tile tries to load the real photo first. If a file is missing
 * or the extension doesn't match (e.g. it's actually .JPG / .png
 * instead of .jpg), it automatically falls back to a colored
 * placeholder tile instead of showing a broken image icon.
 */

const CLASSES = [
  {
    slug: 'healthy', name: 'Healthy Rice Leaf', color: '#4CAF50', count: 420, useRealImages: true,
    files: [
      '20231006_163255.jpg', '20231006_163740.jpg', '20231006_163746.jpg',
      '20231006_165517(0).jpg', '20231006_165518.jpg',
      'aug_0_4.jpg', 'aug_0_7.jpg', 'aug_0_14.jpg', 'aug_0_22.jpg',
      'aug_0_26.jpg', 'aug_0_28.jpg', 'aug_0_34.jpg'
    ]
  },
  {
    slug: 'bacterial-leaf-blight', name: 'Bacterial Leaf Blight', color: '#C62828', count: 385, useRealImages: true,
    files: [
      '20231006_164208.jpg',
      'aug_0_4.jpg', 'aug_0_14.jpg', 'aug_0_33.jpg', 'aug_0_36.jpg', 'aug_0_39.jpg',
      'aug_0_43.jpg', 'aug_0_48.jpg', 'aug_0_59.jpg', 'aug_0_63.jpg', 'aug_0_68.jpg', 'aug_0_88.jpg'
    ]
  },
  {
    slug: 'brown-spot', name: 'Brown Spot', color: '#B9740A', count: 402, useRealImages: true,
    files: [
      '20231006_165550.jpg', '20231006_165551(0).jpg', '20231006_165551.jpg',
      '20231006_165615.jpg', '20231006_165616.jpg', '20231006_165800.jpg',
      '20231006_165801.jpg', '20231006_165801(0).jpg',
      'aug_0_17.jpg', 'aug_0_25.jpg', 'aug_0_44.jpg', 'aug_0_47.jpg'
    ]
  },
  {
    slug: 'leaf-blast', name: 'Leaf Blast', color: '#8E24AA', count: 398, useRealImages: true,
    files: [
      'aug_0_3.jpg', 'aug_0_4.jpg', 'aug_0_6.jpg', 'aug_0_7.jpg', 'aug_0_16.jpg', 'aug_0_17.jpg',
      'aug_0_38.jpg', 'aug_0_40.jpg', 'aug_0_47.jpg', 'aug_0_50.jpg', 'aug_0_52.jpg', 'aug_0_58.jpg'
    ]
  },
  {
    slug: 'leaf-scald', name: 'Leaf Scald', color: '#00838F', count: 371, useRealImages: true,
    files: [
      'aug_0_0.jpg', 'aug_0_7.jpg', 'aug_0_18.jpg', 'aug_0_35.jpg', 'aug_0_47.jpg', 'aug_0_48.jpg',
      'aug_0_71.jpg', 'aug_0_77.jpg', 'aug_0_85.jpg', 'aug_0_88.jpg', 'aug_0_92.jpg', 'aug_0_117.jpg'
    ]
  },
  {
    slug: 'sheath-blight', name: 'Sheath Blight', color: '#5D4037', count: 424, useRealImages: true,
    files: [
      'aug_0_2.jpg', 'aug_0_7.jpg', 'aug_0_15.jpg', 'aug_0_19.jpg', 'aug_0_24.jpg', 'aug_0_39.jpg',
      'aug_0_41.jpg', 'aug_0_43.jpg', 'aug_0_45.jpg', 'aug_0_64.jpg', 'aug_0_66.jpg', 'aug_0_81.jpg'
    ]
  }
];

const PAGE_SIZE = 18;
let activeFilter = 'all';
let searchTerm = '';
let currentPage = 1;
let allItems = [];

document.addEventListener('DOMContentLoaded', () => {
  buildItems();
  renderCategoryCards();
  renderFilterChips();
  renderGrid();

  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    currentPage = 1;
    renderGrid();
  });
});

function buildItems() {
  CLASSES.forEach((cls) => {
    if (cls.useRealImages && cls.files.length) {
      cls.files.forEach((filename) => {
        allItems.push({
          classSlug: cls.slug,
          className: cls.name,
          color: cls.color,
          filename,
          useRealImages: true,
          src: `assets/dataset/${cls.slug}/${filename}`
        });
      });
    } else {
      for (let i = 1; i <= 12; i++) {
        allItems.push({
          classSlug: cls.slug,
          className: cls.name,
          color: cls.color,
          filename: `${cls.slug}_${String(i).padStart(3, '0')}.jpg`,
          useRealImages: false,
          src: null
        });
      }
    }
  });
}

function leafIconSvg(color) {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:${color}">
    <path d="M4 20C4 20 5 9 13 5C21 1 21 9 19 13C15 21 4 20 4 20Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M5 19C9 15 12 11 17 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`;
}

function swatchHtml(color) {
  return `<div class="leaf-swatch" style="background: linear-gradient(135deg, ${color}22, ${color}0D);">${leafIconSvg(color)}</div>`;
}
window.swatchHtml = swatchHtml;

function tileMediaHtml(item) {
  if (item.useRealImages) {
    return `<img src="${item.src}" alt="${item.className}" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML=window.swatchHtml('${item.color}');">`;
  }
  return swatchHtml(item.color);
}

function renderCategoryCards() {
  const container = document.getElementById('categoryCards');
  container.innerHTML = CLASSES.map((cls) => `
    <button class="glass-card" data-filter="${cls.slug}" style="padding: var(--space-4); text-align:left; display:flex; flex-direction:column; gap:8px; cursor:pointer;">
      <span style="width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:${cls.color}1A;">
        ${leafIconSvgSmall(cls.color)}
      </span>
      <span style="font-weight:700; font-size:13.5px;">${cls.name}</span>
      <span style="font-size:12px; color:var(--color-text-muted);">${cls.count} images</span>
    </button>
  `).join('');

  container.querySelectorAll('[data-filter]').forEach((card) => {
    card.addEventListener('click', () => {
      activeFilter = card.getAttribute('data-filter');
      currentPage = 1;
      syncChips();
      renderGrid();
      document.getElementById('imageGrid').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

function leafIconSvgSmall(color) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" style="color:${color}"><path d="M4 20C4 20 5 9 13 5C21 1 21 9 19 13C15 21 4 20 4 20Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function renderFilterChips() {
  const container = document.getElementById('filterChips');
  const chips = [{ slug: 'all', name: 'All Classes' }, ...CLASSES];
  container.innerHTML = chips.map((c) => `
    <button class="chip ${c.slug === activeFilter ? 'is-active' : ''}" data-chip="${c.slug}">${c.name}</button>
  `).join('');

  container.querySelectorAll('[data-chip]').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.getAttribute('data-chip');
      currentPage = 1;
      syncChips();
      renderGrid();
    });
  });
}

function syncChips() {
  document.querySelectorAll('[data-chip]').forEach((chip) => {
    chip.classList.toggle('is-active', chip.getAttribute('data-chip') === activeFilter);
  });
}

function getFilteredItems() {
  return allItems.filter((item) => {
    const matchesFilter = activeFilter === 'all' || item.classSlug === activeFilter;
    const matchesSearch = !searchTerm || item.className.toLowerCase().includes(searchTerm) || item.filename.toLowerCase().includes(searchTerm);
    return matchesFilter && matchesSearch;
  });
}

function renderGrid() {
  const filtered = getFilteredItems();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const grid = document.getElementById('imageGrid');

  if (!pageItems.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <div class="empty-state__title">No images found</div>
      <div>Try a different search term or category.</div>
    </div>`;
  } else {
    grid.innerHTML = pageItems.map((item, i) => `
      <div class="preview-tile" data-item-index="${start + i}" style="cursor:pointer;">
        ${tileMediaHtml(item)}
        <div class="preview-tile__label">${item.className}</div>
      </div>
    `).join('');

    grid.querySelectorAll('[data-item-index]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const item = filtered[parseInt(tile.getAttribute('data-item-index'), 10) - start];
        openImageModal(item);
      });
    });
  }

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById('pagination');
  let html = `<button class="page-btn" id="prevPage" ${currentPage === 1 ? 'disabled' : ''}>&lsaquo;</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
      html += `<button class="page-btn ${p === currentPage ? 'is-active' : ''}" data-page="${p}">${p}</button>`;
    } else if (Math.abs(p - currentPage) === 2) {
      html += `<span style="color:var(--color-text-muted);">…</span>`;
    }
  }
  html += `<button class="page-btn" id="nextPage" ${currentPage === totalPages ? 'disabled' : ''}>&rsaquo;</button>`;
  container.innerHTML = html;

  container.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.getAttribute('data-page'), 10);
      renderGrid();
    });
  });
  const prev = document.getElementById('prevPage');
  const next = document.getElementById('nextPage');
  if (prev) prev.addEventListener('click', () => { currentPage--; renderGrid(); });
  if (next) next.addEventListener('click', () => { currentPage++; renderGrid(); });
}

function openImageModal(item) {
  document.getElementById('modalTitle').textContent = item.className;
  document.getElementById('modalImageWrap').innerHTML = item.useRealImages
    ? `<img src="${item.src}" alt="${item.className}" onerror="this.onerror=null;this.parentElement.innerHTML=window.swatchHtml('${item.color}');" style="width:100%;height:100%;object-fit:cover;">`
    : swatchHtml(item.color);
  document.getElementById('modalMeta').innerHTML = `
    <strong>Filename:</strong> ${item.filename}<br>
    <strong>Class:</strong> ${item.className}
  `;
  openModal('imageModal');
}