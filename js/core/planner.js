// Planner core: the shared defaults objects, timing math, learned spoken lengths,
// the drill registry and the self-test runner.
//
// Every file under js/core, js/log and the drill folders (except *-ui.js) is
// pure: inputs in, data out, an injectable rng, no DOM, timers, speech or
// storage. So ?selftest=1 (and Node, see selftest-node.js) runs exactly the
// code the game uses. Each drill file adds its own defaults, phrases, levels,
// planner, validation, self-test and profile to OffensePlanner.
const OffensePlanner = (function () {
  "use strict";

  // ===================================================================
  // OFFENSE_DEFAULTS: every tunable offense number. This file holds the speech
  // and learning settings shared by every drill and the shared phrases; each
  // drill file adds its own section (Drive: top-level keys; Move Lab:
  // moveLab; Read the D: readTheD) and phrases. The start screen shows these
  // as defaults; saved values override them.
  // ===================================================================
  const OFFENSE_DEFAULTS = {
    // Speech rate. A window of calls is spoken at one rate: baseRate, raised
    // toward maxRate only when the planned calls would not fit otherwise.
    baseRate: 1.25,
    maxRate: 1.6,

    // Minimum silence between two calls in a window (ms).
    minGapMs: 120,

    // Speak each call this much early to offset TTS startup latency (ms).
    speechLeadMs: 0,

    // Learning spoken lengths on this device (onstart -> onend, normalized to rate 1.0).
    // Each accepted measurement moves the stored value this fraction of the way.
    learnAlpha: 0.3,
    // Measurements outside [low, high] x the current value are ignored as outliers.
    learnOutlierLow: 0.4,
    learnOutlierHigh: 2.5,

    // Phrases. display = shown on screen; spoken = sent to the voice (fix
    // pronunciation here); estMs = rough spoken length at rate 1.0.
    // Measured lengths, once learned on a device, replace estMs.
    // The call with id READ is displayed and spoken as READY: get in your stance,
    // live dribble, wait for the call. (The id stays READ so saved data keeps working.)
    // Shared by several drills; each drill file adds its own phrases.
    phrases: {
      READ:               { display: "READY",              spoken: "ready",              estMs: 350 },
      LEFT:               { display: "LEFT",               spoken: "left",               estMs: 350 },
      RIGHT:              { display: "RIGHT",              spoken: "right",              estMs: 350 },
    },
  };

  // ===================================================================
  // TRAINING_DEFAULTS: session structure, logging and progression. Each
  // feature file adds its section (session.js, levels.js, history.js, the
  // drills); levels[drill] holds a levelled drill's five levels.
  // The start screen shows these as defaults; saved values override them.
  // ===================================================================
  const TRAINING_DEFAULTS = { levels: {} };

  // ---- Timing math and helpers shared by the drills ----

  function cloneSettings(s) {
    return JSON.parse(JSON.stringify(s));
  }

  // Per-phrase spoken length at rate 1.0: learned value when present, else the estimate.
  function durationsFor(s, learned) {
    const dur = {};
    Object.keys(s.phrases).forEach(id => {
      const l = learned && learned[id];
      dur[id] = typeof l === "number" && l > 0 ? l : s.phrases[id].estMs;
    });
    return dur;
  }

  function randomInt(min, max, rng) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function sumOf(ids, map) {
    let total = 0;
    ids.forEach(id => { total += map[id]; });
    return total;
  }

  function cheapest(ids, dur) {
    let best = null;
    ids.forEach(id => {
      if (best === null || dur[id] < dur[best]) best = id;
    });
    return best;
  }

  // The single speech rate a call sequence needs inside window D, or null if it
  // cannot fit at maxRate. bufferMs is kept free at the end of the window.
  function fitRateIn(ids, D, bufferMs, s, dur) {
    const avail = D - bufferMs;
    const gaps = (ids.length - 1) * s.minGapMs;
    if (avail <= gaps) return null;
    const rate = Math.max(s.baseRate, sumOf(ids, dur) / (avail - gaps));
    return rate <= s.maxRate + 1e-9 ? rate : null;
  }

  // Smallest window in which a sequence fits at maxRate.
  function minWindowIn(ids, bufferMs, s, dur) {
    return sumOf(ids, dur) / s.maxRate + (ids.length - 1) * s.minGapMs + bufferMs;
  }

  function pickWeighted(ids, weights, rng) {
    let total = 0;
    ids.forEach(id => { total += weights[id] || 0; });
    if (!(total > 0)) return null;
    let r = rng() * total;
    for (const id of ids) {
      r -= weights[id] || 0;
      if (r < 0) return id;
    }
    // Float rounding: return the last id with a positive weight.
    for (let i = ids.length - 1; i >= 0; i--) {
      if ((weights[ids[i]] || 0) > 0) return ids[i];
    }
    return null;
  }

  // Lay out a call sequence inside D. Times are ms relative to the window's first
  // call. The last call ends exactly at D - bufferMs; the middle calls are spaced
  // evenly between the first and the last.
  function scheduleCalls(ids, D, rate, bufferMs, dur) {
    const avail = D - bufferMs;
    const calls = ids.map(id => ({ id, startMs: 0, durMs: dur[id] / rate }));
    const last = calls[calls.length - 1];
    last.startMs = avail - last.durMs;

    const middle = calls.slice(1, -1);
    let used = 0;
    middle.forEach(c => { used += c.durMs; });
    const gap = (last.startMs - calls[0].durMs - used) / (middle.length + 1);
    let t = calls[0].durMs;
    middle.forEach(c => {
      t += gap;
      c.startMs = t;
      t += c.durMs;
    });
    return calls;
  }

  function isWhole(n) {
    return Number.isInteger(n);
  }

  function isNonNegative(n) {
    return typeof n === "number" && isFinite(n) && n >= 0;
  }

  // ---- Helpers shared by the drills below ----

  const DIRECTIONS = ["LEFT", "RIGHT"];

  function randomOf(ids, rng) {
    return ids[Math.floor(rng() * ids.length)];
  }

  function isWholeNonNegative(n) {
    return isWhole(n) && n >= 0;
  }

  // Speech settings shared by every drill. Returns null or { field: "speech", message }.
  function validateSpeech(s) {
    const speech = message => ({ field: "speech", message });
    if (!(s.baseRate >= 0.5 && s.baseRate <= 2) || !(s.maxRate >= 0.5 && s.maxRate <= 2)) {
      return speech("Speech rates must be between 0.5 and 2.0.");
    }
    if (s.baseRate > s.maxRate) return speech("Base speech rate must not exceed max speech rate.");
    if (!isNonNegative(s.minGapMs)) return speech("Min gap must be 0 ms or more.");
    if (!isNonNegative(s.speechLeadMs)) return speech("Speech lead must be 0 ms or more.");
    return null;
  }

  function getSettingPath(obj, path) {
    return path.split(".").reduce((o, key) => (o == null ? undefined : o[key]), obj);
  }

  function setSettingPath(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((o, key) => o[key], obj)[last] = value;
  }

  function hasKey(obj, key) {
    return typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);
  }

  const EPS = 1e-6;

  // ---- Learned spoken lengths ----

  // One-time changes to learned spoken lengths, applied in order on load. A phrase
  // whose spoken text changed has to be learned again from its estimate.
  const LEARNED_MIGRATIONS = [
    { id: "read-to-ready", drop: ["READ"] },  // READ is now spoken "ready", not "read"
  ];

  // Apply every migration not yet in `done`. Returns { learned, done, changed };
  // the caller stores `done` so each migration runs only once.
  function migrateLearned(learned, done) {
    const next = Object.assign({}, learned);
    const applied = done.slice();
    let changed = false;
    LEARNED_MIGRATIONS.forEach(m => {
      if (applied.indexOf(m.id) !== -1) return;
      m.drop.forEach(id => { delete next[id]; });
      applied.push(m.id);
      changed = true;
    });
    return { learned: next, done: applied, changed };
  }

  // New learned length (ms at rate 1.0) after one measurement, or null to ignore it.
  function learnDuration(currentMs, measuredMs, rate, s) {
    const normalized = measuredMs * rate;
    if (!(normalized > 0) || !isFinite(normalized)) return null;
    if (normalized < currentMs * s.learnOutlierLow || normalized > currentMs * s.learnOutlierHigh) return null;
    return currentMs + (normalized - currentMs) * s.learnAlpha;
  }

  // READ -> READY: the old learned length of READ is dropped once.
  function learnedSelfTest(check) {
    const s = OFFENSE_DEFAULTS;
    const mf = [];
    if (s.phrases.READ.display !== "READY" || s.phrases.READ.spoken !== "ready") mf.push("READ is not shown/spoken as READY");
    const first = migrateLearned({ READ: 520, LEFT: 300 }, []);
    if (!first.changed || "READ" in first.learned || first.learned.LEFT !== 300 || first.done.indexOf("read-to-ready") === -1) {
      mf.push("first load");
    }
    const relearned = Object.assign({}, first.learned, { READ: 410 });
    const second = migrateLearned(relearned, first.done);
    if (second.changed || second.learned.READ !== 410 || second.done.length !== first.done.length) mf.push("ran twice");
    const empty = migrateLearned({}, []);
    if (!empty.changed || empty.done.length !== 1) mf.push("marker not set without a learned READ");
    check("migration: READY's old learned length dropped once, other phrases kept, marker stops a rerun", mf);
  }

  // ---- Drill registry ----
  // A profile bundles one drill: its phrase ids, state table, weight tables,
  // a pure planRep(settings, durations, rng, onPick, ctx), validate(settings, durations),
  // its fit table and its self-test. Phrases (and learned lengths) are shared by id.
  // ctx (optional) = { repInSet, lastMoveId } is what the runner knows about earlier reps.
  //
  // planRep returns one rep plan, the only shape the runner executes:
  //   {
  //     calls:   [{ id, atMs, durMs, rate }],  // every spoken call, ms from the rep start
  //     windows: [{ startMs, durMs }],         // countdown windows the bar draws
  //     endMs,                                 // when the rep's last window ends
  //     restMs,                                // pause after endMs before the next rep
  //     caption: { atMs, ids },                // optional: phrases shown small under the
  //                                            // call from atMs to the end of the rep
  //     moves: [moveId, …]                     // optional: moves called in this rep
  //   }
  // A future mixed drill only has to pick a profile per rep and call its planRep.
  // Each drill file calls registerDrill(profile). A profile can also have:
  //   levelled: true      the drill has five levels (TRAINING_DEFAULTS.levels[id])
  //   levelWindow(s)      the window that must never grow with the level (self-test)
  //   levelDecision(...)  its own adjustment rule (else levelDecision)
  //   repsPerSetKey       its own reps-per-set setting in TRAINING_DEFAULTS
  const PROFILES = {};
  // Ids of the drills with levels, in registration order.
  const LEVEL_DRILLS = [];
  // Self-test suites besides the drills' own, each called as suite(check, reps).
  const SUITES = [];

  function registerDrill(profile) {
    PROFILES[profile.id] = profile;
    if (profile.levelled) LEVEL_DRILLS.push(profile.id);
  }

  function registerSuite(suite) {
    SUITES.push(suite);
  }

  // ---- Runner contract ----

  // The runner contract: what every rep plan must look like for the runner to
  // execute it. Returns a list of problems (empty when the plan is valid).
  function repPlanProblems(plan, phrases) {
    const p = [];
    if (!Array.isArray(plan.calls) || plan.calls.length === 0) return ["no calls"];
    let prevEnd = -Infinity;
    plan.calls.forEach(c => {
      if (!hasKey(phrases, c.id)) p.push("unknown phrase " + c.id);
      if (!(c.atMs >= 0) || !(c.durMs > 0) || !(c.rate >= 0.5 && c.rate <= 2)) p.push(c.id + " timing");
      if (c.show !== undefined && c.show !== "caption") p.push(c.id + " show " + c.show);
      if (c.atMs < prevEnd - EPS) p.push(c.id + " overlaps the call before");
      prevEnd = c.atMs + c.durMs;
    });
    if (!(plan.endMs >= prevEnd - EPS)) p.push("endMs before the last call ends");
    if (!Array.isArray(plan.windows)) p.push("no windows");
    else plan.windows.forEach(w => {
      if (!(w.startMs >= 0) || !(w.durMs > 0) || w.startMs + w.durMs > plan.endMs + EPS) p.push("window outside the rep");
    });
    if (!(plan.restMs >= 0)) p.push("restMs");
    if (plan.cues !== undefined) {
      if (!Array.isArray(plan.cues) || !Array.isArray(plan.windows) || plan.cues.length !== plan.windows.length) p.push("cues vs windows");
      else plan.cues.forEach((c, i) => {
        if (c.atMs !== plan.windows[i].startMs || c.durMs !== plan.windows[i].durMs) p.push("cue " + i + " is not its window");
        // Two cue shapes: a Read the D decision ({ state, ids, correct }) or a
        // Read the D machine window ({ chain, terminal, driveSide }).
        const machine = Array.isArray(c.chain);
        if (machine ? c.chain.length === 0 || typeof c.terminal !== "string"
          : api.RTD_ACTIONS.indexOf(c.correct) === -1 || !Array.isArray(c.ids) || !c.state) p.push("cue " + i + " fields");
      });
    }
    return p;
  }

  // Every drill's rep plans satisfy the runner contract.
  function runnerSelfTest(check, reps) {
    const s = Object.assign(cloneSettings(OFFENSE_DEFAULTS), { training: Object.assign({}, TRAINING_DEFAULTS) });
    const dur = durationsFor(s, null);
    const f = [];
    Object.keys(PROFILES).forEach(id => {
      const ctx = { repInSet: 1, lastMoveId: null, lastState: null };
      const levels = LEVEL_DRILLS.indexOf(id) === -1 ? [null] : [1, 2, 3, 4, 5];
      levels.forEach(level => {
        const ls = level === null ? s : api.applyLevel(s, id, level, TRAINING_DEFAULTS);
        // Read the D: odd levels in practice mode.
        if (id === "readTheD") ls.readTheD.practice = level % 2;
        for (let n = 0; n < Math.min(reps, 1000); n++) {
          const plan = PROFILES[id].planRep(ls, dur, Math.random, null, ctx);
          if (plan.cues) ctx.lastState = plan.cues[0].state;
          repPlanProblems(plan, s.phrases).forEach(x => f.push(id + (level ? " L" + level : "") + ": " + x));
        }
      });
    });
    check("runner: every drill's rep plans (incl. Read the D cues) have valid calls, windows, endMs and restMs", f);
  }

  // Runs every drill's self-test, then every registered suite, then each extra
  // suite (e.g. TrainingLog.selfTest), each called as suite(check, reps).
  // Returns { passed, results, fitTable, fitTables: { drive, … } }.
  function runSelfTest(log, reps, extraSuites) {
    reps = reps || 10000;
    const results = [];
    const check = (name, failures) => {
      const ok = failures.length === 0;
      results.push({ name, ok });
      log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "  (" + failures.length + " failures, e.g. " + failures[0] + ")"));
    };

    const fitTables = {};
    Object.keys(PROFILES).forEach(id => {
      fitTables[id] = PROFILES[id].selfTest(check, reps);
    });
    SUITES.concat(extraSuites || []).forEach(suite => suite(check, reps));

    const passed = results.every(r => r.ok);
    log((passed ? "ALL PASS" : "SOME CHECKS FAILED") + " (" + results.filter(r => r.ok).length + "/" + results.length + ")");
    return { passed, results, fitTable: fitTables.drive, fitTables };
  }

  registerSuite(runnerSelfTest);
  registerSuite(learnedSelfTest);

  // Feature files add their exports to this object.
  const api = {
    OFFENSE_DEFAULTS,
    TRAINING_DEFAULTS,
    PROFILES,
    LEVEL_DRILLS,
    EPS,
    cloneSettings,
    durationsFor,
    randomInt,
    sumOf,
    cheapest,
    fitRateIn,
    minWindowIn,
    pickWeighted,
    scheduleCalls,
    isWhole,
    isNonNegative,
    isWholeNonNegative,
    validateSpeech,
    DIRECTIONS,
    randomOf,
    hasKey,
    getSettingPath,
    setSettingPath,
    migrateLearned,
    learnDuration,
    repPlanProblems,
    registerDrill,
    registerSuite,
    runSelfTest,
  };
  return api;
})();
