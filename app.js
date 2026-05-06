const FRAME_RATE = 10;
const FRAME_DT = 1 / FRAME_RATE;

const METRICS = [
  { id: "velocity", label: "Velocity", group: "physical", color: "#2a9d8f" },
  { id: "acceleration", label: "Acceleration", group: "physical", color: "#e76f51" },
  { id: "deceleration", label: "Deceleration", group: "physical", color: "#9a031e" },
  { id: "deltaAngle", label: "Delta Angle", group: "physical", color: "#fb8500" },
  { id: "distanceCovered", label: "Distance Covered", group: "physical", color: "#023047" },
  { id: "sprintIntensity", label: "Sprint Intensity", group: "physical", color: "#ff006e" },
  { id: "fatigueIndex", label: "Fatigue Index", group: "physical", color: "#6a4c93" },
  { id: "workRatePerMinute", label: "Work Rate per Minute", group: "physical", color: "#560bad" },
  { id: "highIntensityIntervals", label: "High-Intensity Intervals", group: "physical", color: "#ef476f" },

  { id: "pitchCoverageArea", label: "Pitch Coverage Area", group: "spatial", color: "#1d3557" },
  { id: "heatmapDensityScore", label: "Heatmap Density Score", group: "spatial", color: "#264653" },
  { id: "positionalStabilityIndex", label: "Positional Stability", group: "spatial", color: "#219ebc" },
  { id: "averagePositionDrift", label: "Average Position Drift", group: "spatial", color: "#8ecae6" },

  { id: "timeOnPitch", label: "Time on Pitch", group: "temporal", color: "#4cc9f0" },
  { id: "activeTime", label: "Active Time", group: "temporal", color: "#43aa8b" },
  { id: "idleTimeRatio", label: "Idle Time Ratio", group: "temporal", color: "#f8961e" },
  { id: "timeInPossessionZone", label: "Time in Possession Zone", group: "temporal", color: "#277da1" },
  { id: "zoneTimeDef", label: "Zone Time Defensive", group: "temporal", color: "#adb5bd" },
  { id: "zoneTimeMid", label: "Zone Time Midfield", group: "temporal", color: "#6c757d" },
  { id: "zoneTimeAtt", label: "Zone Time Attacking", group: "temporal", color: "#343a40" },

  { id: "pressingIntensityIndex", label: "Pressing Intensity", group: "tactical", color: "#d62828" },
  { id: "distanceNearestOpponent", label: "Distance to Nearest Opponent", group: "tactical", color: "#f77f00" },
  { id: "teamCompactnessScore", label: "Team Compactness", group: "tactical", color: "#003049" },
  { id: "transitionSpeed", label: "Transition Speed", group: "tactical", color: "#588157" },
  { id: "heatIntensityScore", label: "Heat Intensity Score", group: "tactical", color: "#b5179e" },
];

const PRESETS = {
  "Speed Analysis": ["velocity", "acceleration", "deceleration", "sprintIntensity"],
  "Fatigue Monitoring": ["fatigueIndex", "workRatePerMinute", "highIntensityIntervals", "idleTimeRatio"],
  "Tactical Positioning": ["teamCompactnessScore", "distanceNearestOpponent", "transitionSpeed", "positionalStabilityIndex"],
  "Full Performance Scan": METRICS.map((m) => m.id),
};

const state = {
  match: null,
  frames: [],
  playersById: {},
  sortedPlayers: [],
  pitchLength: 105,
  pitchWidth: 68,
  frameIndex: 0,
  playing: false,
  playTimer: null,
  selectedMetrics: new Set(["velocity"]),
  layerConfig: {},
  weights: {},
  metricData: {},
  normalizers: {},
  mode: "overlay",
  playerFocus: "ALL",
  compareA: "",
  compareB: "",
  smoothingWindow: 20,
  pitchImage: null,
};

