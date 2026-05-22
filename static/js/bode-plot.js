/**
 * BodePlot — Chart.js wrapper for Bode magnitude + phase plots.
 *
 * Manages two Chart instances:
 *   • chartMag   — amplitude in dB vs frequency (log)
 *   • chartPhase — phase in degrees vs frequency (log)
 *
 * Two data series per chart:
 *   • 'analytical' — computed in-browser from RC transfer function (instant)
 *   • 'mna'        — returned by the Django backend MNA solver
 *
 * TransientPlot manages the step-response chart.
 */

'use strict';

// ─── Dark-theme defaults for Chart.js ────────────────────────────────────────

const _T = () => window.CHART_THEME || {
  tick: '#e6edf3', axisTitle: '#f4f6f8', legend: '#d8dee4',
  grid: '#2d3a52', font: 'JetBrains Mono, monospace', tickSize: 10, titleSize: 11,
};

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 200 },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: {
        color: _T().legend,
        boxWidth: 12,
        font: { size: 11, family: _T().font },
        padding: 8,
      },
    },
    tooltip: {
      backgroundColor: '#161b22',
      borderColor: '#30363d',
      borderWidth: 1,
      titleColor: '#f0f3f6',
      bodyColor: '#c9d1d9',
      callbacks: {
        title: (items) => `${items[0].parsed.x.toFixed(1)} Hz`,
      },
    },
  },
  scales: {
    x: {
      type: 'logarithmic',
      min: 10,
      max: 100_000,
      title: { display: true, text: 'Frequenza (Hz)', color: _T().axisTitle, font: { size: _T().titleSize, family: _T().font } },
      grid: { color: _T().grid },
      border: { color: _T().border },
      ticks: {
        color: _T().tick,
        font: { size: _T().tickSize, family: _T().font },
        maxTicksLimit: 6,
        callback: (v) => {
          const labels = { 10: '10', 100: '100', 1000: '1k', 10000: '10k', 100000: '100k' };
          return labels[v] ?? '';
        },
      },
    },
    y: {
      grid: { color: _T().grid },
      border: { color: _T().border },
      ticks: { color: _T().tick, font: { size: _T().tickSize, family: _T().font }, maxTicksLimit: 6 },
    },
  },
};

// Merge deep (two-level) chart options
function mergeOpts(base, extra) {
  const r = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    r[k] = (v && typeof v === 'object' && !Array.isArray(v))
      ? { ...(base[k] || {}), ...v }
      : v;
  }
  return r;
}

// ─── BodePlot ─────────────────────────────────────────────────────────────────

class BodePlot {
  constructor(magCanvasId, phaseCanvasId) {
    this.chartMag   = this._createChart(magCanvasId, {
      scales: {
        y: {
          title: { display: true, text: 'Ampiezza (dB)', color: _T().axisTitle, font: { size: _T().titleSize, family: _T().font } },
          suggestedMin: -60,
          suggestedMax: 10,
        },
      },
    });

    this.chartPhase = this._createChart(phaseCanvasId, {
      scales: {
        y: {
          title: { display: true, text: 'Fase (°)', color: _T().axisTitle, font: { size: _T().titleSize, family: _T().font } },
          suggestedMin: -180,
          suggestedMax: 0,
        },
      },
    });
  }

  refreshTheme() {
    if (typeof window.applyChartTheme !== 'function') return;
    window.applyChartTheme(this.chartMag);
    window.applyChartTheme(this.chartPhase);
    if (this.chartTransient) window.applyChartTheme(this.chartTransient);
  }

  _createChart(canvasId, extraOpts = {}) {
    const el = document.getElementById(canvasId);
    if (!el) throw new Error(`Canvas not found: ${canvasId}`);

    const opts = { ...CHART_DEFAULTS };
    opts.scales = { ...CHART_DEFAULTS.scales };
    opts.scales.y = { ...CHART_DEFAULTS.scales.y, ...(extraOpts.scales?.y || {}) };

    return new Chart(el, {
      type: 'scatter',
      data: { datasets: [] },
      options: opts,
    });
  }

  /** Update or insert a named dataset. */
  _setDataset(chart, label, xData, yData, color, dash = []) {
    const pts = xData.map((x, i) => ({ x, y: yData[i] })).filter(
      (p) => isFinite(p.x) && isFinite(p.y)
    );

    const existing = chart.data.datasets.find((d) => d.label === label);
    if (existing) {
      existing.data = pts;
      existing.borderColor = color;
    } else {
      chart.data.datasets.push({
        label,
        data: pts,
        showLine: true,
        borderColor: color,
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: dash,
        pointRadius: 0,
        tension: 0,
      });
    }
    chart.update('none');
  }

  /** Remove a named dataset if present. */
  _removeDataset(chart, label) {
    const idx = chart.data.datasets.findIndex((d) => d.label === label);
    if (idx >= 0) { chart.data.datasets.splice(idx, 1); chart.update('none'); }
  }

