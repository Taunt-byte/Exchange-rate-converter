const API_BASE = "https://api.frankfurter.dev/v2";
const HISTORY_KEY = "currencyflow-history";
const THEME_KEY = "currencyflow-theme";
const MAX_HISTORY = 10;

const amountInput = document.querySelector("#amount");
const fromCurrency = document.querySelector("#fromCurrency");
const toCurrency = document.querySelector("#toCurrency");
const convertButton = document.querySelector("#convertButton");
const swapButton = document.querySelector("#swapButton");
const themeButton = document.querySelector("#themeButton");
const resultLabel = document.querySelector("#resultLabel");
const resultValue = document.querySelector("#resultValue");
const exchangeRate = document.querySelector("#exchangeRate");
const rateDate = document.querySelector("#rateDate");
const statusMessage = document.querySelector("#status");
const historyList = document.querySelector("#historyList");
const clearHistoryButton = document.querySelector("#clearHistoryButton");
const chartPeriod = document.querySelector("#chartPeriod");
const chartCanvas = document.querySelector("#rateChart");
const chartMessage = document.querySelector("#chartMessage");
const chartLatest = document.querySelector("#chartLatest");
const chartChange = document.querySelector("#chartChange");
const chartSubtitle = document.querySelector("#chartSubtitle");

let currencies = [];
let lastConversion = null;
let chartRequestId = 0;

