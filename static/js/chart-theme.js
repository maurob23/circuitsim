/**
 * Colori e tipografia condivisi per tutti i grafici (Chart.js + canvas).
 */
'use strict';

function _readCssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

window.CHART_THEME = {
  tick:       '#e6edf3',
  axisTitle:  '#f4f6f8',
  legend:     '#d8dee4',
  grid:       '#2d3a52',
  gridFaint:  'rgba(45, 58, 82, 0.7)',
  border:     '#484f58',
  font:       'JetBrains Mono, monospace',
  tickSize:   10,
  titleSize:  11,
};

window.syncChartThemeFromCss = function syncChartThemeFromCss() {
  const T = window.CHART_THEME;
  T.tick      = _readCssVar('--chart-tick', T.tick);
  T.axisTitle = _readCssVar('--chart-title', T.axisTitle);
  T.legend    = _readCssVar('--text-2', T.legend);
  T.grid      = _readCssVar('--chart-grid', T.grid);
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = T.tick;
    Chart.defaults.font.family = T.font;
    Chart.defaults.font.size = T.tickSize;
  }
  return T;
};

window.applyChartTheme = function applyChartTheme(chart) {
  if (!chart?.options) return;
  const T = window.CHART_THEME;
  const applyScale = (sc) => {
    if (!sc) return;
    if (sc.ticks) sc.ticks.color = T.tick;
    if (sc.title) sc.title.color = T.axisTitle;
    if (sc.grid) sc.grid.color = T.grid;
    if (sc.border) sc.border.color = T.border;
  };
  applyScale(chart.options.scales?.x);
  applyScale(chart.options.scales?.y);
  if (chart.options.plugins?.legend?.labels) {
    chart.options.plugins.legend.labels.color = T.legend;
  }
  chart.update('none');
};

syncChartThemeFromCss();

if (typeof Chart !== 'undefined') {
  Chart.defaults.color = window.CHART_THEME.tick;
  Chart.defaults.font.family = window.CHART_THEME.font;
  Chart.defaults.font.size = window.CHART_THEME.tickSize;
}