const el = {
  loadBtn: document.getElementById("loadDataBtn"),
  loadStatus: document.getElementById("loadStatus"),
  matchPath: document.getElementById("matchPath"),
  trackingPath: document.getElementById("trackingPath"),
  pitchPath: document.getElementById("pitchPath"),

  metricsContainer: document.getElementById("metricsContainer"),
  metricSearch: document.getElementById("metricSearch"),
  selectAllMetricsBtn: document.getElementById("selectAllMetricsBtn"),
  clearMetricsBtn: document.getElementById("clearMetricsBtn"),

  modeSelect: document.getElementById("modeSelect"),
  playerSelect: document.getElementById("playerSelect"),
  compareA: document.getElementById("comparePlayerA"),
  compareB: document.getElementById("comparePlayerB"),
  smoothWindow: document.getElementById("smoothWindow"),

  weightsContainer: document.getElementById("weightsContainer"),
  presetSelect: document.getElementById("presetSelect"),
  savePresetBtn: document.getElementById("savePresetBtn"),
  exportPresetBtn: document.getElementById("exportPresetBtn"),

  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportXlsxBtn: document.getElementById("exportXlsxBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  exportPdfBtn: document.getElementById("exportPdfBtn"),
  exportHeatmapsBtn: document.getElementById("exportHeatmapsBtn"),

  playBtn: document.getElementById("playBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  stepBackBtn: document.getElementById("stepBackBtn"),
  stepFwdBtn: document.getElementById("stepFwdBtn"),
  frameSlider: document.getElementById("frameSlider"),
  frameLabel: document.getElementById("frameLabel"),
  timeLabel: document.getElementById("timeLabel"),

  pitchCanvas: document.getElementById("pitchCanvas"),
  timelineCanvas: document.getElementById("timelineCanvas"),
  layerControls: document.getElementById("layerControls"),
  metricsReadout: document.getElementById("metricsReadout"),
  engineHealth: document.getElementById("engineHealth"),
};

const pitchCtx = el.pitchCanvas.getContext("2d");
const timelineCtx = el.timelineCanvas.getContext("2d");

function setStatus(msg, cls = "idle") {
  el.loadStatus.textContent = msg;
  el.loadStatus.className = `status ${cls}`;
}

function toClock(frame) {
  const t = frame * FRAME_DT;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const hs = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(hs).padStart(2, "0")}`;
}

function downloadBlob(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function loadJsonl(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  const text = await res.text();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizeFrames(frames) {
  const valid = frames.filter((f) => Number.isFinite(f.frame));
  valid.sort((a, b) => a.frame - b.frame);
  return valid;
}

function initPlayers(match) {
  const map = {};
  for (const p of match.players || []) {
    map[p.id] = {
      id: p.id,
      name: p.short_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      teamId: p.team_id,
      trackable: p.trackable_object,
    };
  }
  return map;
}

function mapTrackableToPlayer(playersById) {
  const mapping = {};
  Object.values(playersById).forEach((p) => {
    mapping[p.trackable] = p.id;
  });
  return mapping;
}

function buildPlayerDataInMatchSpace(frames, trackableMap) {
  return frames.map((f) => ({
    ...f,
    player_data: (f.player_data || [])
      .map((p) => {
        const realId = trackableMap[p.player_id] || p.player_id;
        return { ...p, player_id: realId };
      })
      .filter((p) => !!p.player_id),
  }));
}

async function loadPitch(path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

async function computeMetrics() {
  const worker = new Worker("metricsWorker.js", { type: "module" });

  const payload = {
    frames: state.frames,
    players: state.sortedPlayers,
    playerToTeam: Object.fromEntries(state.sortedPlayers.map((p) => [p.id, p.teamId])),
    pitchLength: state.pitchLength,
    pitchWidth: state.pitchWidth,
  };

  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      if (event.data?.type === "ready") {
        resolve(event.data.payload.metricData);
        worker.terminate();
      }
    };
    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };
    worker.postMessage({ type: "compute", payload });
  });
}

function buildNormalizers() {
  const normalizers = {};
  for (const metric of METRICS) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const player of state.sortedPlayers) {
      const arr = state.metricData[player.id]?.[metric.id];
      if (!arr) continue;
      for (const v of arr) {
        if (!Number.isFinite(v)) continue;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min = 0;
      max = 1;
    }
    normalizers[metric.id] = { min, max };
  }
  state.normalizers = normalizers;
}

function normalizeMetric(metricId, value) {
  const n = state.normalizers[metricId];
  if (!n) return 0;
  return (value - n.min) / (n.max - n.min || 1);
}

function compositeValue(playerId, frameIndex) {
  const selected = [...state.selectedMetrics];
  if (!selected.length) return 0;
  let sum = 0;
  let wSum = 0;
  for (const metricId of selected) {
    const w = Number(state.weights[metricId] ?? 1);
    const v = state.metricData[playerId]?.[metricId]?.[frameIndex] ?? 0;
    sum += normalizeMetric(metricId, v) * w;
    wSum += w;
  }
  return wSum ? sum / wSum : 0;
}

function valueColor(metricId, normalized, alpha = 1) {
  const base = METRICS.find((m) => m.id === metricId)?.color || "#2a9d8f";
  const rgb = hexToRgb(base);
  if (!rgb) return `rgba(42,157,143,${alpha})`;
  const mix = 0.2 + normalized * 0.8;
  return `rgba(${Math.round(rgb.r * mix)}, ${Math.round(rgb.g * mix)}, ${Math.round(rgb.b * mix)}, ${alpha})`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return null;
  const n = parseInt(clean, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function pitchToCanvas(x, y) {
  const px = ((x + state.pitchLength / 2) / state.pitchLength) * el.pitchCanvas.width;
  const py = ((state.pitchWidth / 2 - y) / state.pitchWidth) * el.pitchCanvas.height;
  return { x: px, y: py };
}

function drawPitchBackground() {
  pitchCtx.clearRect(0, 0, el.pitchCanvas.width, el.pitchCanvas.height);
  if (state.pitchImage) {
    pitchCtx.drawImage(state.pitchImage, 0, 0, el.pitchCanvas.width, el.pitchCanvas.height);
  } else {
    pitchCtx.fillStyle = "#2f8f46";
    pitchCtx.fillRect(0, 0, el.pitchCanvas.width, el.pitchCanvas.height);
    pitchCtx.strokeStyle = "rgba(255,255,255,0.8)";
    pitchCtx.lineWidth = 2;
    pitchCtx.strokeRect(8, 8, el.pitchCanvas.width - 16, el.pitchCanvas.height - 16);
    pitchCtx.beginPath();
    pitchCtx.moveTo(el.pitchCanvas.width / 2, 8);
    pitchCtx.lineTo(el.pitchCanvas.width / 2, el.pitchCanvas.height - 8);
    pitchCtx.stroke();
  }
}

function drawPlayers() {
  const frame = state.frames[state.frameIndex];
  if (!frame) return;

  const selected = [...state.selectedMetrics];
  const allSelected = selected.length === METRICS.length;
  const mode = allSelected ? "composite" : state.mode;

  const compareA = Number(state.compareA || 0);
  const compareB = Number(state.compareB || 0);

  for (const p of frame.player_data || []) {
    const id = p.player_id;
    if (state.playerFocus !== "ALL" && Number(state.playerFocus) !== id) continue;
    const c = pitchToCanvas(p.x, p.y);

    pitchCtx.save();
    pitchCtx.translate(c.x, c.y);

    if (mode === "overlay") {
      const metrics = selected.slice(0, 4);
      metrics.forEach((metricId, idx) => {
        const raw = state.metricData[id]?.[metricId]?.[state.frameIndex] ?? 0;
        const normalized = normalizeMetric(metricId, raw);
        const opacity = state.layerConfig[metricId]?.opacity ?? 0.65;
        const radius = 6 + normalized * 12 + idx * 2;
        pitchCtx.beginPath();
        pitchCtx.fillStyle = valueColor(metricId, normalized, opacity);
        pitchCtx.arc(0, 0, radius, 0, Math.PI * 2);
        pitchCtx.fill();
      });
    } else if (mode === "composite") {
      const cVal = compositeValue(id, state.frameIndex);
      const radius = 7 + cVal * 18;
      pitchCtx.beginPath();
      pitchCtx.fillStyle = valueColor("fatigueIndex", cVal, 0.78);
      pitchCtx.arc(0, 0, radius, 0, Math.PI * 2);
      pitchCtx.fill();
    } else if (mode === "comparative") {
      const metricId = selected[0] || "velocity";
      const aVal = state.metricData[compareA]?.[metricId]?.[state.frameIndex] ?? 0;
      const bVal = state.metricData[compareB]?.[metricId]?.[state.frameIndex] ?? 0;
      const delta = normalizeMetric(metricId, aVal - bVal);
      const radius = 6 + Math.abs(delta) * 14;
      pitchCtx.beginPath();
      pitchCtx.fillStyle = delta >= 0 ? "rgba(0,127,95,0.75)" : "rgba(188,57,8,0.75)";
      pitchCtx.arc(0, 0, radius, 0, Math.PI * 2);
      pitchCtx.fill();
    } else {
      const metricId = selected[0] || "velocity";
      const raw = state.metricData[id]?.[metricId]?.[state.frameIndex] ?? 0;
      const normalized = normalizeMetric(metricId, raw);
      pitchCtx.beginPath();
      pitchCtx.fillStyle = valueColor(metricId, normalized, 0.8);
      pitchCtx.arc(0, 0, 8 + normalized * 15, 0, Math.PI * 2);
      pitchCtx.fill();
    }

    pitchCtx.fillStyle = "#101010";
    pitchCtx.font = "11px Sora";
    pitchCtx.fillText(state.playersById[id]?.name?.split(" ")[0] || String(id), 10, -10);
    pitchCtx.restore();
  }
}

function drawBall() {
  const frame = state.frames[state.frameIndex];
  if (!frame?.ball_data) return;
  const b = frame.ball_data;
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
  const c = pitchToCanvas(b.x, b.y);

  pitchCtx.beginPath();
  pitchCtx.fillStyle = "#f8f9fa";
  pitchCtx.strokeStyle = "#495057";
  pitchCtx.lineWidth = 2;
  pitchCtx.arc(c.x, c.y, 7, 0, Math.PI * 2);
  pitchCtx.fill();
  pitchCtx.stroke();
}

function smoothArray(arr, windowSize) {
  const out = new Array(arr.length).fill(0);
  for (let i = 0; i < arr.length; i += 1) {
    const s = Math.max(0, i - windowSize + 1);
    let sum = 0;
    let c = 0;
    for (let k = s; k <= i; k += 1) {
      if (Number.isFinite(arr[k])) {
        sum += arr[k];
        c += 1;
      }
    }
    out[i] = c ? sum / c : 0;
  }
  return out;
}

function drawTimeline() {
  timelineCtx.clearRect(0, 0, el.timelineCanvas.width, el.timelineCanvas.height);
  timelineCtx.fillStyle = "#fff";
  timelineCtx.fillRect(0, 0, el.timelineCanvas.width, el.timelineCanvas.height);

  const selected = [...state.selectedMetrics];
  if (!selected.length || !state.sortedPlayers.length) return;

  const focusId = state.playerFocus === "ALL" ? state.sortedPlayers[0].id : Number(state.playerFocus);
  const h = el.timelineCanvas.height;
  const w = el.timelineCanvas.width;

  selected.slice(0, 3).forEach((metricId, idx) => {
    const arr = state.metricData[focusId]?.[metricId];
    if (!arr) return;
    const sm = smoothArray(arr, state.smoothingWindow);
    timelineCtx.beginPath();
    timelineCtx.strokeStyle = METRICS.find((m) => m.id === metricId)?.color || "#2a9d8f";
    timelineCtx.lineWidth = 2;

    for (let i = 0; i < sm.length; i += 1) {
      const x = (i / Math.max(1, sm.length - 1)) * w;
      const y = h - normalizeMetric(metricId, sm[i]) * (h - 30) - 15;
      if (i === 0) timelineCtx.moveTo(x, y);
      else timelineCtx.lineTo(x, y);
    }
    timelineCtx.stroke();

    timelineCtx.fillStyle = timelineCtx.strokeStyle;
    timelineCtx.fillText(metricId, 8, 16 + idx * 14);
  });

  const cursorX = (state.frameIndex / Math.max(1, state.frames.length - 1)) * w;
  timelineCtx.strokeStyle = "#222";
  timelineCtx.lineWidth = 1;
  timelineCtx.beginPath();
  timelineCtx.moveTo(cursorX, 0);
  timelineCtx.lineTo(cursorX, h);
  timelineCtx.stroke();
}

function renderLayerControls() {
  const selected = [...state.selectedMetrics];
  el.layerControls.innerHTML = "";
  selected.forEach((metricId) => {
    if (!state.layerConfig[metricId]) {
      state.layerConfig[metricId] = { opacity: 0.7, normalized: true, visible: true };
    }

    const row = document.createElement("div");
    row.className = "layer-row";

    const name = document.createElement("span");
    name.textContent = METRICS.find((m) => m.id === metricId)?.label || metricId;

    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = "0.05";
    opacity.max = "1";
    opacity.step = "0.05";
    opacity.value = String(state.layerConfig[metricId].opacity);
    opacity.addEventListener("input", () => {
      state.layerConfig[metricId].opacity = Number(opacity.value);
      render();
    });

    const visible = document.createElement("input");
    visible.type = "checkbox";
    visible.checked = state.layerConfig[metricId].visible;
    visible.addEventListener("change", () => {
      state.layerConfig[metricId].visible = visible.checked;
      if (!visible.checked) state.selectedMetrics.delete(metricId);
      renderMetricPanel();
      render();
    });

    row.append(name, opacity, visible);
    el.layerControls.appendChild(row);
  });
}

function renderWeights() {
  el.weightsContainer.innerHTML = "";
  const selected = [...state.selectedMetrics];
  selected.forEach((metricId) => {
    if (!state.weights[metricId]) state.weights[metricId] = 1;
    const row = document.createElement("div");
    row.className = "weight-row";
    const label = document.createElement("span");
    label.textContent = METRICS.find((m) => m.id === metricId)?.label || metricId;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "3";
    slider.step = "0.05";
    slider.value = String(state.weights[metricId]);
    slider.addEventListener("input", () => {
      state.weights[metricId] = Number(slider.value);
      render();
    });
    row.append(label, slider);
    el.weightsContainer.appendChild(row);
  });
}

function renderReadout() {
  const selected = [...state.selectedMetrics];
  el.metricsReadout.innerHTML = "";

  const focusId = state.playerFocus === "ALL" ? state.sortedPlayers[0]?.id : Number(state.playerFocus);
  if (!focusId) return;

  selected.forEach((metricId) => {
    const row = document.createElement("div");
    row.className = "readout-row";
    const n = document.createElement("span");
    n.textContent = METRICS.find((m) => m.id === metricId)?.label || metricId;
    const v = document.createElement("strong");
    const raw = state.metricData[focusId]?.[metricId]?.[state.frameIndex] ?? 0;
    v.textContent = raw.toFixed(3);
    row.append(n, v);
    el.metricsReadout.appendChild(row);
  });

  if (state.mode === "composite") {
    const row = document.createElement("div");
    row.className = "readout-row";
    const n = document.createElement("span");
    n.textContent = "Composite Index";
    const v = document.createElement("strong");
    v.textContent = compositeValue(focusId, state.frameIndex).toFixed(3);
    row.append(n, v);
    el.metricsReadout.appendChild(row);
  }
}

function renderHealth() {
  const items = [
    `Frames loaded: ${state.frames.length}`,
    `Players mapped: ${state.sortedPlayers.length}`,
    `Selected metrics: ${state.selectedMetrics.size}`,
    `Playback FPS target: ${FRAME_RATE}`,
    `Frame aligned: ${Number.isFinite(state.frameIndex)}`,
  ];

  el.engineHealth.innerHTML = "";
  items.forEach((txt) => {
    const li = document.createElement("li");
    li.textContent = txt;
    el.engineHealth.appendChild(li);
  });
}

function renderMetricPanel() {
  const q = el.metricSearch.value.trim().toLowerCase();
  const grouped = { physical: [], tactical: [], spatial: [], temporal: [] };
  for (const m of METRICS) {
    if (q && !m.label.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q)) continue;
    grouped[m.group].push(m);
    if (!state.layerConfig[m.id]) state.layerConfig[m.id] = { opacity: 0.7, normalized: true, visible: true };
    if (!state.weights[m.id]) state.weights[m.id] = 1;
  }

  el.metricsContainer.innerHTML = "";
  Object.entries(grouped).forEach(([group, list]) => {
    if (!list.length) return;
    const card = document.createElement("div");
    card.className = "metric-group";

    const title = document.createElement("strong");
    title.textContent = group.toUpperCase();
    card.appendChild(title);

    list.forEach((m) => {
      const row = document.createElement("label");
      row.className = "metric-row";
      const chk = document.createElement("input");
      chk.type = "checkbox";
      chk.checked = state.selectedMetrics.has(m.id);
      chk.addEventListener("change", () => {
        if (chk.checked) state.selectedMetrics.add(m.id);
        else state.selectedMetrics.delete(m.id);
        if (state.selectedMetrics.size === METRICS.length) {
          state.mode = "composite";
          el.modeSelect.value = "composite";
        }
        renderWeights();
        renderLayerControls();
        render();
      });
      const label = document.createElement("span");
      label.textContent = m.label;
      row.append(chk, label);
      card.appendChild(row);
    });

    el.metricsContainer.appendChild(card);
  });
}

function renderPlayerSelects() {
  const players = state.sortedPlayers;
  const options = [{ id: "ALL", name: "All Players" }, ...players];
  [el.playerSelect, el.compareA, el.compareB].forEach((select) => {
    select.innerHTML = "";
    options.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = String(p.id);
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  });

  el.playerSelect.value = state.playerFocus;
  if (!state.compareA && players[0]) state.compareA = String(players[0].id);
  if (!state.compareB && players[1]) state.compareB = String(players[1].id);
  el.compareA.value = state.compareA;
  el.compareB.value = state.compareB;
}

function renderPresetSelect() {
  el.presetSelect.innerHTML = "";
  const allPresets = { ...PRESETS, ...loadUserPresets() };
  Object.keys(allPresets).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    el.presetSelect.appendChild(opt);
  });
}

function render() {
  drawPitchBackground();
  drawPlayers();
  drawBall();
  drawTimeline();
  renderReadout();
  renderHealth();

  const frame = state.frames[state.frameIndex];
  el.frameLabel.textContent = `Frame: ${frame?.frame ?? state.frameIndex}`;
  el.timeLabel.textContent = `Time: ${frame?.timestamp || toClock(state.frameIndex)}`;
  el.frameSlider.value = String(state.frameIndex);
}

function step(delta) {
  const next = Math.max(0, Math.min(state.frames.length - 1, state.frameIndex + delta));
  state.frameIndex = next;
  render();
}

function play() {
  if (state.playing) return;
  state.playing = true;
  state.playTimer = setInterval(() => {
    if (state.frameIndex >= state.frames.length - 1) {
      pause();
      return;
    }
    state.frameIndex += 1;
    render();
  }, 100);
}

function pause() {
  state.playing = false;
  if (state.playTimer) clearInterval(state.playTimer);
  state.playTimer = null;
}

function loadUserPresets() {
  try {
    return JSON.parse(localStorage.getItem("anselmoCustomPresets") || "{}");
  } catch {
    return {};
  }
}

function saveUserPresets(presets) {
  localStorage.setItem("anselmoCustomPresets", JSON.stringify(presets));
}

function extractExportRows() {
  const selected = [...state.selectedMetrics];
  const rows = [];
  for (const p of state.sortedPlayers) {
    for (let i = 0; i < state.frames.length; i += 1) {
      const row = {
        frame: state.frames[i].frame,
        timestamp: state.frames[i].timestamp,
        player_id: p.id,
        player_name: p.name,
        team_id: p.teamId,
      };
      selected.forEach((metricId) => {
        row[metricId] = state.metricData[p.id]?.[metricId]?.[i] ?? 0;
      });
      row.compositeIndex = compositeValue(p.id, i);
      rows.push(row);
    }
  }
  return rows;
}

function exportCsv() {
  const rows = extractExportRows();
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")]
    .concat(rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")))
    .join("\n");
  downloadBlob("multi_metric_export.csv", new Blob([csv], { type: "text/csv" }));
}

function exportXlsx() {
  const rows = extractExportRows();
  if (!rows.length || !window.XLSX) return;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Analytics");
  XLSX.writeFile(wb, "multi_metric_export.xlsx");
}

function exportJsonBundle() {
  const payload = {
    generatedAt: new Date().toISOString(),
    selectedMetrics: [...state.selectedMetrics],
    mode: state.mode,
    frameIndex: state.frameIndex,
    weights: state.weights,
    normalizers: state.normalizers,
    exportRows: extractExportRows(),
  };
  downloadBlob("analytics_bundle.json", new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
}

function exportPdfReport() {
  if (!window.jspdf?.jsPDF) return;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pdf.setFont("helvetica", "bold");
  pdf.text("Anselmo Match Tactical Report", 14, 16);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Generated: ${new Date().toLocaleString()}`, 14, 24);
  pdf.text(`Mode: ${state.mode}`, 14, 32);
  pdf.text(`Selected Metrics: ${[...state.selectedMetrics].join(", ")}`, 14, 40, { maxWidth: 180 });

  const topPlayers = state.sortedPlayers
    .slice()
    .sort((a, b) => compositeValue(b.id, state.frameIndex) - compositeValue(a.id, state.frameIndex))
    .slice(0, 5);

  pdf.text("Top Composite Players at Current Frame:", 14, 54);
  topPlayers.forEach((p, idx) => {
    pdf.text(`${idx + 1}. ${p.name} (${compositeValue(p.id, state.frameIndex).toFixed(3)})`, 18, 62 + idx * 8);
  });

  pdf.save("match_report.pdf");
}

