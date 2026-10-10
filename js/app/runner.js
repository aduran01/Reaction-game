// Offense runner: plays rep plans (any drill) in sets, the countdown bar, the
// session clock, and learning this device's spoken lengths.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const countdownEl = document.getElementById("countdown");
const countdownFill = document.getElementById("countdownFill");
const countdownText = document.getElementById("countdownText");
const captionEl = document.getElementById("caption");
const STORAGE_LEARNED = "reactionCaller.learnedMs";
const STORAGE_MIGRATIONS = "reactionCaller.migrations";

// Offense colors by meaning: side named -> that side's color.
const PHRASE_CLASS = {
  READ: "word-read",
  LEFT: "word-left", LEFT_SIDE: "word-left", LAY_UP_LEFT_SIDE: "word-left",
  RIGHT: "word-right", RIGHT_SIDE: "word-right", LAY_UP_RIGHT_SIDE: "word-right",
  CENTER_SIDE: "word-center", LAY_UP_CENTER_SIDE: "word-center",
  CUT_OFF: "word-cut",
  LAY_UP: "word-layup",
  SPRINT_FROM_LEFT_CORNER: "word-sprint", SPRINT_FROM_RIGHT_CORNER: "word-sprint",
  CATCH: "word-catch",
  SHOT: "word-shot",
  // Read the D: a color per role (momentum, distance, lead foot, hands), NOW flashes.
  D_LIVE: "word-read",
  D_NOW: "word-now",
  A_DRIVE_LEFT: "word-left", A_DRIVE_RIGHT: "word-right", A_PULL_UP: "word-shot", A_CREATE_SPACE: "word-catch",
};

// ---- Offense mode: READY -> LEFT/RIGHT -> CUT OFF / LAY UP ... -> finisher (Drive) ----

// Learned spoken lengths per phrase (ms at rate 1.0), kept in localStorage.
// One-time migrations (e.g. READ now spoken "ready") drop stale values; the
// applied migration ids are stored so each runs once.
function loadLearned() {
  let stored = null;
  let done = [];
  try {
    stored = JSON.parse(storageGet(STORAGE_LEARNED));
  } catch (e) {}
  try {
    const d = JSON.parse(storageGet(STORAGE_MIGRATIONS));
    if (Array.isArray(d)) done = d.filter(x => typeof x === "string");
  } catch (e) {}
  let learned = {};
  if (stored && typeof stored === "object") {
    Object.keys(OFFENSE_DEFAULTS.phrases).forEach(id => {
      if (typeof stored[id] === "number" && stored[id] > 0) learned[id] = stored[id];
    });
  }
  const migrated = P.migrateLearned(learned, done);
  if (migrated.changed) {
    learned = migrated.learned;
    if (stored && typeof stored === "object") storageSet(STORAGE_LEARNED, JSON.stringify(learned));
    storageSet(STORAGE_MIGRATIONS, JSON.stringify(migrated.done));
  }
  return learned;
}

let learnedMs = {};  // loaded by init() in main.js

function recordSpokenLength(id, measuredMs, rate, settings) {
  const current = learnedMs[id] || settings.phrases[id].estMs;
  const next = P.learnDuration(current, measuredMs, rate, settings);
  if (next === null) return;
  learnedMs[id] = Math.round(next);
  storageSet(STORAGE_LEARNED, JSON.stringify(learnedMs));
}

// The small line under the call, e.g. "CROSSOVER · RIGHT HAND" or a named move.
function showCaption(ids) {
  captionEl.textContent = ids.map(id => OFFENSE_DEFAULTS.phrases[id].display).join(" · ");
  captionEl.classList.remove("hidden");
}

function hideCaption() {
  captionEl.textContent = "";
  captionEl.classList.add("hidden");
}

function renderCountdown(remainingMs, totalMs) {
  countdownFill.style.transform = "scaleX(" + (totalMs > 0 ? remainingMs / totalMs : 0) + ")";
  countdownText.textContent = (remainingMs / 1000).toFixed(1) + " s";
}

