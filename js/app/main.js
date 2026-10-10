// Main: modes, the start screen view, Start / Stop, and wiring every control.
// Loaded last; init() runs unless the page is the ?selftest=1 page.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const subtitleEl = document.getElementById("subtitle");
const modeLabel = document.getElementById("modeLabel");
const modeButtons = document.querySelectorAll(".segmented button[data-mode]");
const drillButtons = document.querySelectorAll(".segmented button[data-drill]");
const rangePanel = document.getElementById("rangePanel");
const driveSettings = document.getElementById("driveSettings");
const driveError = document.getElementById("driveError");
const advancedEl = document.getElementById("advanced");
const advancedError = document.getElementById("advancedError");
const weightTablesEl = document.getElementById("weightTables");
const speechEl = document.getElementById("speech");
const speechError = document.getElementById("speechError");
const sessionError = document.getElementById("sessionError");
const saveRestBtn = document.getElementById("saveRestBtn");
const saveEndBtn = document.getElementById("saveEndBtn");
const skipLogBtn = document.getElementById("skipLogBtn");
const restDrill = document.getElementById("restDrill");
const endSessionBtn = document.getElementById("endSessionBtn");
const historyBtn = document.getElementById("historyBtn");
const summaryDoneBtn = document.getElementById("summaryDoneBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const importBtn = document.getElementById("importBtn");
const showTextBtn = document.getElementById("showTextBtn");
const copyTextBtn = document.getElementById("copyTextBtn");
const importTextBtn = document.getElementById("importTextBtn");
const importReplaceBtn = document.getElementById("importReplaceBtn");
const importKeepBtn = document.getElementById("importKeepBtn");
const historyBackBtn = document.getElementById("historyBackBtn");
const levelStatus = document.getElementById("levelStatus");
const resetLevelButtons = document.querySelectorAll("button[data-reset-level]");
const levelSettings = document.getElementById("levelSettings");
const moveLabSettings = document.getElementById("moveLabSettings");
const moveLabWeightTablesEl = document.getElementById("moveLabWeightTables");
const moveLabRepsField = document.getElementById("moveLabRepsField");
const repsPerSetField = document.getElementById("repsPerSetField");
const readTheDSettings = document.getElementById("readTheDSettings");
const readTheDError = document.getElementById("readTheDError");
const readTheDChances = document.getElementById("readTheDChances");
const readTheDCaps = document.getElementById("readTheDCaps");
const reviewAllBtn = document.getElementById("reviewAllBtn");
const STORAGE_MODE = "reactionCaller.mode";
const STORAGE_DRILL = "reactionCaller.offenseDrill";

// Where each validation error is shown (and which <details> to open for it).
const ERROR_TARGETS = {
  drive: { el: driveError },
  advanced: { el: advancedError, details: advancedEl },
  speech: { el: speechError, details: speechEl },
  moveLab: { el: moveLabError },
  readTheD: { el: readTheDError, details: [readTheDChances, readTheDCaps] },
  session: { el: sessionError },
};
let selectedMode = "defense";
let selectedDrill = "drive";
let activeMode = null;

// ---- Modes ----

const MODES = {
  defense: {
    mode: defenseMode,
    label: "DEFENSE",
    subtitle: "A voice randomly calls Left, Right, Up, or Back. React fast.",
  },
  offense: {
    mode: offenseMode,
    // Label and subtitle come from DRILLS.
  },
};

function clearErrors() {
  rangeError.textContent = "";
  Object.keys(ERROR_TARGETS).forEach(key => { ERROR_TARGETS[key].el.textContent = ""; });
}

function showError(error) {
  const target = ERROR_TARGETS[error.field];
  [].concat(target.details || []).forEach(d => { d.open = true; });
  target.el.textContent = error.message;
}

// Show the panels, labels and subtitle for the selected mode and drill.
function updateView() {
  const offense = selectedMode === "offense";
  const moveLab = selectedDrill === "moveLab";
  const info = MODES[selectedMode];
  modeButtons.forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.mode === selectedMode)));
  drillButtons.forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.drill === selectedDrill)));
  subtitleEl.textContent = offense ? DRILLS[selectedDrill].subtitle : info.subtitle;
  offensePanel.classList.toggle("hidden", !offense);
  // The Min/Max delay fields are Defense only (Drive has its own read time fields).
  rangePanel.classList.toggle("hidden", offense);
  driveSettings.classList.toggle("hidden", selectedDrill !== "drive");
  readTheDSettings.classList.toggle("hidden", selectedDrill !== "readTheD");
  moveLabSettings.classList.toggle("hidden", !moveLab);
  // Move Lab has no levels, and its own reps per set.
  levelSettings.classList.toggle("hidden", moveLab);
  moveLabRepsField.classList.toggle("hidden", !moveLab);
  repsPerSetField.classList.toggle("hidden", moveLab);
  clearErrors();
}

