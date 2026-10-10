// Offense settings form: fields by settings path, weight tables, − / + steppers,
// on / off toggles, and saving / loading every field.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const flagButtons = document.querySelectorAll("button[data-flag-for]");
const STORAGE_SETTINGS = "reactionCaller.settings";

const WEIGHT_TABLE_TITLES = {
  startWeights: "Start weights (after READY)",
  afterDriveOrCutOffWeights: "Weights after LEFT / RIGHT / CUT OFF",
  afterLayUpWeights: "Weights after LAY UP",
};

// ---- Offense settings form ----

// Settings are addressed by dotted paths into OFFENSE_DEFAULTS, e.g. "moveLab.moveGapMinMs".
function getPath(obj, path) {
  return path.split(".").reduce((o, key) => (o == null ? undefined : o[key]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, key) => o[key], obj)[last] = value;
}

function makeNumberField(inputId, labelText, attrs) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.htmlFor = inputId;
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.id = inputId;
  input.min = attrs.min;
  input.step = attrs.step;
  Object.assign(input.dataset, attrs.data);
  field.append(label, input);
  return field;
}

function makeSection(titleText, fields) {
  const section = document.createElement("div");
  const title = document.createElement("p");
  title.className = "weight-title";
  title.textContent = titleText;
  const grid = document.createElement("div");
  grid.className = "field-grid";
  fields.forEach(f => grid.appendChild(f));
  section.append(title, grid);
  return section;
}

// Weight inputs for one drill. prefix is "" for Drive (so its input ids and
// saved keys stay as before) and "moveLab." for Move Lab.
function buildWeightTables(container, tables, prefix, titles) {
  tables.forEach(table => {
    const tablePath = prefix + table;
    const fields = Object.keys(getPath(OFFENSE_DEFAULTS, tablePath)).map(id => {
      const inputId = "w-" + tablePath.replace(/\./g, "-") + "-" + id;
      const labelText = prefix && SHORT_LABELS[id] ? SHORT_LABELS[id] : OFFENSE_DEFAULTS.phrases[id].display;
      return makeNumberField(inputId, labelText, {
        min: "0", step: "1", data: { weightTable: tablePath, weightId: id },
      });
    });
    container.appendChild(makeSection(titles[table], fields));
  });
}

function settingInputs() {
  return offensePanel.querySelectorAll("input[data-setting]");
}

function weightInputs() {
  return offensePanel.querySelectorAll("input[data-weight-table]");
}

// Session inputs: data-training keys into TRAINING_DEFAULTS.
function trainingInputs() {
  return offensePanel.querySelectorAll("input[data-training]");
}

function fillOffenseDefaults() {
  settingInputs().forEach(input => { input.value = getPath(OFFENSE_DEFAULTS, input.dataset.setting); });
  weightInputs().forEach(input => {
    input.value = getPath(OFFENSE_DEFAULTS, input.dataset.weightTable)[input.dataset.weightId];
  });
  trainingInputs().forEach(input => { input.value = P.TRAINING_DEFAULTS[input.dataset.training]; });
}

function readTrainingSettings() {
  const t = Object.assign({}, P.TRAINING_DEFAULTS);
  trainingInputs().forEach(input => { t[input.dataset.training] = parseNumber(input.value); });
  return t;
}

// − / + buttons inside root: step the input by its step, clamped to its
// min/max, then fire "input" so the change is handled like typing. An empty
// field steps from its default (Session fields) or from 0.
function wireSteppers(root) {
  root.querySelectorAll(".stepper").forEach(stepper => {
    const input = stepper.querySelector("input");
    stepper.querySelectorAll("button[data-step]").forEach(btn => btn.addEventListener("click", () => {
      const step = Number(input.step) || 1;
      const min = input.min === "" ? -Infinity : Number(input.min);
      const max = input.max === "" ? Infinity : Number(input.max);
      const current = parseNumber(input.value);
      const base = !isNaN(current) ? current
        : input.dataset.training ? P.TRAINING_DEFAULTS[input.dataset.training] : 0;
      input.value = Math.min(max, Math.max(min, base + Number(btn.dataset.step) * step));
      input.dispatchEvent(new Event("input"));
    }));
  });
}

// The manual settings (fields shown "set by Level N" contribute their manual
// value; startGame applies the level on top).
function readOffenseSettings() {
  const s = P.cloneSettings(OFFENSE_DEFAULTS);
  settingInputs().forEach(input => { setPath(s, input.dataset.setting, parseNumber(manualValue(input))); });
  weightInputs().forEach(input => {
    getPath(s, input.dataset.weightTable)[input.dataset.weightId] = parseNumber(manualValue(input));
  });
  s.drill = selectedDrill;
  s.moveLab.moveIds = moveLabChoice.moveIds.slice();
  s.training = P.sessionForDrill(readTrainingSettings(), selectedDrill);
  return s;
}

// ---- On / off settings: a toggle button drives a hidden 0 / 1 input ----

function flagInput(btn) {
  return document.getElementById(btn.dataset.flagFor);
}

// Show each toggle's value; a level-locked one is shown but can't be tapped.
function renderFlags() {
  flagButtons.forEach(btn => {
    const input = flagInput(btn);
    const on = input.value === "1";
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "On" : "Off";
    btn.disabled = input.readOnly;
    btn.classList.toggle("level-locked", input.readOnly);
  });
}

function wireFlags() {
  flagButtons.forEach(btn => btn.addEventListener("click", () => {
    const input = flagInput(btn);
    if (input.readOnly) return;
    input.value = input.value === "1" ? "0" : "1";
    input.dispatchEvent(new Event("input"));
    renderFlags();
  }));
}

// ---- Persistence: mode, drill, Defense's Min/Max fields and offense settings only ----
// Values are saved by input id, so settings saved before a field existed
// simply keep that field's default.

function persistedInputs() {
  return [minMsInput, maxMsInput].concat(
    Array.from(settingInputs()), Array.from(weightInputs()), Array.from(trainingInputs()));
}

function saveSettings() {
  const values = {};
  persistedInputs().forEach(input => { values[input.id] = manualValue(input); });
  storageSet(STORAGE_SETTINGS, JSON.stringify(values));
}

function loadSettings() {
  let values = null;
  try {
    values = JSON.parse(storageGet(STORAGE_SETTINGS));
  } catch (e) {}
  if (!values || typeof values !== "object") return;
  persistedInputs().forEach(input => {
    if (typeof values[input.id] === "string") input.value = values[input.id];
  });
}
