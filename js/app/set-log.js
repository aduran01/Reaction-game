// Set log and rest: the form after a set, saving the set, the rest countdown, Next set.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const logTitle = document.getElementById("logTitle");
const logLost = document.getElementById("logLost");
const logMissed = document.getElementById("logMissed");
const logNoteDetails = document.getElementById("logNoteDetails");
const logNote = document.getElementById("logNote");
const restCount = document.getElementById("restCount");
const restSummary = document.getElementById("restSummary");
const restSaved = document.getElementById("restSaved");
const restLevel = document.getElementById("restLevel");
const logCleanRow = document.getElementById("logCleanRow");
const logClean = document.getElementById("logClean");
const logReview = document.getElementById("logReview");
const restReads = document.getElementById("restReads");
const restMissed = document.getElementById("restMissed");

// ---- Set log ----

let trainingLog = TrainingLog.openLog(logStore);
let session = null;     // current Offense session { id, startedAt, endedAt, sets }
let pendingSet = null;  // the set shown in the log form (without its outcome fields)
let selectedQuality = null;
let lastSaveOk = true;
let restTimerId = null;

function selectQuality(quality) {
  selectedQuality = quality;
  qualityButtons.forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.quality === quality)));
}

// Show the log form for the set that just ended (partial: after Stop mid-set).
function openSetLog(partial) {
  const s = offenseMode.settings;
  const p = offenseMode.progress;
  const reps = offenseMode.repsCompleted;
  const moveLab = s.drill === "moveLab";
  const readTheD = s.drill === "readTheD";
  // Only finished reps are reviewed (the rep in progress at Stop doesn't count).
  const reads = readTheD ? readsOf(offenseMode.repCues.slice(0, reps)) : [];
  pendingSet = {
    drill: s.drill,
    level: s.level,
    reps,
    startedAt: offenseMode.setStartedAt,
    endedAt: new Date().toISOString(),
    settingsSnapshot: TrainingLog.snapshotSettings(s),
    extra: moveLab ? { moveIds: s.moveLab.moveIds.slice(), cleanReps: null }
      : readTheD ? { reads: reads.map(r => Object.assign({}, r, { ok: null, missedCall: null })) } : {},
  };
  reviewItems = reads.map(read => ({ read, wrong: false, missedCall: null }));
  logReview.classList.toggle("hidden", !readTheD);
  renderReview();
  logDrill.textContent = DRILLS[s.drill].label;
  logTitle.textContent = partial
    ? "Partial set " + p.set + " · " + reps + " of " + s.training.repsPerSet + " reps"
    : "Set " + p.set + " · " + reps + (reps === 1 ? " rep" : " reps");
  // Move Lab adds clean reps (every move in the rep clean).
  logCleanRow.classList.toggle("hidden", !moveLab);
  logClean.max = String(reps);
  logClean.value = 0;
  logAttempted.value = reps;
  logMade.max = String(reps);
  logMade.value = 0;
  logLost.value = 0;
  logMissed.value = 0;
  selectQuality(null);
  logNote.value = "";
  logNoteDetails.open = false;
  logError.textContent = "";
  discardBtn.classList.toggle("hidden", !partial);
  gameScreen.classList.add("hidden");
  logScreen.classList.remove("hidden");
  window.scrollTo(0, 0);
}

function readLoggedSet() {
  const note = logNote.value.trim();
  const set = Object.assign({}, pendingSet, {
    made: parseNumber(logMade.value),
    attempted: parseNumber(logAttempted.value),
    lostHandles: parseNumber(logLost.value),
    missedCalls: parseNumber(logMissed.value),
    quality: selectedQuality,
    note: note === "" ? null : note,
  });
  if (set.drill === "moveLab") set.extra = Object.assign({}, set.extra, { cleanReps: parseNumber(logClean.value) });
  if (set.drill === "readTheD") set.extra = Object.assign({}, set.extra, { reads: reviewedReads() });
  return set;
}