function formatCurrency(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatDate(dateString) {
  if (!dateString) return "Date unavailable";
  const date = new Date(`${dateString}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const errorData = await response.json();
      if (errorData.message) message = errorData.message;
    } catch {
      // Keep the HTTP status message if the response has no JSON body.
    }
    throw new Error(message);
  }
  return response.json();
}

// Fetch the currency catalogue instead of maintaining a hard-coded list.
async function loadCurrencies() {
  try {
    const data = await fetchJson(`${API_BASE}/currencies`);
    currencies = data
      .filter((currency) => currency.iso_code && currency.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    populateCurrencySelect(fromCurrency, "BRL");
    populateCurrencySelect(toCurrency, "USD");
    statusMessage.textContent = "Currencies loaded. Ready to convert.";
    await convertCurrency();
  } catch (error) {
    console.error(error);
    statusMessage.textContent =
      "Could not load currencies. Check your connection and reload the page.";
    fromCurrency.innerHTML = '<option value="BRL">BRL</option>';
    toCurrency.innerHTML = '<option value="USD">USD</option>';
  }
}

function populateCurrencySelect(select, preferredCode) {
  select.replaceChildren();

  for (const currency of currencies) {
    const option = document.createElement("option");
    option.value = currency.iso_code;
    option.textContent = `${currency.iso_code} — ${currency.name}`;
    select.append(option);
  }

  if (currencies.some((currency) => currency.iso_code === preferredCode)) {
    select.value = preferredCode;
  }
}

async function convertCurrency() {
  if (!currencies.length) return;

  const amountText = amountInput.value.trim();
  const amount = Number(amountText);
  const from = fromCurrency.value;
  const to = toCurrency.value;

  if (amountText === "" || !Number.isFinite(amount) || amount < 0) {
    statusMessage.textContent = "Enter a valid amount equal to or greater than zero.";
    return;
  }

  convertButton.disabled = true;
  convertButton.textContent = "Converting…";
  statusMessage.textContent = "Fetching the latest available rate…";
  resultValue.textContent = "—";
  exchangeRate.textContent = "";
  rateDate.textContent = "";

  try {
    let rate = 1;
    let observationDate = null;

    if (from !== to) {
      const data = await fetchJson(
        `${API_BASE}/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`
      );
      rate = data.rate;
      observationDate = data.date;

      if (typeof rate !== "number" || !Number.isFinite(rate)) {
        throw new Error("The API did not return a valid exchange rate.");
      }
    } else {
      observationDate = getLocalDateString();
    }

    const convertedAmount = amount * rate;
    lastConversion = { amount, from, to, rate, convertedAmount, observationDate };

    resultLabel.textContent = `${formatCurrency(amount, from)} equals`;
    resultValue.textContent = formatCurrency(convertedAmount, to);
    exchangeRate.textContent = `1 ${from} = ${formatCurrency(rate, to)}`;
    rateDate.textContent = from === to
      ? "Same currency — no exchange required."
      : `Rate observation date: ${formatDate(observationDate)}`;

    statusMessage.textContent = "Conversion completed.";
    saveConversion(lastConversion);
    renderHistory();
    await loadChart();
  } catch (error) {
    console.error(error);
    statusMessage.textContent =
      "Unable to retrieve this rate. Check your connection and try again.";
    resultValue.textContent = "Unavailable";
    exchangeRate.textContent = "";
    rateDate.textContent = "";
  } finally {
    convertButton.disabled = false;
    convertButton.textContent = "Convert currency →";
  }
}

function swapCurrencies() {
  const previousFrom = fromCurrency.value;
  fromCurrency.value = toCurrency.value;
  toCurrency.value = previousFrom;
  convertCurrency();
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversion(conversion) {
  const history = readHistory();
  history.unshift({
    ...conversion,
    convertedAt: new Date().toISOString(),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function renderHistory() {
  const history = readHistory();
  historyList.replaceChildren();

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Your conversions will appear here.";
    historyList.append(empty);
    return;
  }

  for (const item of history) {
    const row = document.createElement("article");
    row.className = "history-item";

    const details = document.createElement("div");
    const pair = document.createElement("div");
    pair.className = "history-pair";
    pair.textContent = `${item.from} → ${item.to}`;

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = new Date(item.convertedAt).toLocaleString();

    const values = document.createElement("div");
    values.className = "history-values";

    const result = document.createElement("div");
    result.className = "history-result";
    result.textContent = formatCurrency(item.convertedAmount, item.to);

    const input = document.createElement("div");
    input.className = "history-input";
    input.textContent = formatCurrency(item.amount, item.from);

    details.append(pair, meta);
    values.append(result, input);
    row.append(details, values);
    historyList.append(row);
  }
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  themeButton.innerHTML = isDark
    ? '☀ <span>Light mode</span>'
    : '☾ <span>Dark mode</span>';
  themeButton.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#101522" : "#f4f7fb";
  if (lastConversion) drawChart(lastConversion.chartPoints || []);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "light";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// Draw a responsive line chart using the native Canvas API (no chart library).
function drawChart(points) {
  const canvas = chartCanvas;
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);

  if (!points.length) return;

  const styles = getComputedStyle(document.documentElement);
  const muted = styles.getPropertyValue("--muted").trim();
  const border = styles.getPropertyValue("--border").trim();
  const primary = styles.getPropertyValue("--primary").trim();
  const width = rect.width;
  const height = rect.height;
  const pad = { top: 18, right: 12, bottom: 30, left: 12 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const values = points.map((point) => point.rate);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min *= 0.99;
    max *= 1.01;
  }
  const range = max - min;
  min -= range * 0.08;
  max += range * 0.08;

  context.font = "11px system-ui, sans-serif";
  context.strokeStyle = border;
  context.fillStyle = muted;
  context.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y = pad.top + (plotHeight * i) / 3;
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
  }

  const coordinates = points.map((point, index) => ({
    x: pad.left + (index / Math.max(1, points.length - 1)) * plotWidth,
    y: pad.top + ((max - point.rate) / (max - min)) * plotHeight,
  }));

  const gradient = context.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, "rgba(49, 94, 251, 0.20)");
  gradient.addColorStop(1, "rgba(49, 94, 251, 0.00)");

  context.beginPath();
  coordinates.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.lineTo(coordinates[coordinates.length - 1].x, height - pad.bottom);
  context.lineTo(coordinates[0].x, height - pad.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  coordinates.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.strokeStyle = primary;
  context.lineWidth = 2.5;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();

  const first = points[0];
  const last = points[points.length - 1];
  context.fillStyle = muted;
  context.textAlign = "left";
  context.fillText(formatDate(first.date), pad.left, height - 8);
  context.textAlign = "right";
  context.fillText(formatDate(last.date), width - pad.right, height - 8);
}

async function loadChart() {
  if (!lastConversion) return;
  const requestId = ++chartRequestId;
  const { from, to } = lastConversion;
  chartSubtitle.textContent = `${from} to ${to} · Historical reference rates`;
  chartMessage.classList.remove("hidden");
  chartMessage.textContent = "Loading historical rates…";
  chartLatest.textContent = "—";
  chartChange.textContent = "Loading…";
  chartChange.className = "change-pill";

  if (from === to) {
    chartMessage.textContent = "Choose two different currencies to view the chart.";
    chartLatest.textContent = "1.00";
    chartChange.textContent = "No change";
    drawChart([]);
    return;
  }

  const days = Number(chartPeriod.value);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const params = new URLSearchParams({
    base: from,
    quotes: to,
    from: getLocalDateString(start),
    to: getLocalDateString(end),
  });

  try {
    const data = await fetchJson(`${API_BASE}/rates?${params}`);
    if (requestId !== chartRequestId) return;

    const points = data
      .filter((item) => item.base === from && item.quote === to && Number.isFinite(item.rate))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!points.length) {
      chartMessage.textContent = "No historical data is available for this currency pair and period.";
      chartLatest.textContent = "—";
      chartChange.textContent = "No data";
      drawChart([]);
      return;
    }

    lastConversion.chartPoints = points;
    chartMessage.classList.add("hidden");
    chartLatest.textContent = formatCurrency(points[points.length - 1].rate, to);

    const firstRate = points[0].rate;
    const latestRate = points[points.length - 1].rate;
    const percentage = firstRate === 0 ? 0 : ((latestRate - firstRate) / firstRate) * 100;
    chartChange.textContent = `${percentage >= 0 ? "+" : ""}${percentage.toFixed(2)}%`;
    chartChange.className = `change-pill ${percentage > 0 ? "positive" : percentage < 0 ? "negative" : ""}`;
    drawChart(points);
  } catch (error) {
    console.error(error);
    if (requestId !== chartRequestId) return;
    chartMessage.textContent = "Could not load historical rates. Try again later.";
    chartLatest.textContent = "—";
    chartChange.textContent = "Unavailable";
    drawChart([]);
  }
}

convertButton.addEventListener("click", convertCurrency);
swapButton.addEventListener("click", swapCurrencies);
fromCurrency.addEventListener("change", convertCurrency);
toCurrency.addEventListener("change", convertCurrency);
amountInput.addEventListener("change", convertCurrency);
chartPeriod.addEventListener("change", loadChart);
themeButton.addEventListener("click", toggleTheme);
clearHistoryButton.addEventListener("click", clearHistory);
window.addEventListener("resize", () => {
  if (lastConversion?.chartPoints) drawChart(lastConversion.chartPoints);
});

applyTheme(localStorage.getItem(THEME_KEY) || "light");
renderHistory();
loadCurrencies();
