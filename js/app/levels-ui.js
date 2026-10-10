// Adaptive difficulty in the app: stored levels, Auto difficulty, fields locked
// by a level, and moving the level after a logged set.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const STORAGE_LEVELS = "reactionCaller.levels";

// ---- Adaptive difficulty: levels and Auto difficulty ----

const LEVEL_DRILLS = P.LEVEL_DRILLS;  // drills with levels (not Move Lab)

function loadLevels() {
  let stored = null;
  try {
    stored = JSON.parse(storageGet(STORAGE_LEVELS));
  } catch (e) {}
  return P.normalizeLevels(stored, TD);
}

let levels = loadLevels();
let autoLevel = storageGet(STORAGE_AUTO_LEVEL) !== "off";
let lastLevelMessage = null;  // shown on the rest screen after a set is saved
let runBaseSettings = null;   // the manual settings of the running session (levels apply on top)

function saveLevels() {
  storageSet(STORAGE_LEVELS, JSON.stringify(levels));
}

// A field's own value, even while it shows a level's value.
function manualValue(input) {
  return input.dataset.levelLocked ? input.dataset.manualValue : input.value;
}

function inputPath(input) {
  if (input.dataset.setting) return input.dataset.setting;
  return input.dataset.weightTable ? input.dataset.weightTable + "." + input.dataset.weightId : null;
}

function lockInput(input, drill, path) {
  const level = levels[drill];
  if (!input.dataset.levelLocked) {
    input.dataset.manualValue = input.value;
    input.dataset.levelLocked = "1";
    input.readOnly = true;
    input.classList.add("level-locked");
  }
  input.value = TD.levels[drill][level - 1][path];
  const label = input.closest(".field").querySelector("label");
  let note = label.querySelector(".level-note");
  if (!note) {
    note = el("span", "level-note");
    label.appendChild(note);
  }
  note.textContent = "set by Level " + level;
}

function unlockInput(input) {
  if (!input.dataset.levelLocked) return;
  input.value = input.dataset.manualValue;
  delete input.dataset.levelLocked;
  delete input.dataset.manualValue;
  input.readOnly = false;
  input.classList.remove("level-locked");
  const note = input.closest(".field").querySelector(".level-note");
  if (note) note.remove();
}

// Show the levels, the toggle, and lock (Auto on) or unlock the fields the levels control.
function updateLevelView() {
  autoLevelBtn.setAttribute("aria-pressed", String(autoLevel));
  autoLevelBtn.textContent = autoLevel ? "On" : "Off";
  LEVEL_DRILLS.forEach(drill => {
    document.getElementById("levelText-" + drill).textContent =
      DRILL_NAMES[drill] + ": Level " + levels[drill] + (autoLevel ? "" : " (auto off)");
  });
  const owner = {};
  LEVEL_DRILLS.forEach(drill => P.levelPaths(drill, TD).forEach(path => { owner[path] = drill; }));
  Array.from(settingInputs()).concat(Array.from(weightInputs())).forEach(input => {
    const path = inputPath(input);
    if (!owner[path]) return;
    if (autoLevel) lockInput(input, owner[path], path);
    else unlockInput(input);
  });
}

// Auto difficulty: apply the adjustment rule to the set just logged; the new
// level is stored and used from the next set.
function adjustLevel(set) {
  lastLevelMessage = null;
  if (set.level === null) return;
  const decision = P.levelDecisionFor(set.drill, set.level, set, TD);
  levels[set.drill] = decision.level;
  saveLevels();
  lastLevelMessage = P.levelMessage(set.level, decision, TD);
}

// Auto difficulty: plan the next set at the drill's current level. Spoken
// lengths stay the ones validated at Start. If the level's settings don't
// validate with them, the previous settings are kept.
function applyCurrentLevel() {
  const current = offenseMode.settings;
  if (current.level === null) return;
  const level = levels[current.drill];
  if (level === current.level) return;
  const next = P.applyLevel(runBaseSettings, current.drill, level, TD);
  next.level = level;
  next.drill = current.drill;
  next.training = current.training;
  next.durations = current.durations;
  if (!P.PROFILES[next.drill].validate(next, next.durations)) offenseMode.settings = next;
}