function skippedSet() {
  return Object.assign({}, pendingSet, {
    made: null, attempted: null, lostHandles: null, missedCalls: null, quality: null, note: null,
  });
}

function persistSession() {
  saveTrainingLog(TrainingLog.upsertSession(trainingLog.log, session));
}

// Replace the in-memory log and save it. Returns whether it was stored.
function saveTrainingLog(log) {
  trainingLog = Object.assign({}, trainingLog, { log });
  const result = TrainingLog.saveLog(trainingLog, logStore, Date.now());
  trainingLog = result.state;
  lastSaveOk = result.saved;
  return result.saved;
}

// Validate, add the set to the session and save the whole log right away, so
// nothing is lost if the tab closes. Returns false (and shows why) if invalid.
function commitSet(set) {
  const error = TrainingLog.validateSet(set);
  if (error) {
    logError.textContent = error.message;
    return false;
  }
  session.sets.push(set);
  session.endedAt = set.endedAt;
  persistSession();
  pendingSet = null;
  lastReadLines = set.drill === "readTheD"
    ? P.readsFeedback(P.scoreReads(set.extra.reads), OFFENSE_DEFAULTS.phrases, READS) : null;
  adjustLevel(set);
  return true;
}

function percent(x) {
  return Math.round(x * 100) + "%";
}

function sessionSummaryText() {
  const sum = TrainingLog.summarizeSession(session);
  const parts = [sum.sets + (sum.sets === 1 ? " set" : " sets")];
  if (sum.readsPct !== null) parts.push(sum.readsRight + "/" + sum.reads + " reads right");
  if (sum.makePct !== null) parts.push(sum.made + "/" + sum.attempted + " made (" + percent(sum.makePct) + ")");
  if (sum.errorsPerRep !== null) parts.push(sum.errorsPerRep.toFixed(2) + " errors per rep");
  if (sum.cleanShare !== null) parts.push(sum.cleanSets + " of " + sum.ratedSets + " rated sets clean");
  return "This session: " + parts.join(" · ");
}

// Rest countdown, then the Next set button.
function showRest() {
  const restMs = offenseMode.settings.training.restSec * 1000;
  const endsAt = performance.now() + restMs;
  restSummary.textContent = sessionSummaryText();
  restSaved.textContent = lastSaveOk ? "Set saved." : "Couldn't save to this device. Storage may be blocked or full.";
  // Read the D: one line for reads right, one for the most-missed call and its read.
  const lines = lastReadLines || [null, null];
  restReads.textContent = lines[0] || "";
  restReads.classList.toggle("hidden", !lines[0]);
  restMissed.textContent = lines[1] || "";
  restMissed.classList.toggle("hidden", !lines[1]);
  restLevel.textContent = lastLevelMessage || "";
  restLevel.classList.toggle("hidden", !lastLevelMessage);
  nextSetBtn.classList.add("hidden");
  logScreen.classList.add("hidden");
  restScreen.classList.remove("hidden");
  const tick = () => {
    const left = Math.max(0, endsAt - performance.now());
    restCount.textContent = P.formatElapsed(Math.ceil(left / 1000) * 1000);
    if (left <= 0) {
      stopRest();
      nextSetBtn.classList.remove("hidden");
    }
  };
  tick();
  if (restMs > 0) restTimerId = setInterval(tick, 250);
}

function stopRest() {
  if (restTimerId !== null) {
    clearInterval(restTimerId);
    restTimerId = null;
  }
}

function saveAndRest() {
  if (commitSet(readLoggedSet())) showRest();
}

function saveAndEnd() {
  if (commitSet(readLoggedSet())) stopGame();
}

function skipLogging() {
  if (commitSet(skippedSet())) showRest();
}

// A fresh tap, so speech is primed again before the set's first call.
function startNextSet() {
  if (activeMode !== offenseMode) return;
  primeSpeech();
  stopRest();
  applyCurrentLevel();
  restScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  offenseMode.nextSet();
}