function exportHeatmaps() {
  downloadBlob("pitch_heatmap.png", dataURLToBlob(el.pitchCanvas.toDataURL("image/png")));
  downloadBlob("temporal_heatmap.png", dataURLToBlob(el.timelineCanvas.toDataURL("image/png")));
}

function dataURLToBlob(dataURL) {
  const arr = dataURL.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

async function onLoadData() {
  setStatus("Loading files...", "idle");
  pause();

  try {
    const [match, trackingRaw, pitchImg] = await Promise.all([
      loadJson(el.matchPath.value.trim()),
      loadJsonl(el.trackingPath.value.trim()),
      loadPitch(el.pitchPath.value.trim()),
    ]);

    const playersById = initPlayers(match);
    const trackableMap = mapTrackableToPlayer(playersById);
    const framesNorm = normalizeFrames(trackingRaw);
    const framesWithPlayerIds = buildPlayerDataInMatchSpace(framesNorm, trackableMap);

    state.match = match;
    state.playersById = playersById;
    state.sortedPlayers = Object.values(playersById).sort((a, b) => a.name.localeCompare(b.name));
    state.frames = framesWithPlayerIds;
    state.pitchLength = Number(match.pitch_length) || 105;
    state.pitchWidth = Number(match.pitch_width) || 68;
    state.frameIndex = 0;
    state.pitchImage = pitchImg;

    setStatus("Computing derived metrics in worker...", "idle");
    state.metricData = await computeMetrics();

    buildNormalizers();
    renderMetricPanel();
    renderPlayerSelects();
    renderWeights();
    renderLayerControls();

    el.frameSlider.max = String(Math.max(0, state.frames.length - 1));
    setStatus("Ready", "ready");
    render();
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
    console.error(err);
  }
}

function bindEvents() {
  el.loadBtn.addEventListener("click", onLoadData);

  el.playBtn.addEventListener("click", play);
  el.pauseBtn.addEventListener("click", pause);
  el.stepBackBtn.addEventListener("click", () => step(-1));
  el.stepFwdBtn.addEventListener("click", () => step(1));

  el.frameSlider.addEventListener("input", () => {
    state.frameIndex = Number(el.frameSlider.value);
    render();
  });

  el.metricSearch.addEventListener("input", renderMetricPanel);
  el.selectAllMetricsBtn.addEventListener("click", () => {
    METRICS.forEach((m) => state.selectedMetrics.add(m.id));
    state.mode = "composite";
    el.modeSelect.value = "composite";
    renderMetricPanel();
    renderWeights();
    renderLayerControls();
    render();
  });
  el.clearMetricsBtn.addEventListener("click", () => {
    state.selectedMetrics.clear();
    renderMetricPanel();
    renderWeights();
    renderLayerControls();
    render();
  });

  el.modeSelect.addEventListener("change", () => {
    state.mode = el.modeSelect.value;
    render();
  });

  el.playerSelect.addEventListener("change", () => {
    state.playerFocus = el.playerSelect.value;
    render();
  });
  el.compareA.addEventListener("change", () => {
    state.compareA = el.compareA.value;
    render();
  });
  el.compareB.addEventListener("change", () => {
    state.compareB = el.compareB.value;
    render();
  });

  el.smoothWindow.addEventListener("change", () => {
    state.smoothingWindow = Math.max(1, Number(el.smoothWindow.value) || 20);
    render();
  });

  el.presetSelect.addEventListener("change", () => {
    const name = el.presetSelect.value;
    const all = { ...PRESETS, ...loadUserPresets() };
    const metrics = all[name] || [];
    state.selectedMetrics = new Set(metrics);
    renderMetricPanel();
    renderWeights();
    renderLayerControls();
    render();
  });

  el.savePresetBtn.addEventListener("click", () => {
    const name = prompt("Preset name:");
    if (!name) return;
    const all = loadUserPresets();
    all[name] = [...state.selectedMetrics];
    saveUserPresets(all);
    renderPresetSelect();
  });

  el.exportPresetBtn.addEventListener("click", () => {
    const preset = {
      selectedMetrics: [...state.selectedMetrics],
      weights: state.weights,
      mode: state.mode,
      playerFocus: state.playerFocus,
    };
    downloadBlob("metric_preset.json", new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" }));
  });

  el.exportCsvBtn.addEventListener("click", exportCsv);
  el.exportXlsxBtn.addEventListener("click", exportXlsx);
  el.exportJsonBtn.addEventListener("click", exportJsonBundle);
  el.exportPdfBtn.addEventListener("click", exportPdfReport);
  el.exportHeatmapsBtn.addEventListener("click", exportHeatmaps);
}

function init() {
  bindEvents();
  renderMetricPanel();
  renderWeights();
  renderPresetSelect();
  renderLayerControls();
  drawPitchBackground();
  drawTimeline();
}

init();
