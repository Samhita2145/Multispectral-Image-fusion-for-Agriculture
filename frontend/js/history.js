/**
 * History page — REAL prior analyses fetched from the backend
 * (GET /api/history), scoped to the logged-in user only. Search/sort
 * stay client-side over the fetched page; delete calls DELETE
 * /api/history/{id}. Two view modes (cards / timeline) unchanged.
 */

let historyItems = [];
let currentView = 'cards';

document.addEventListener('DOMContentLoaded', () => {
  loadHistory();

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

function severityFromClass(diseaseName) {
  const n = (diseaseName || '').toLowerCase();
  if (n.includes('healthy')) return 'Healthy';
  if (n.includes('bacterial') || n.includes('blast')) return 'Severe';
  return 'Moderate';
}

function loadHistory() {
  const container = document.getElementById('historyContent');
  container.innerHTML = `<div class="empty-state glass-card"><div class="empty-state__title">Loading history…</div></div>`;

  API.getHistory(1, 100)
    .then(async (data) => {
      historyItems = (data.items || []).map((p) => ({
        id: p.id,
        disease: p.predicted_class,
        severity: severityFromClass(p.predicted_class),
        confidence: p.confidence,
        modelUsed: p.model_used,
        ndviMean: p.ndvi_mean,
        rgbImageRel: p.rgb_image_url || null,
        rgbImageUrl: null,
        timestamp: new Date(p.created_at).getTime(),
        date: new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      }));

      // Resolve each prediction's RGB via the auth-gated file API into a
      // blob URL so <img> can display it (plain src would get 401).
      await Promise.all(
        historyItems.map(async (item) => {
          if (!item.rgbImageRel) return;
          try {
            item.rgbImageUrl = await API.authenticatedImageUrl(item.rgbImageRel);
          } catch (e) {
            console.warn('History image load failed for', item.id, e);
            item.rgbImageUrl = null;
          }
        })
      );

      render();
    })
    .catch((err) => {
      container.innerHTML = `<div class="empty-state glass-card">
        <div class="empty-state__title">Couldn't load history</div>
        <div>${err.message}</div>
      </div>`;
      toast('Failed to load history: ' + err.message, 'error');
    });
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
      <div>${historyItems.length ? 'Try a different search term.' : 'Run an analysis on the Disease Detection or Image Analysis page to see it here.'}</div>
    </div>`;
    return;
  }

  container.innerHTML = currentView === 'cards' ? renderCards(items) : renderTimeline(items);
  attachActions();
}

function renderCards(items) {
  return `<div class="history-grid">` + items.map((item) => `
    <div class="glass-card history-card" data-id="${item.id}">
      <div class="history-card__thumb">${item.rgbImageUrl
        ? `<img src="${item.rgbImageUrl}" alt="${item.disease} sample">`
        : `<div class="preview-tile__empty" style="height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;">No image</div>`
      }</div>
      <div class="history-card__top">
        <div>
          <div class="history-card__title">${item.disease}</div>
          <div class="history-card__meta">${item.date} · ${item.confidence.toFixed(1)}% confidence</div>
        </div>
        <span class="badge-soft ${severityBadgeClass(item.severity)}">${item.severity}</span>
      </div>
      <div class="history-card__actions">
        <button class="btn btn-secondary btn-sm" data-report="${item.id}">Report</button>
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
        <div class="history-card__thumb" style="width:120px; flex-shrink:0;">${item.rgbImageUrl
          ? `<img src="${item.rgbImageUrl}" alt="${item.disease} sample">`
          : `<div class="preview-tile__empty" style="height:100%;display:flex;align-items:center;justify-content:center;font-size:11px;">No image</div>`
        }</div>
        <div style="flex:1;">
          <div class="history-card__title">${item.disease} <span class="badge-soft ${severityBadgeClass(item.severity)}" style="margin-left:8px;">${item.severity}</span></div>
          <div class="history-card__meta">${item.confidence.toFixed(1)}% confidence</div>
        </div>
        <div class="history-card__actions">
          <button class="btn btn-secondary btn-sm" data-report="${item.id}">Report</button>
          <button class="btn btn-danger btn-sm" data-delete="${item.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('') + `</div>`;
}

function attachActions() {
  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-delete'), 10);
      btn.disabled = true;
      API.deleteHistoryItem(id)
        .then(() => {
          historyItems = historyItems.filter((i) => i.id !== id);
          render();
          toast('Analysis deleted', 'success');
        })
        .catch((err) => {
          toast('Delete failed: ' + err.message, 'error');
          btn.disabled = false;
        });
    });
  });

  document.querySelectorAll('[data-report]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.getAttribute('data-report'), 10);
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Generating…';
      API.generateReport(id)
        .then((report) => API.downloadReportBlob(report.id))
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `analysis-report-${id}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast('Report downloaded', 'success');
        })
        .catch((err) => toast('Report generation failed: ' + err.message, 'error'))
        .finally(() => {
          btn.disabled = false;
          btn.textContent = originalText;
        });
    });
  });
}