function selectMode(name) {
  selectedMode = has(MODES, name) ? name : "defense";
  updateView();
}

function selectDrill(name) {
  selectedDrill = has(DRILLS, name) ? name : "drive";
  updateView();
}

function startGame() {
  clearErrors();
  const usesRange = selectedMode === "defense";
  const range = usesRange ? validateRange() : null;
  if (usesRange && !range) return;

  let settings = range;
  if (selectedMode === "offense") {
    runBaseSettings = readOffenseSettings();
    const levelled = autoLevel && LEVEL_DRILLS.indexOf(selectedDrill) !== -1;
    settings = levelled
      ? P.applyLevel(runBaseSettings, selectedDrill, levels[selectedDrill], TD)
      : P.cloneSettings(runBaseSettings);
    settings.level = levelled ? levels[selectedDrill] : null;
    // Spoken lengths are fixed for the whole run (the ones validated here);
    // anything learned during the run takes effect on the next Start.
    settings.durations = P.durationsFor(settings, learnedMs);
    const error = P.PROFILES[settings.drill].validate(settings, settings.durations) ||
      P.validateSession(settings.training);
    if (error) {
      showError(error);
      return;
    }
  }

  primeSpeech();

  const offense = selectedMode === "offense";
  startScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  modeLabel.textContent = offense ? DRILLS[selectedDrill].label : MODES[selectedMode].label;
  logDrill.textContent = modeLabel.textContent;
  restDrill.textContent = modeLabel.textContent;
  sessionClock.classList.toggle("hidden", !offense);
  sessionProgress.classList.toggle("hidden", !offense);
  sessionBanner.classList.add("hidden");
  wordEl.textContent = " ";
  wordEl.className = "";
  hideCaption();

  if (offense) {
    session = {
      id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      startedAt: new Date().toISOString(),
      endedAt: null,
      sets: [],
    };
  }

  activeMode = MODES[selectedMode].mode;
  activeMode.start(settings);
}

