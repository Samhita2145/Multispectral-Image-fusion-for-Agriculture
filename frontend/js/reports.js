/**
 * Reports page — REAL reports backed by the FastAPI backend.
 *   - "Generate Report" creates a PDF (via POST /api/reports/{prediction_id})
 *     for the user's most recent analysis (GET /api/history) and opens a
 *     preview.
 *   - The reports list + "Reports by Disease Type" chart are built from
 *     GET /api/reports (the user's own generated reports only).
 *   - "Download PDF" fetches the real ReportLab-generated PDF from the
 *     backend (GET /api/reports/{id}/download) instead of browser print.
 *
 * Curated summary/treatment copy per disease class is still used for the
 * on-page preview card (kept from the original demo copy); the actual
 * downloaded PDF's content always comes from the backend's real
 * prediction + NDVI + model data.
 */

const REPORT_DISEASE_COPY = {
  'Healthy Rice Leaf': { severity: 'Healthy', summary: 'No disease indicators detected. Leaf tissue shows normal chlorophyll distribution.', treatment: 'No treatment required — continue routine monitoring.' },
  'Bacterial Leaf Blight': { severity: 'Severe', summary: 'Water-soaked lesions detected along leaf margins, consistent with bacterial leaf blight.', treatment: 'Apply copper-based bactericide and improve field drainage. Remove severely infected leaves.' },
  'Brown Spot': { severity: 'Moderate', summary: 'Circular brown lesions with gray centers identified across the leaf blade.', treatment: 'Apply mancozeb-based fungicide and ensure balanced potassium nutrition.' },
  'Leaf Blast': { severity: 'Severe', summary: 'Diamond-shaped lesions with defined margins detected, indicating active leaf blast infection.', treatment: 'Apply tricyclazole-based fungicide promptly and reduce nitrogen application.' },
  'Leaf scald': { severity: 'Moderate', summary: 'Alternating tan and brown banding pattern detected from leaf tip inward, typical of leaf scald.', treatment: 'Improve field ventilation and monitor for spread; apply fungicide if progression continues.' },
  'Sheath Blight': { severity: 'Moderate', summary: 'Lesions detected near the sheath waterline with irregular borders, consistent with sheath blight.', treatment: 'Apply hexaconazole fungicide and reduce planting density to lower canopy humidity.' }
};

function copyFor(diseaseName) {
  return REPORT_DISEASE_COPY[diseaseName] || { severity: 'Moderate', summary: 'Analysis complete.', treatment: 'Consult a local agronomist to confirm this diagnosis.' };
}

let reports = [];
let reportChart = null;
let currentPreviewReportId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadReports();

  document.getElementById('generateReportBtn').addEventListener('click', generateReportFromLatestAnalysis);
  document.getElementById('downloadPdfBtn').addEventListener('click', downloadCurrentPreview);
});

