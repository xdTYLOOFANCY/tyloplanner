// TyloPlanner — shared Chart.js helpers, used by workouts, habits and study tabs.

import { z, MONTHS } from './utils.js';

let chartInstances = {};
const themeRerenders = [];

// Tabs with charts register their render fn so a theme switch redraws them.
export function registerChartRerender(fn) { themeRerenders.push(fn); }

window.addEventListener('theme-changed', () => {
  Object.values(chartInstances).forEach(c => { if (c) c.destroy(); });
  chartInstances = {};
  themeRerenders.forEach(fn => {
    try { fn(); } catch (e) { console.error(e); } // one bad renderer must not blank the rest
  });
});

export function getPastMonths(count) {
  var out = [], now = new Date();
  for (var i = count - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: d.getFullYear() + "-" + z(d.getMonth() + 1), label: MONTHS[d.getMonth()] + " '" + d.getFullYear().toString().substring(2) });
  }
  return out;
}

export function getBarGradient(ctx, c1, c2) {
  if (!ctx) return c1;
  var gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, c1);
  gradient.addColorStop(1, c2);
  return gradient;
}

// Standard chart options with no grid lines, themed ticks.
export function noGridOptions() {
  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue('--text').trim();
  return {
    scales: {
      x: { grid: { display: false }, ticks: { color: textColor } },
      y: { grid: { display: false }, ticks: { color: textColor, stepSize: 1 }, beginAtZero: true }
    }
  };
}

export function createChart(canvasId, type, labels, datasets, options = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  // Get computed theme variables
  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue('--text').trim();
  const gridColor = style.getPropertyValue('--border').trim();
  const fontFamily = style.getPropertyValue('font-family').trim();
  const panelColor = style.getPropertyValue('--panel').trim();

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    color: textColor,
    font: { family: fontFamily },
    plugins: {
      legend: {
        labels: { color: textColor, font: { family: fontFamily, size: 13 } }
      },
      tooltip: {
        backgroundColor: panelColor,
        titleColor: textColor,
        bodyColor: textColor,
        borderColor: gridColor,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        titleFont: { family: fontFamily, size: 13, weight: 'bold' },
        bodyFont: { family: fontFamily, size: 13 },
      }
    },
    scales: {
      x: {
        grid: { color: gridColor, drawBorder: false },
        ticks: { color: textColor, font: { family: fontFamily } }
      },
      y: {
        grid: { color: gridColor, drawBorder: false },
        ticks: { color: textColor, font: { family: fontFamily } },
        beginAtZero: true
      }
    }
  };

  if (window.Chart) {
    chartInstances[canvasId] = new window.Chart(ctx, {
      type: type,
      data: {
        labels: labels,
        datasets: datasets
      },
      // Merge plugins one level deep so e.g. {legend:{display:false}} keeps the themed tooltip.
      options: Object.assign({}, defaultOptions, options,
        { plugins: Object.assign({}, defaultOptions.plugins, options.plugins) })
    });
  } else {
    console.error("Chart.js not loaded.");
  }
}