// Ends the session (Defense Stop, End session, Discard). Offense sessions
// with saved sets get their end time written to the log.
function stopGame() {
  if (activeMode) {
    activeMode.stop();
    activeMode = null;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  stopRest();
  const ended = session && session.sets.length > 0 ? session : null;
  if (ended) {
    ended.endedAt = new Date().toISOString();
    persistSession();
  }
  session = null;
  pendingSet = null;

  if (ended) showSummary(ended);
  else showStart();
}

function hideAllScreens() {
  [startScreen, gameScreen, logScreen, restScreen, summaryScreen, historyScreen].forEach(el => el.classList.add("hidden"));
}

function showStart() {
  hideAllScreens();
  updateBackupReminder();
  updateLevelView();
  renderMoveLab();
  levelStatus.textContent = "";
  startScreen.classList.remove("hidden");
}

// Stop button. Mid-set in Offense with at least one finished rep, the set is
// halted and its log form shown for the partial set; otherwise the session ends.
function stopPressed() {
  if (activeMode === offenseMode && offenseMode.repsCompleted > 0) {
    offenseMode.haltSet();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    openSetLog(true);
    return;
  }
  stopGame();
}

// Build the forms, load saved values and wire every control.
function init() {
  learnedMs = loadLearned();
  buildWeightTables(weightTablesEl, P.WEIGHT_TABLES, "", WEIGHT_TABLE_TITLES);
  buildGetSetFields();
  buildWeightTables(moveLabWeightTablesEl, ["afterMoveWeights"], "moveLab.", MOVE_LAB_WEIGHT_TABLE_TITLES);
  buildWeightTables(readTheDWeightTablesEl, P.PROFILES.readTheD.weightTables, "readTheD.", READ_THE_D_WEIGHT_TABLE_TITLES);
  buildMovePicker();
  renderMoveLab();
  fillOffenseDefaults();
  loadSettings();
  persistedInputs().forEach(input => input.addEventListener("input", saveSettings));
  updateLevelView();
  autoLevelBtn.addEventListener("click", () => {
    autoLevel = !autoLevel;
    storageSet(STORAGE_AUTO_LEVEL, autoLevel ? "on" : "off");
    updateLevelView();
    levelStatus.textContent = autoLevel ? "Auto difficulty on: your level sets the timing." : "Auto difficulty off: your own settings apply.";
  });
  resetLevelButtons.forEach(btn => btn.addEventListener("click", () => {
    const drill = btn.dataset.resetLevel;
    levels[drill] = TD.startLevel;
    saveLevels();
    updateLevelView();
    levelStatus.textContent = DRILL_NAMES[drill] + " reset to Level " + TD.startLevel + ".";
  }));
  wireSteppers(offensePanel);
  wireSteppers(logScreen);
  // Made can never exceed attempted: lowering attempted pulls made down with it.
  logAttempted.addEventListener("input", () => {
    const attempted = parseNumber(logAttempted.value);
    if (Number.isInteger(attempted) && attempted >= 0) {
      logMade.max = String(attempted);
      if (parseNumber(logMade.value) > attempted) logMade.value = attempted;
    }
  });
  reviewAllBtn.addEventListener("click", markAllReadsRight);
  qualityButtons.forEach(btn => btn.addEventListener("click", () => {
    selectQuality(selectedQuality === btn.dataset.quality ? null : btn.dataset.quality);
  }));

  modeButtons.forEach(btn => btn.addEventListener("click", () => {
    selectMode(btn.dataset.mode);
    storageSet(STORAGE_MODE, selectedMode);
  }));
  drillButtons.forEach(btn => btn.addEventListener("click", () => {
    selectDrill(btn.dataset.drill);
    storageSet(STORAGE_DRILL, selectedDrill);
  }));
  const savedDrill = storageGet(STORAGE_DRILL);
  selectedDrill = has(DRILLS, savedDrill) ? savedDrill : "drive";
  selectMode(storageGet(STORAGE_MODE));

  startBtn.addEventListener("click", startGame);
  stopBtn.addEventListener("click", stopPressed);
  saveRestBtn.addEventListener("click", saveAndRest);
  saveEndBtn.addEventListener("click", saveAndEnd);
  skipLogBtn.addEventListener("click", skipLogging);
  discardBtn.addEventListener("click", stopGame);
  nextSetBtn.addEventListener("click", startNextSet);
  endSessionBtn.addEventListener("click", stopGame);
  summaryDoneBtn.addEventListener("click", showStart);
  historyBtn.addEventListener("click", openHistory);
  historyBackBtn.addEventListener("click", showStart);
  exportJsonBtn.addEventListener("click", exportJson);
  exportCsvBtn.addEventListener("click", exportCsv);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", importChosenFile);
  showTextBtn.addEventListener("click", () => {
    showBackupText(logJson(), "Copy this text and keep it somewhere safe, or paste a backup here and tap Import this text.", true);
  });
  copyTextBtn.addEventListener("click", copyBackupText);
  backupText.addEventListener("input", () => { backupTextIsLog = false; });
  importTextBtn.addEventListener("click", () => importText(backupText.value));
  importReplaceBtn.addEventListener("click", () => applyImport(true));
  importKeepBtn.addEventListener("click", () => applyImport(false));
  updateBackupReminder();
}

// ?selftest=1 runs the simulation (js/selftest-page.js) instead of the app.
if (new URLSearchParams(window.location.search).get("selftest") !== "1") init();