// Runs rep plans from the active drill profile (see OffensePlanner.PROFILES),
// grouped into sets of settings.training.repsPerSet reps.
const offenseMode = {
  settings: null,
  profile: null,
  timers: [],
  rafId: null,
  runId: 0,
  progress: null,
  sessionStart: 0,
  clockId: null,
  warned: false,
  setStartedAt: null,  // ISO time the current set started
  repsCompleted: 0,    // reps of the current set whose endMs has passed
  repMoves: [],        // moves called in each rep of the current set (from plan.moves)
  lastMoveId: null,    // the last move called this session (so planners never repeat it)
  repCues: [],         // Read the D: each rep's cues in the current set (plan.cues)

  start(settings) {
    this.settings = settings;
    this.profile = P.PROFILES[settings.drill];
    this.runId++;
    this.progress = P.newSession();
    this.lastMoveId = null;
    countdownEl.classList.remove("hidden");
    this.startClock();
    this.beginSetClock();
    this.startRep();
  },

  beginSetClock() {
    this.setStartedAt = new Date().toISOString();
    this.repsCompleted = 0;
    this.repMoves = [];
    this.repCues = [];
  },

  // Session clock (mm:ss) and the one-time fatigue warning. Runs for the
  // whole session, including the set log and rest screens, until it ends.
  startClock() {
    const t = this.settings.training;
    this.sessionStart = performance.now();
    this.warned = false;
    sessionBanner.classList.add("hidden");
    const tick = () => {
      const elapsed = performance.now() - this.sessionStart;
      sessionClock.textContent = P.formatElapsed(elapsed);
      if (!this.warned && P.sessionWarningDue(elapsed, t)) {
        this.warned = true;
        sessionBanner.textContent = P.sessionWarningText(t);
        sessionBanner.classList.remove("hidden");
      }
    };
    tick();
    this.clockId = setInterval(tick, 250);
  },

  // Called from the "Next set" tap (speech is primed there).
  nextSet() {
    this.progress = P.beginSet(this.progress);
    this.beginSetClock();
    wordEl.textContent = " ";
    wordEl.className = "";
    this.startRep();
  },

  // The set's last rep has reached its endMs: no more reps are scheduled.
  finishSet() {
    this.repsCompleted = this.progress.rep;
    this.stopCountdown();
    countdownEl.classList.add("idle");
    speak(this.settings.training.setDoneSpoken, { rate: this.settings.baseRate, cancel: false });
    openSetLog(false);
  },

  // Stop mid-set: clear every pending call and the countdown, but keep the
  // session (and its clock) going so the partial set can be logged.
  haltSet() {
    this.runId++;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.stopCountdown();
    countdownEl.classList.add("idle");
    hideCaption();
  },

  // Every timer goes through here so Stop can clear all of them.
  later(fn, delayMs) {
    const id = setTimeout(() => {
      this.timers = this.timers.filter(t => t !== id);
      fn();
    }, Math.max(0, delayMs));
    this.timers.push(id);
  },

  say(id, rate) {
    const phrase = this.settings.phrases[id];
    const len = phrase.display.length;
    const long = len > 18 ? " long xlong" : len > 7 ? " long" : "";
    showWord(phrase.display, PHRASE_CLASS[id] + long);
    const utter = speak(phrase.spoken, { rate, cancel: false });
    if (utter) this.measure(utter, id, rate);
  },

  // Time onstart -> onend to learn this device's real spoken lengths. Missing
  // events, errors and anything cut short by Stop are simply ignored.
  measure(utter, id, rate) {
    const runId = this.runId;
    const settings = this.settings;
    let startedAt = null;
    utter.onstart = () => { startedAt = performance.now(); };
    utter.onerror = () => { startedAt = null; };
    utter.onend = () => {
      if (startedAt === null || runId !== this.runId) return;
      recordSpokenLength(id, performance.now() - startedAt, rate, settings);
    };
  },

  // Plan one rep and schedule all of it from a single clock origin.
  startRep() {
    const s = this.settings;
    this.progress = P.beginRep(this.progress);
    sessionProgress.textContent = P.progressLabel(this.progress, s.training, s.level);
    const plan = this.profile.planRep(s, s.durations, Math.random, null,
      { repInSet: this.progress.rep, lastMoveId: this.lastMoveId });
    const moves = plan.moves || [];
    this.repMoves.push(moves);
    if (moves.length) this.lastMoveId = moves[moves.length - 1];
    // Read the D: every call of the rep (plan.cues), for the review after the set.
    this.repCues.push(plan.cues || []);

    // Rep clock: t = 0 is when the first call should be heard. Every call is
    // spoken speechLeadMs before its planned time to cover TTS start-up, so the
    // first call goes out right now. Each timer is computed from this origin,
    // never chained from the previous one, so drift does not accumulate.
    const origin = performance.now() + s.speechLeadMs;
    const at = ms => origin + ms - s.speechLeadMs - performance.now();

    countdownEl.classList.add("idle");
    // The caption (e.g. the named move) stays from its atMs until the next rep.
    hideCaption();
    if (plan.caption) {
      const ids = plan.caption.ids;
      const delay = at(plan.caption.atMs);
      if (delay <= 0) showCaption(ids);
      else this.later(() => showCaption(ids), delay);
    }
    plan.calls.forEach(call => {
      const delay = at(call.atMs);
      if (delay <= 0) this.say(call.id, call.rate);
      else this.later(() => this.say(call.id, call.rate), delay);
    });

    // The countdown bar is drawn only from plan.windows.
    plan.windows.forEach(w => {
      this.later(() => this.runCountdown(origin + w.startMs, w.durMs), at(w.startMs));
    });

    // The last rep of a set ends the set at its endMs, without waiting for its rest.
    if (P.isSetComplete(this.progress, s.training)) {
      this.later(() => this.finishSet(), origin + plan.endMs - performance.now());
    } else {
      this.later(() => { this.repsCompleted++; }, origin + plan.endMs - performance.now());
      this.later(() => this.startRep(), origin + plan.endMs + plan.restMs - performance.now());
    }
  },

  // Drain the bar from durMs to 0 starting at windowStart; it then sits empty at 0.0 s.
  runCountdown(windowStart, durMs) {
    this.stopCountdown();
    countdownEl.classList.remove("idle");
    const tick = () => {
      const remaining = Math.min(durMs, Math.max(0, windowStart + durMs - performance.now()));
      renderCountdown(remaining, durMs);
      this.rafId = remaining > 0 ? requestAnimationFrame(tick) : null;
    };
    tick();
  },

  stopCountdown() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  },

  stop() {
    this.haltSet();
    if (this.clockId !== null) {
      clearInterval(this.clockId);
      this.clockId = null;
    }
    countdownEl.classList.add("hidden", "idle");
    sessionBanner.classList.add("hidden");
  },
};