function mapReport(r) {
  const copy = copyFor(r.predicted_class);
  return {
    id: r.id,
    predictionId: r.prediction_id,
    disease: r.predicted_class || 'Unknown',
    severity: copy.severity,
    summary: copy.summary,
    treatment: copy.treatment,
    confidence: r.confidence != null ? r.confidence.toFixed(1) : '—',
    date: new Date(r.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    rgbImageRel: r.rgb_image_url || null
  };
}

function loadReports() {
  const container = document.getElementById('reportsList');
  container.innerHTML = `<div class="empty-state glass-card"><div class="empty-state__title">Loading reports…</div></div>`;

  API.listReports()
    .then((data) => {
      reports = data.map(mapReport);
      renderReportsList();
    })
    .catch((err) => {
      container.innerHTML = `<div class="empty-state glass-card">
        <div class="empty-state__title">Couldn't load reports</div>
        <div>${err.message}</div>
      </div>`;
      toast('Failed to load reports: ' + err.message, 'error');
    });
}

function generateReportFromLatestAnalysis() {
  const btn = document.getElementById('generateReportBtn');
  btn.disabled = true;

  API.getHistory(1, 1)
    .then((data) => {
      const items = data.items || [];
      if (!items.length) {
        toast('Run an analysis on Disease Detection or Image Analysis first', 'error');
        return null;
      }
      return API.generateReport(items[0].id);
    })
    .then((report) => {
      if (!report) return;
      toast('New report generated', 'success');
      return loadReportsAndPreview(report.id);
    })
    .catch((err) => toast('Report generation failed: ' + err.message, 'error'))
    .finally(() => { btn.disabled = false; });
}

function loadReportsAndPreview(reportId) {
  return API.listReports().then((data) => {
    reports = data.map(mapReport);
    renderReportsList();
    const r = reports.find((x) => x.id === reportId);
    if (r) openReportPreview(r);
  });
}

function severityIcon() {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M7 3.5H14L18 7.5V20.5H7V3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 12H15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.5 15.5H15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function renderReportsList() {
  const container = document.getElementById('reportsList');
  if (!reports.length) {
    container.innerHTML = `<div class="empty-state glass-card"><div class="empty-state__title">No reports yet</div><div>Click "Generate Report" to create one from your latest analysis.</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="glass-card chart-card">
      <div class="section-title" style="margin-bottom: var(--space-3);">Reports by Disease Type</div>
      <canvas id="reportChartCanvas"></canvas>
    </div>
  ` + reports.map((r) => `
    <div class="glass-card report-card">
      <span class="report-card__icon">${severityIcon()}</span>
      <div class="report-card__body">
        <div class="report-card__title">${r.disease} <span class="badge-soft ${severityToBadgeClass(r.severity)}" style="margin-left:8px;">${r.severity}</span></div>
        <div class="report-card__meta">RPT-${r.id} · ${r.date} · ${r.confidence}% confidence</div>
      </div>
      <div class="report-card__actions">
        <button class="btn btn-ghost btn-sm" data-preview="${r.id}">Preview</button>
        <button class="btn btn-secondary btn-sm" data-download="${r.id}">Download</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-preview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = reports.find((x) => x.id === parseInt(btn.getAttribute('data-preview'), 10));
      if (r) openReportPreview(r);
    });
  });
  container.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', () => downloadReportById(parseInt(btn.getAttribute('data-download'), 10), btn));
  });

  setTimeout(renderChart, 0);
}

function severityToBadgeClass(severity) {
  if (severity === 'Healthy') return 'badge-soft--green';
  if (severity === 'Severe') return 'badge-soft--red';
  return 'badge-soft--amber';
}

function openReportPreview(r) {
  currentPreviewReportId = r.id;
  document.getElementById('reportId').textContent = 'RPT-' + r.id;
  document.getElementById('reportDate').textContent = r.date;
  document.getElementById('reportDisease').textContent = r.disease;
  document.getElementById('reportConfidence').textContent = r.confidence + '%';
  document.getElementById('reportSeverity').textContent = r.severity;
  document.getElementById('reportSummary').textContent = r.summary;
  document.getElementById('reportTreatment').textContent = r.treatment;
  document.getElementById('reportImageWrap').innerHTML =
    `<div class="preview-tile__empty">Loading analyzed image…</div>`;
  openModal('reportModal');

  // Show the exact RGB uploaded for this prediction (not the farm illustration).
  resolveReportRgbUrl(r)
    .then((blobUrl) => {
      if (currentPreviewReportId !== r.id) return;
      if (blobUrl) {
        document.getElementById('reportImageWrap').innerHTML =
          `<img src="${blobUrl}" alt="Analyzed leaf sample">`;
      } else {
        document.getElementById('reportImageWrap').innerHTML =
          `<div class="preview-tile__empty">Sample image unavailable</div>`;
      }
    })
    .catch(() => {
      if (currentPreviewReportId !== r.id) return;
      document.getElementById('reportImageWrap').innerHTML =
        `<div class="preview-tile__empty">Sample image unavailable</div>`;
    });
}

async function resolveReportRgbUrl(r) {
  let rel = r.rgbImageRel;
  if (!rel && r.predictionId) {
    const item = await API.getHistoryItem(r.predictionId);
    rel = item && item.rgb_image_url;
    if (rel) r.rgbImageRel = rel;
  }
  if (!rel) return null;
  return API.authenticatedImageUrl(rel);
}

function downloadCurrentPreview() {
  if (currentPreviewReportId == null) return;
  downloadReportById(currentPreviewReportId, document.getElementById('downloadPdfBtn'));
}

function downloadReportById(reportId, btn) {
  const originalText = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Downloading…'; }

  API.downloadReportBlob(reportId)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis-report-${reportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Report downloaded', 'success');
    })
    .catch((err) => toast('Download failed: ' + err.message, 'error'))
    .finally(() => {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    });
}

function renderChart() {
  const canvas = document.getElementById('reportChartCanvas');
  if (!canvas) return;

  const counts = {};
  reports.forEach((r) => { counts[r.disease] = (counts[r.disease] || 0) + 1; });

  if (typeof Chart === 'undefined') {
    renderChartFallback(canvas, counts);
    return;
  }

  if (reportChart) reportChart.destroy();
  reportChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: Object.keys(counts),
      datasets: [{
        label: 'Reports',
        data: Object.values(counts),
        backgroundColor: '#4CAF50',
        borderRadius: 8,
        maxBarThickness: 40
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(46,125,50,0.08)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderChartFallback(canvas, counts) {
  const max = Math.max(1, ...Object.values(counts));
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'flex-end';
  wrapper.style.gap = '16px';
  wrapper.style.height = '200px';
  wrapper.style.padding = '0 4px';

  Object.entries(counts).forEach(([label, count]) => {
    const col = document.createElement('div');
    col.style.flex = '1';
    col.style.display = 'flex';
    col.style.flexDirection = 'column';
    col.style.alignItems = 'center';
    col.style.gap = '8px';
    col.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--color-primary);">${count}</div>
      <div style="width:100%;max-width:44px;height:${Math.max(6, (count / max) * 150)}px;background:linear-gradient(180deg,#66BB6A,#2E7D32);border-radius:8px 8px 0 0;"></div>
      <div style="font-size:10.5px;color:var(--color-text-muted);text-align:center;line-height:1.3;">${label}</div>
    `;
    wrapper.appendChild(col);
  });

  canvas.replaceWith(wrapper);
  wrapper.id = 'reportChartCanvas';
}
