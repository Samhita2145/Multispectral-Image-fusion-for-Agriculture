/**
 * Reports page — list of generated reports, a distribution chart
 * (Chart.js), and a printable report-sheet preview. "Download PDF"
 * uses the browser's native print-to-PDF via a print-scoped
 * stylesheet (css/reports.css @media print) — no external PDF
 * library required, and it works fully offline.
 */

const REPORT_DISEASES = [
  { name: 'Healthy Rice Leaf', severity: 'Healthy', summary: 'No disease indicators detected. Leaf tissue shows normal chlorophyll distribution across both RGB and fused NDVI bands.', treatment: 'No treatment required — continue routine monitoring.' },
  { name: 'Bacterial Leaf Blight', severity: 'Severe', summary: 'Water-soaked lesions detected along leaf margins, consistent with bacterial leaf blight. NDVI fusion shows a sharp vegetation-index drop in affected regions.', treatment: 'Apply copper-based bactericide and improve field drainage. Remove severely infected leaves.' },
  { name: 'Brown Spot', severity: 'Moderate', summary: 'Circular brown lesions with gray centers identified across the leaf blade. Fusion contrast indicates early-to-mid stage infection.', treatment: 'Apply mancozeb-based fungicide and ensure balanced potassium nutrition.' },
  { name: 'Leaf Blast', severity: 'Severe', summary: 'Diamond-shaped lesions with defined margins detected, indicating active leaf blast infection with moderate spread.', treatment: 'Apply tricyclazole-based fungicide promptly and reduce nitrogen application.' },
  { name: 'Leaf Scald', severity: 'Moderate', summary: 'Alternating tan and brown banding pattern detected from leaf tip inward, typical of leaf scald.', treatment: 'Improve field ventilation and monitor for spread; apply fungicide if progression continues.' },
  { name: 'Sheath Blight', severity: 'Moderate', summary: 'Lesions detected near the sheath waterline with irregular borders, consistent with sheath blight.', treatment: 'Apply hexaconazole fungicide and reduce planting density to lower canopy humidity.' }
];

let reports = [];
let reportChart = null;

document.addEventListener('DOMContentLoaded', () => {
  loadReports();
  renderChart();
  renderReportsList();

  document.getElementById('generateReportBtn').addEventListener('click', generateReport);
  document.getElementById('downloadPdfBtn').addEventListener('click', () => window.print());
});

function loadReports() {
  const saved = sessionStorage.getItem('mif_reports');
  if (saved) {
    reports = JSON.parse(saved);
  } else {
    reports = [
      seedReport(0, 4), seedReport(1, 2), seedReport(2, 0), seedReport(3, 1)
    ];
    persistReports();
  }
}

function seedReport(diseaseIndex, daysAgo) {
  const d = REPORT_DISEASES[diseaseIndex];
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id: 'RPT-' + (10234 + diseaseIndex),
    disease: d.name,
    severity: d.severity,
    summary: d.summary,
    treatment: d.treatment,
    confidence: (84 + Math.random() * 14).toFixed(1),
    date: date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  };
}

function persistReports() {
  sessionStorage.setItem('mif_reports', JSON.stringify(reports));
}

function generateReport() {
  const d = REPORT_DISEASES[Math.floor(Math.random() * REPORT_DISEASES.length)];
  const report = {
    id: 'RPT-' + Math.floor(10000 + Math.random() * 89999),
    disease: d.name,
    severity: d.severity,
    summary: d.summary,
    treatment: d.treatment,
    confidence: (82 + Math.random() * 16).toFixed(1),
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  };
  reports.unshift(report);
  persistReports();
  renderReportsList();
  renderChart();
  toast('New report generated', 'success');
  openReportPreview(report);
}

function severityIcon() {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M7 3.5H14L18 7.5V20.5H7V3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 12H15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9.5 15.5H15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function renderReportsList() {
  const container = document.getElementById('reportsList');
  if (!reports.length) {
    container.innerHTML = `<div class="empty-state glass-card"><div class="empty-state__title">No reports yet</div><div>Click "Generate Report" to create one.</div></div>`;
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
        <div class="report-card__meta">${r.id} · ${r.date} · ${r.confidence}% confidence</div>
      </div>
      <div class="report-card__actions">
        <button class="btn btn-ghost btn-sm" data-preview="${r.id}">Preview</button>
        <button class="btn btn-secondary btn-sm" data-download="${r.id}">Download</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-preview]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = reports.find((x) => x.id === btn.getAttribute('data-preview'));
      if (r) openReportPreview(r);
    });
  });
  container.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = reports.find((x) => x.id === btn.getAttribute('data-download'));
      if (r) { openReportPreview(r); setTimeout(() => window.print(), 400); }
    });
  });

  setTimeout(renderChart, 0);
}

function severityToBadgeClass(severity) {
  if (severity === 'Healthy') return 'badge-soft--green';
  if (severity === 'Severe') return 'badge-soft--red';
  return 'badge-soft--amber';
}

function openReportPreview(r) {
  document.getElementById('reportId').textContent = r.id;
  document.getElementById('reportDate').textContent = r.date;
  document.getElementById('reportDisease').textContent = r.disease;
  document.getElementById('reportConfidence').textContent = r.confidence + '%';
  document.getElementById('reportSeverity').textContent = r.severity;
  document.getElementById('reportSummary').textContent = r.summary;
  document.getElementById('reportTreatment').textContent = r.treatment;
  document.getElementById('reportImageWrap').innerHTML = `<img src="assets/farm.png" alt="Analyzed leaf sample">`;
  openModal('reportModal');
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

/**
 * Lightweight CSS-only bar chart used only if the Chart.js CDN
 * couldn't be reached (e.g. no internet connection). Keeps the
 * page fully functional offline.
 */
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