  /** Plot the analytical RC low-pass response in real-time. */
  updateAnalytical(R, C, fStart = 10, fStop = 100_000, ppd = 100) {
    const decades = Math.log10(fStop / fStart);
    const n = Math.max(2, Math.round(decades * ppd));
    const freqs = Array.from({ length: n }, (_, i) =>
      fStart * 10 ** (i / (n - 1) * decades)
    );

    const mag   = [];
    const phase = [];

    for (const f of freqs) {
      const w = 2 * Math.PI * f;
      const re = 1;
      const im = w * R * C;
      const denom2 = re * re + im * im;
      const H_re = re / denom2;
      const H_im = -im / denom2;
      const mod  = Math.sqrt(H_re ** 2 + H_im ** 2);
      mag.push(20 * Math.log10(mod));
      phase.push(Math.atan2(H_im, H_re) * (180 / Math.PI));
    }

    this._setDataset(this.chartMag,   'Analitico', freqs, mag,   '#58a6ff', [4, 3]);
    this._setDataset(this.chartPhase, 'Analitico', freqs, phase, '#58a6ff', [4, 3]);

    this._syncXRange(fStart, fStop);
  }

  /** Plot results returned by the MNA backend. */
  updateMna(result) {
    const r = result.results;
    if (!r?.frequencies?.length) return;

    this._setDataset(this.chartMag,   'MNA solver', r.frequencies, r.magnitude_db, '#3fb950');
    this._setDataset(this.chartPhase, 'MNA solver', r.frequencies, r.phase_deg,    '#3fb950');

    this._syncXRange();
  }

  clearMna() {
    this._removeDataset(this.chartMag,   'MNA solver');
    this._removeDataset(this.chartPhase, 'MNA solver');
  }

  _syncXRange(fStart, fStop) {
    for (const ch of [this.chartMag, this.chartPhase]) {
      if (fStart) ch.options.scales.x.min = fStart;
      if (fStop)  ch.options.scales.x.max = fStop;
      ch.update('none');
    }
  }

  /** Vertical marker line at frequency fc. */
  setFcMarker(fc) {
    for (const { chart, label, color } of [
      { chart: this.chartMag,   label: 'Analitico', color: '#58a6ff' },
      { chart: this.chartPhase, label: 'Analitico', color: '#58a6ff' },
    ]) {
      const ds = chart.data.datasets.find((d) => d.label === label);
      if (!ds || !ds.data.length) continue;
      // Annotate with a vertical line dataset (2 points at fc)
      const fcLabel = `f_c marker`;
      this._removeDataset(chart, fcLabel);
      const yArr = ds.data.map((p) => p.y);
      const yMin = Math.min(...yArr) - 5;
      const yMax = Math.max(...yArr) + 5;
      chart.data.datasets.push({
        label: fcLabel,
        data: [{ x: fc, y: yMin }, { x: fc, y: yMax }],
        showLine: true,
        borderColor: 'rgba(210,153,34,0.5)',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
      });
      chart.update('none');
    }
  }
}

// ─── TransientPlot ────────────────────────────────────────────────────────────

class TransientPlot {
  constructor(canvasId) {
    const el = document.getElementById(canvasId);
    if (!el) return;

    this.chart = new Chart(el, {
      type: 'scatter',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { color: _T().legend, boxWidth: 12, font: { size: 11, family: _T().font }, padding: 8 },
          },
          tooltip: {
            backgroundColor: '#161b22',
            borderColor: '#30363d',
            borderWidth: 1,
            titleColor: '#f0f3f6',
            bodyColor: '#c9d1d9',
            callbacks: { title: (items) => `t = ${items[0].parsed.x.toFixed(3)} ms` },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'Tempo (ms)', color: _T().axisTitle, font: { size: _T().titleSize, family: _T().font } },
            grid: { color: _T().grid },
            border: { color: _T().border },
            ticks: { color: _T().tick, font: { size: _T().tickSize, family: _T().font } },
          },
          y: {
            title: { display: true, text: 'Tensione (V)', color: _T().axisTitle, font: { size: _T().titleSize, family: _T().font } },
            grid: { color: _T().grid },
            border: { color: _T().border },
            ticks: { color: _T().tick, font: { size: _T().tickSize, family: _T().font } },
            suggestedMin: 0,
            suggestedMax: 1.2,
          },
        },
      },
    });
  }

  refreshTheme() {
    window.applyChartTheme?.(this.chart);
  }

  update(result) {
    if (!this.chart) return;
    const r = result.results;
    if (!r?.times?.length) return;

    const pts = r.times.map((t, i) => ({ x: t, y: r.voltages[i] }));
    const existing = this.chart.data.datasets.find((d) => d.label === 'V(out)');

    if (existing) {
      existing.data = pts;
    } else {
      this.chart.data.datasets.push({
        label: 'V(out)',
        data: pts,
        showLine: true,
        borderColor: '#a371f7',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0,
      });
    }
    this.chart.update('none');
  }

  /** Also draw analytical V(t) = Vin(1-e^{-t/τ}) */
  updateAnalytical(R, C, Vin = 1) {
    if (!this.chart) return;
    const tau = R * C;
    const t_end_ms = 5 * tau * 1000;
    const n = 400;
    const pts = Array.from({ length: n }, (_, i) => {
      const t_ms = (i / (n - 1)) * t_end_ms;
      const t_s  = t_ms / 1000;
      return { x: t_ms, y: Vin * (1 - Math.exp(-t_s / tau)) };
    });

    const label = 'Analitico V(t)';
    const existing = this.chart.data.datasets.find((d) => d.label === label);
    if (existing) {
      existing.data = pts;
    } else {
      this.chart.data.datasets.push({
        label,
        data: pts,
        showLine: true,
        borderColor: '#58a6ff',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [4, 3],
        pointRadius: 0,
        tension: 0,
      });
    }

    this.chart.options.scales.x.max = t_end_ms;
    this.chart.update('none');
  }
}
