/**
 * History page — dummy prior analyses stored in sessionStorage so
 * "delete" persists for the session. Supports search, sort, and
 * two view modes (cards / timeline).
 */

const HISTORY_SEED = [
  { disease: 'Bacterial Leaf Blight', severity: 'Severe', confidence: 91.4, daysAgo: 1 },
  { disease: 'Healthy Rice Leaf', severity: 'Healthy', confidence: 97.2, daysAgo: 2 },
  { disease: 'Brown Spot', severity: 'Moderate', confidence: 85.6, daysAgo: 3 },
  { disease: 'Leaf Blast', severity: 'Severe', confidence: 88.9, daysAgo: 5 },
  { disease: 'Sheath Blight', severity: 'Moderate', confidence: 82.1, daysAgo: 7 },
  { disease: 'Leaf Scald', severity: 'Moderate', confidence: 79.8, daysAgo: 9 },
  { disease: 'Healthy Rice Leaf', severity: 'Healthy', confidence: 95.5, daysAgo: 11 },
  { disease: 'Brown Spot', severity: 'Moderate', confidence: 83.2, daysAgo: 14 },
  { disease: 'Bacterial Leaf Blight', severity: 'Severe', confidence: 90.1, daysAgo: 18 }
];

let historyItems = [];
let currentView = 'cards';

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  render();

  document.getElementById('historySearch').addEventListener('input', render);
  document.getElementById('historySort').addEventListener('change', render);
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentView = btn.getAttribute('data-view');
      render();
    });
  });
});

function loadHistory() {
  const saved = sessionStorage.getItem('mif_history');
  if (saved) {
    historyItems = JSON.parse(saved);
    return;
  }
  historyItems = HISTORY_SEED.map((h, i) => {
    const date = new Date();
    date.setDate(date.getDate() - h.daysAgo);
    return {
      id: 'HIST-' + (5000 + i),
      disease: h.disease,
      severity: h.severity,
      confidence: h.confidence,
      timestamp: date.getTime(),
      date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    };
  });
  persist();
}

function persist() {
  sessionStorage.setItem('mif_history', JSON.stringify(historyItems));
}

function severityBadgeClass(severity) {
  if (severity === 'Healthy') return 'badge-soft--green';
  if (severity === 'Severe') return 'badge-soft--red';
  return 'badge-soft--amber';
}

function getFiltered() {
  const term = document.getElementById('historySearch').value.toLowerCase();
  const sort = document.getElementById('historySort').value;

  let items = historyItems.filter((i) => i.disease.toLowerCase().includes(term));

  const severityRank = { Severe: 3, Moderate: 2, Healthy: 1 };
  if (sort === 'newest') items.sort((a, b) => b.timestamp - a.timestamp);
  else if (sort === 'oldest') items.sort((a, b) => a.timestamp - b.timestamp);
  else if (sort === 'confidence') items.sort((a, b) => b.confidence - a.confidence);
  else if (sort === 'severity') items.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);

  return items;
}

function render() {
  const items = getFiltered();
  const container = document.getElementById('historyContent');

  if (!items.length) {
    container.innerHTML = `<div class="empty-state glass-card">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <div class="empty-state__title">No analyses found</div>
      <div>Try a different search term.</div>
    </div>`;
    return;
  }

  container.innerHTML = currentView === 'cards' ? renderCards(items) : renderTimeline(items);
  attachActions();
}

function renderCards(items) {
  return `<div class="history-grid">` + items.map((item) => `
    <div class="glass-card history-card" data-id="${item.id}">
      <div class="history-card__thumb"><img src="assets/farm.png" alt="${item.disease} sample"></div>
      <div class="history-card__top">
        <div>
          <div class="history-card__title">${item.disease}</div>
          <div class="history-card__meta">${item.date} · ${item.confidence}% confidence</div>
        </div>
        <span class="badge-soft ${severityBadgeClass(item.severity)}">${item.severity}</span>
      </div>
      <div class="history-card__actions">
        <button class="btn btn-secondary btn-sm" data-download="${item.id}">Download</button>
        <button class="btn btn-danger btn-sm" data-delete="${item.id}">Delete</button>
      </div>
    </div>
  `).join('') + `</div>`;
}

function renderTimeline(items) {
  return `<div class="timeline">` + items.map((item) => `
    <div class="timeline-item" data-id="${item.id}">
      <div class="timeline-item__date">${item.date}</div>
      <div class="glass-card timeline-item__card">
        <div class="history-card__thumb" style="width:120px; flex-shrink:0;"><img src="assets/farm.png" alt="${item.disease} sample"></div>
        <div style="flex:1;">
          <div class="history-card__title">${item.disease} <span class="badge-soft ${severityBadgeClass(item.severity)}" style="margin-left:8px;">${item.severity}</span></div>
          <div class="history-card__meta">${item.confidence}% confidence</div>
        </div>
        <div class="history-card__actions">
          <button class="btn btn-secondary btn-sm" data-download="${item.id}">Download</button>
          <button class="btn btn-danger btn-sm" data-delete="${item.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('') + `</div>`;
}

function attachActions() {
  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete');
      historyItems = historyItems.filter((i) => i.id !== id);
      persist();
      render();
      toast('Analysis deleted', 'success');
    });
  });

  document.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-download');
      const item = historyItems.find((i) => i.id === id);
      if (!item) return;
      const content = `MULTISPECTRAL IMAGE FUSION FOR AGRICULTURE
Analysis Record
--------------------------------------------
ID: ${item.id}
Date: ${item.date}
Disease: ${item.disease}
Confidence: ${item.confidence}%
Severity: ${item.severity}
--------------------------------------------
Generated by Multispectral Image Fusion for Agriculture (Demo)
`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Analysis downloaded', 'success');
    });
  });
}
