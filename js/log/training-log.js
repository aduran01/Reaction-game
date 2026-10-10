// Training log: set-level outcomes saved after every Offense set. Pure functions
// only. openLog / saveLog never touch localStorage themselves: they take an
// injected store { get(key) -> string | null, set(key, value) }, so the self-test
// can run them against a fake store.
//
// Stored under reactionCaller.log as
//   { version: 1, sessions: [ { id, startedAt, endedAt, sets: [ set, … ] } ] }
// set = { drill, level, reps, startedAt, endedAt, made, attempted, lostHandles,
//         missedCalls, quality, note, settingsSnapshot, extra }
// A log that fails to parse, or has a newer or unknown version, is never
// overwritten: its raw text is copied to a backup key before a new log is saved.
//
// Pure (see js/core/planner.js). Comparisons, trends, import / merge and CSV
// are in history.js, which adds them to TrainingLog.
const TrainingLog = (function () {
  "use strict";

  const LOG_VERSION = 1;
  const LOG_KEY = "reactionCaller.log";
  const BACKUP_PREFIX = LOG_KEY + ".backup.";
  // "shooters" (the removed Shooters only drill) stays valid so its logged sets keep loading.
  const DRILLS = ["drive", "shooters", "moveLab", "readTheD"];
  // Move Lab sides (extra.side), in sets logged before the redesign.
  const SIDES = ["left", "right", "alternate"];
  // "How did the set feel?" One of these, or null (not rated).
  const QUALITIES = ["clean", "rushed", "off_balance"];
  const NOTE_MAX = 500;

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function emptyLog() {
    return { version: LOG_VERSION, sessions: [] };
  }

  function isCount(n) {
    return Number.isInteger(n) && n >= 0;
  }

  function isPlainObject(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
  }

  // Set check. Returns null, or { field, message }. Outcome fields may all be
  // null (Skip logging); made and attempted are both null or both counts.
  function validateSet(set) {
    const bad = (field, message) => ({ field, message });
    if (!isPlainObject(set)) return bad("set", "A set must be an object.");
    if (DRILLS.indexOf(set.drill) === -1) return bad("drill", "Unknown drill.");
    if (set.level !== null && !isCount(set.level)) return bad("level", "Level must be empty or a whole number.");
    if (!Number.isInteger(set.reps) || set.reps < 1) return bad("reps", "A set needs at least 1 rep.");
    if (typeof set.startedAt !== "string" || typeof set.endedAt !== "string") {
      return bad("time", "Start and end times are missing.");
    }
    const counts = [
      ["made", "Shots made"], ["attempted", "Shots attempted"],
      ["lostHandles", "Lost handles"], ["missedCalls", "Missed or late calls"],
    ];
    for (const c of counts) {
      if (set[c[0]] !== null && !isCount(set[c[0]])) return bad(c[0], c[1] + " must be a whole number of 0 or more.");
    }
    if ((set.made === null) !== (set.attempted === null)) {
      return bad("made", "Enter both shots made and shots attempted, or neither.");
    }
    if (set.made !== null && set.made > set.attempted) {
      return bad("made", "Shots made can't be more than shots attempted.");
    }
    if (set.quality !== null && QUALITIES.indexOf(set.quality) === -1) return bad("quality", "Unknown set rating.");
    if (set.note !== null && (typeof set.note !== "string" || set.note.length > NOTE_MAX)) {
      return bad("note", "The note can be at most " + NOTE_MAX + " characters.");
    }
    if (!isPlainObject(set.settingsSnapshot)) return bad("settingsSnapshot", "Settings snapshot is missing.");
    if (!isPlainObject(set.extra)) return bad("extra", "extra must be an object.");
    if (set.drill === "moveLab") {
      const x = set.extra;
      const isId = id => typeof id === "string" && id !== "";
      if (x.moveIds !== undefined) {
        if (!Array.isArray(x.moveIds) || x.moveIds.length === 0 || !x.moveIds.every(isId)) {
          return bad("extra", "A Move Lab set needs its moves.");
        }
      } else {
        // Sets logged before the redesign: one move on one side.
        if (!isId(x.moveId)) return bad("extra", "A Move Lab set needs its move.");
        if (SIDES.indexOf(x.side) === -1) return bad("extra", "A Move Lab set needs its side.");
      }
      if (x.cleanReps !== null && (!isCount(x.cleanReps) || x.cleanReps > set.reps)) {
        return bad("cleanReps", "Clean reps must be a whole number from 0 to the reps in the set.");
      }
    }
    if (set.drill === "readTheD") {
      // extra.reads (one per rep, since the rewrite) or extra.decisions (the first Read the D).
      if (set.extra.reads !== undefined) return validateReads(set.extra.reads, set.reps);
      return validateOldDecisions(set.extra.decisions, set.reps);
    }
    return null;
  }

  // Read the D reps: { rep, chain, terminal, driveSide, ok, missedCall }; ok true,
  // false or null (not reviewed), missedCall null or a call of that rep's chain.
  function validateReads(reads, reps) {
    const bad = message => ({ field: "extra", message });
    if (!Array.isArray(reads)) return bad("A Read the D set needs its reps.");
    for (const r of reads) {
      if (!isPlainObject(r) || !Number.isInteger(r.rep) || r.rep < 1 || r.rep > reps ||
          !Array.isArray(r.chain) || r.chain.length === 0 || !r.chain.every(id => typeof id === "string") ||
          typeof r.terminal !== "string" || [null, "left", "right"].indexOf(r.driveSide) === -1) {
        return bad("A Read the D rep is missing its calls.");
      }
      if ([true, false, null].indexOf(r.ok) === -1) return bad("A Read the D rep must be read right, misread or not reviewed.");
      if (r.missedCall !== null && (r.ok !== false || r.chain.indexOf(r.missedCall) === -1)) {
        return bad("The misread call of rep " + r.rep + " must be one of its calls.");
      }
    }
    return null;
  }

  // Sets of the first Read the D (before the rewrite): one entry per decision.
  const OLD_RTD_ACTIONS = ["DRIVE_LEFT", "DRIVE_RIGHT", "PULL_UP", "CREATE_SPACE"];
  function validateOldDecisions(ds, reps) {
    const bad = (field, message) => ({ field, message });
    if (!Array.isArray(ds)) return bad("extra", "A Read the D set needs its reps.");
    for (const d of ds) {
      if (!isPlainObject(d) || !Number.isInteger(d.rep) || d.rep < 1 || d.rep > reps || (d.read !== 1 && d.read !== 2) ||
          !Array.isArray(d.ids) || d.ids.length === 0 || !d.ids.every(id => typeof id === "string") ||
          !isPlainObject(d.state) || OLD_RTD_ACTIONS.indexOf(d.correct) === -1 ||
          typeof d.ruleId !== "string" || typeof d.situation !== "string") {
        return bad("extra", "A Read the D decision is missing what was called or the right answer.");
      }
      if (d.actual !== null && OLD_RTD_ACTIONS.concat("FROZE").indexOf(d.actual) === -1) {
        return bad("decisions", "Pick what you did for rep " + d.rep + ".");
      }
    }
    return null;
  }

  // The timing values that shape a set, copied so old sets stay readable after
  // the settings change. s is the settings object a run starts with.
  function snapshotSettings(s) {
    const shared = {
      baseRate: s.baseRate, maxRate: s.maxRate, minGapMs: s.minGapMs, speechLeadMs: s.speechLeadMs,
      repsPerSet: s.training ? s.training.repsPerSet : null,
    };
    // (Sets of the removed Shooters only drill kept { shooters: {...} } here.)
    if (s.drill === "moveLab") return clone(Object.assign({ moveLab: s.moveLab }, shared));
    if (s.drill === "readTheD") return clone(Object.assign({ readTheD: s.readTheD }, shared));
    return clone(Object.assign({
      readMinMs: s.readMinMs, readMaxMs: s.readMaxMs,
      driveMinMs: s.driveMinMs, driveMaxMs: s.driveMaxMs,
      resetPauseMs: s.resetPauseMs, finisherBufferMs: s.finisherBufferMs,
      maxCutOffsPerDrive: s.maxCutOffsPerDrive, maxLayUpsPerDrive: s.maxLayUpsPerDrive,
      startWeights: s.startWeights, afterDriveOrCutOffWeights: s.afterDriveOrCutOffWeights,
      afterLayUpWeights: s.afterLayUpWeights,
    }, shared));
  }

  // A new log with `session` added, or replacing the session with the same id.
  // The input log is not changed.
  function upsertSession(log, session) {
    const next = clone(log);
    const copy = clone(session);
    const i = next.sessions.findIndex(x => x && x.id === session.id);
    if (i === -1) next.sessions.push(copy);
    else next.sessions[i] = copy;
    return next;
  }

  // made / attempted, or null when not logged or nothing was attempted.
  function setSuccess(set) {
    if (set.made === null || set.attempted === null || !(set.attempted > 0)) return null;
    return set.made / set.attempted;
  }

  // (lostHandles + missedCalls) / reps, or null when not logged.
  function setErrorRate(set) {
    if (set.lostHandles === null || set.missedCalls === null || !(set.reps > 0)) return null;
    return (set.lostHandles + set.missedCalls) / set.reps;
  }

  // Totals over a session's sets. Rates only count sets where those fields were
  // logged, and are null when there is nothing to count.
  function summarizeSession(session) {
    return summarizeSets(session && Array.isArray(session.sets) ? session.sets : []);
  }

  // Totals over any list of sets. lostPer10 / missedPer10 are per 10 reps, over
  // the reps of sets whose errors were logged.
  function summarizeSets(sets) {
    const sum = {
      sets: sets.length, reps: 0, loggedSets: 0,
      made: 0, attempted: 0, lostHandles: 0, missedCalls: 0,
      makePct: null, errorsPerRep: null, lostPer10: null, missedPer10: null,
      ratedSets: 0, cleanSets: 0, cleanShare: null,
      // Move Lab: clean reps over the reps of sets where they were entered.
      cleanReps: 0, cleanRepsOf: 0, cleanRepShare: null,
      // Read the D: reviewed reads, right / reviewed. New sets count reps (extra.reads),
      // sets of the first Read the D count decisions (extra.decisions); both are
      // "share of reads I got right". readsScore: OffensePlanner.scoreReads of the new reps.
      reads: 0, readsRight: 0, readsPct: null, readsScore: null,
    };
    let errorReps = 0;
    const newReads = [];
    sets.forEach(set => {
      if (set.extra && Array.isArray(set.extra.reads)) {
        set.extra.reads.forEach(r => {
          if (r.ok === null) return;
          sum.reads++;
          if (r.ok) sum.readsRight++;
        });
        newReads.push(...set.extra.reads);
      }
      if (set.extra && Array.isArray(set.extra.decisions)) {
        set.extra.decisions.forEach(d => {
          if (d.actual === null || d.actual === undefined) return;
          sum.reads++;
          if (d.actual === d.correct) sum.readsRight++;
        });
      }
      sum.reps += set.reps;
      if (set.extra && Number.isInteger(set.extra.cleanReps)) {
        sum.cleanReps += set.extra.cleanReps;
        sum.cleanRepsOf += set.reps;
      }
      if (set.made !== null && set.attempted !== null) {
        sum.loggedSets++;
        sum.made += set.made;
        sum.attempted += set.attempted;
      }
      if (set.lostHandles !== null && set.missedCalls !== null) {
        sum.lostHandles += set.lostHandles;
        sum.missedCalls += set.missedCalls;
        errorReps += set.reps;
      }
      if (set.quality !== null) {
        sum.ratedSets++;
        if (set.quality === "clean") sum.cleanSets++;
      }
    });
    if (sum.attempted > 0) sum.makePct = sum.made / sum.attempted;
    if (errorReps > 0) {
      sum.errorsPerRep = (sum.lostHandles + sum.missedCalls) / errorReps;
      sum.lostPer10 = sum.lostHandles / errorReps * 10;
      sum.missedPer10 = sum.missedCalls / errorReps * 10;
    }
    if (sum.ratedSets > 0) sum.cleanShare = sum.cleanSets / sum.ratedSets;
    if (sum.cleanRepsOf > 0) sum.cleanRepShare = sum.cleanReps / sum.cleanRepsOf;
    if (sum.reads > 0) sum.readsPct = sum.readsRight / sum.reads;
    if (newReads.length) sum.readsScore = OffensePlanner.scoreReads(newReads);
    return sum;
  }

  function setsOfDrill(session, drill) {
    return session && Array.isArray(session.sets) ? session.sets.filter(set => set && set.drill === drill) : [];
  }

  // Drills in a session, in the order they were first played.
  function sessionDrills(session) {
    const drills = [];
    (session && Array.isArray(session.sets) ? session.sets : []).forEach(set => {
      if (set && drills.indexOf(set.drill) === -1) drills.push(set.drill);
    });
    return drills;
  }

  // [{ drill, summary }] per drill played in the session.
  function summarizeByDrill(session) {
    return sessionDrills(session).map(drill => ({ drill, summary: summarizeSets(setsOfDrill(session, drill)) }));
  }

  // Session length in ms from startedAt to endedAt, or null.
  function sessionLengthMs(session) {
    const a = Date.parse(session.startedAt);
    const b = Date.parse(session.endedAt);
    return isFinite(a) && isFinite(b) && b >= a ? b - a : null;
  }

  function byStart(a, b) {
    return a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0;
  }

  // Read stored text. Never throws. Returns { status, log, keepRaw }:
  //   "empty"  nothing stored: a new log;
  //   "ok"     a version 1 log;
  //   "newer"  a version this code doesn't know yet;
  //   "corrupt" not JSON, or not a log at all.
  // For "newer" and "corrupt", log is a new empty log and keepRaw is the stored
  // text, which must be backed up before anything is written to the log key.
  function parseLog(raw) {
    if (raw === null || raw === undefined || raw === "") return { status: "empty", log: emptyLog(), keepRaw: null };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { status: "corrupt", log: emptyLog(), keepRaw: raw };
    }
    if (isPlainObject(parsed) && parsed.version === LOG_VERSION && Array.isArray(parsed.sessions)) {
      return { status: "ok", log: parsed, keepRaw: null };
    }
    const newer = isPlainObject(parsed) && typeof parsed.version === "number" && parsed.version > LOG_VERSION;
    return { status: newer ? "newer" : "corrupt", log: emptyLog(), keepRaw: raw };
  }

  // Load the log from a store. The returned state is passed to saveLog.
  function openLog(store) {
    const parsed = parseLog(store.get(LOG_KEY));
    return { status: parsed.status, log: parsed.log, keepRaw: parsed.keepRaw, backupKey: null };
  }

  // Write state.log to the store. If the stored text could not be read as a
  // version 1 log, it is first copied to reactionCaller.log.backup.<nowMs> and
  // read back; if that copy fails, nothing is written, so it is never lost.
  // Returns { state, saved }.
  function saveLog(state, store, nowMs) {
    const next = Object.assign({}, state);
    if (next.keepRaw !== null) {
      let key = BACKUP_PREFIX + nowMs;
      for (let i = 1; store.get(key) !== null && store.get(key) !== next.keepRaw; i++) key = BACKUP_PREFIX + nowMs + "-" + i;
      store.set(key, next.keepRaw);
      if (store.get(key) !== next.keepRaw) return { state, saved: false };
      next.keepRaw = null;
      next.backupKey = key;
    }
    const text = JSON.stringify(next.log);
    store.set(LOG_KEY, text);
    return { state: next, saved: store.get(LOG_KEY) === text };
  }

  // ---- Self-test (only called from ?selftest=1) ----

  function selfTest(check) {
    const P = OffensePlanner;
    const { compareWithPrevious, comparisonText, trendSeries, trendGeometry } = TrainingLog;
    const base = {
      drill: "drive", level: null, reps: 8, startedAt: "2026-01-01T10:00:00.000Z", endedAt: "2026-01-01T10:01:00.000Z",
      made: 5, attempted: 8, lostHandles: 1, missedCalls: 0, quality: "clean", note: null,
      settingsSnapshot: { driveMinMs: 1400 }, extra: {},
    };
    const withSet = changes => Object.assign({}, base, changes);
    const skipped = withSet({ made: null, attempted: null, lostHandles: null, missedCalls: null, quality: null, note: null });

    const ok = [];
    [["full", base], ["skipped", skipped], ["note", withSet({ note: "felt slow" })],
     ["made = attempted", withSet({ made: 8 })], ["0 of 0", withSet({ made: 0, attempted: 0 })],
     ["off-balance", withSet({ quality: "off_balance" })], ["shooters", withSet({ drill: "shooters" })]].forEach(c => {
      const e = validateSet(c[1]);
      if (e) ok.push(c[0] + ": " + e.message);
    });
    check("log: valid sets (full, skipped, edge values) pass validation", ok);

    const rejects = [];
    [["made > attempted", { made: 9 }], ["negative made", { made: -1 }], ["fractional attempted", { attempted: 7.5 }],
     ["NaN lost handles", { lostHandles: NaN }], ["negative missed calls", { missedCalls: -2 }],
     ["string count", { made: "5" }], ["made without attempted", { attempted: null }],
     ["unknown quality", { quality: "great" }], ["quality wrong case", { quality: "Clean" }],
     ["unknown drill", { drill: "mixed" }], ["0 reps", { reps: 0 }], ["note too long", { note: "x".repeat(501) }],
     ["extra not object", { extra: null }], ["no snapshot", { settingsSnapshot: undefined }],
     ["no end time", { endedAt: undefined }]].forEach(c => {
      if (!validateSet(withSet(c[1]))) rejects.push("accepted " + c[0]);
    });
    check("log: validation rejects made > attempted, bad counts, unknown quality and bad fields", rejects);

    const near = (a, b) => a !== null && b !== null && Math.abs(a - b) < 1e-9;
    const math = [];
    if (!near(setSuccess(base), 5 / 8)) math.push("setSuccess 5/8");
    if (setSuccess(skipped) !== null) math.push("setSuccess skipped");
    if (setSuccess(withSet({ made: 0, attempted: 0 })) !== null) math.push("setSuccess 0/0");
    if (!near(setErrorRate(withSet({ lostHandles: 2, missedCalls: 1, reps: 6 })), 0.5)) math.push("setErrorRate 3/6");
    if (setErrorRate(skipped) !== null) math.push("setErrorRate skipped");

    const session = {
      id: "s1", startedAt: base.startedAt, endedAt: base.endedAt,
      sets: [
        withSet({ made: 5, attempted: 8, lostHandles: 1, missedCalls: 1, quality: "clean" }),
        withSet({ made: 3, attempted: 8, lostHandles: 0, missedCalls: 2, quality: "rushed" }),
        withSet({ reps: 8, made: null, attempted: null, lostHandles: null, missedCalls: null, quality: null }),
        withSet({ reps: 4, made: 2, attempted: 4, lostHandles: 0, missedCalls: 0, quality: "clean" }),
      ],
    };
    const sum = summarizeSession(session);
    const want = { sets: 4, reps: 28, loggedSets: 3, made: 10, attempted: 20, lostHandles: 1, missedCalls: 3,
      ratedSets: 3, cleanSets: 2 };
    Object.keys(want).forEach(k => { if (sum[k] !== want[k]) math.push("summary." + k + " = " + sum[k] + " (want " + want[k] + ")"); });
    if (!near(sum.makePct, 0.5)) math.push("makePct " + sum.makePct);
    if (!near(sum.errorsPerRep, 4 / 20)) math.push("errorsPerRep " + sum.errorsPerRep);
    if (!near(sum.cleanShare, 2 / 3)) math.push("cleanShare " + sum.cleanShare);
    const none = summarizeSession({ id: "s2", sets: [] });
    if (none.sets !== 0 || none.makePct !== null || none.errorsPerRep !== null || none.cleanShare !== null) math.push("empty session");
    check("log: setSuccess, setErrorRate and summarizeSession math", math);

    const snap = [];
    const settings = P.cloneSettings(P.OFFENSE_DEFAULTS);
    Object.assign(settings, { training: Object.assign({}, P.TRAINING_DEFAULTS) });
    const drive = snapshotSettings(Object.assign({}, settings, { drill: "drive" }));
    ["readMinMs", "driveMinMs", "driveMaxMs", "maxCutOffsPerDrive", "afterLayUpWeights", "maxRate", "repsPerSet"].forEach(k => {
      if (drive[k] === undefined) snap.push("drive snapshot missing " + k);
    });
    if (drive.moveLab !== undefined || drive.readTheD !== undefined || drive.phrases !== undefined) snap.push("drive snapshot has unrelated settings");
    const rtd = snapshotSettings(Object.assign({}, settings, { drill: "readTheD" }));
    if (!rtd.readTheD || rtd.readTheD.endWindowMs !== settings.readTheD.endWindowMs || !rtd.readTheD.waits || rtd.repsPerSet !== 8 ||
        rtd.driveMinMs !== undefined || rtd.moveLab !== undefined) snap.push("read the d snapshot");
    const moveLab = snapshotSettings(Object.assign({}, settings, { drill: "moveLab" }));
    settings.moveLab.getSetMs.CATCH.minMs = 1;
    settings.afterLayUpWeights.CUT_OFF = 1;
    if (moveLab.moveLab.getSetMs.CATCH.minMs === 1 || drive.afterLayUpWeights.CUT_OFF === 1) snap.push("snapshot is not a copy");
    check("log: settings snapshot holds the drill's timing, weights and caps as a copy", snap);

    const mlf = [];
    // ml: a set as logged before the redesign (one move, one side); mlNew: picked moves.
    const ml = changes => withSet(Object.assign({ drill: "moveLab", reps: 10, made: null, attempted: null,
      extra: { moveId: "SPIN", side: "right", cleanReps: 8 } }, changes));
    const mlNew = extra => withSet({ drill: "moveLab", reps: 10, made: 6, attempted: 10,
      extra: Object.assign({ moveIds: ["SPIN", "HESI"], cleanReps: 7 }, extra) });
    [["old: handle move, no shots", ml({})], ["old: shot move with shots", ml({ made: 6, attempted: 10 })],
     ["old: skipped", ml({ lostHandles: null, missedCalls: null, quality: null, extra: { moveId: "SPIN", side: "left", cleanReps: null } })],
     ["old: all clean", ml({ extra: { moveId: "HESI", side: "alternate", cleanReps: 10 } })],
     ["picked moves", mlNew({})], ["one picked move", mlNew({ moveIds: ["PULL_UP"] })],
     ["picked moves, clean not entered", mlNew({ cleanReps: null })]].forEach(c => {
      const e = validateSet(c[1]);
      if (e) mlf.push(c[0] + ": " + e.message);
    });
    [["clean > reps", { cleanReps: 11 }], ["negative clean", { cleanReps: -1 }], ["fractional clean", { cleanReps: 7.5 }],
     ["clean missing", { cleanReps: undefined }], ["no move", { moveId: "" }], ["bad side", { side: "both" }]].forEach(c => {
      if (!validateSet(ml({ extra: Object.assign({ moveId: "SPIN", side: "right", cleanReps: 8 }, c[1]) }))) mlf.push("accepted old " + c[0]);
    });
    [["no moves", { moveIds: [] }], ["moves not a list", { moveIds: "SPIN" }], ["empty move id", { moveIds: ["SPIN", ""] }],
     ["clean > reps", { cleanReps: 11 }], ["clean missing", { cleanReps: undefined }]].forEach(c => {
      if (!validateSet(mlNew(c[1]))) mlf.push("accepted " + c[0]);
    });
    const mlSnap = snapshotSettings(Object.assign({}, settings, { drill: "moveLab" }));
    if (!mlSnap.moveLab || mlSnap.moveLab.maxMovesPerRep !== 3 || !Array.isArray(mlSnap.moveLab.moveIds) ||
        !mlSnap.moveLab.getSetMs || mlSnap.moveLab.firstMoveGapMaxMs !== 400 ||
        mlSnap.shooters !== undefined || mlSnap.driveMinMs !== undefined) {
      mlf.push("snapshot");
    }
    const mlSum = summarizeSets([ml({}), ml({ reps: 5, extra: { moveId: "SPIN", side: "left", cleanReps: 5 } }),
      ml({ extra: { moveId: "SPIN", side: "left", cleanReps: null } }), withSet({})]);
    if (mlSum.cleanReps !== 13 || mlSum.cleanRepsOf !== 15 || !near(mlSum.cleanRepShare, 13 / 15)) mlf.push("clean rep totals");
    if (summarizeSets([base]).cleanRepShare !== null) mlf.push("clean share without Move Lab sets");
    check("log: Move Lab sets need picked moves (or an old move + side) and clean reps 0..reps (or null); snapshot and clean-rep totals", mlf);

    // Read the D sets: the reps since the rewrite (extra.reads) and the decisions of the
    // first Read the D (extra.decisions) both validate.
    const rf = [];
    const read = (rep, ok, missedCall) => ({ rep, chain: ["D_GO", "D_TIGHT", "D_LEFT_FOOT", "D_LANE_OPEN", "D_LAY_LEFT"],
      terminal: "D_LAY_LEFT", driveSide: "left", ok, missedCall: missedCall === undefined ? null : missedCall });
    const dec = (rep, correct, actual) => ({ rep, read: 1, ids: ["D_SET", "D_SAG", "D_LEFT_FOOT"],
      state: { momentum: "set", distance: "sag", leadFoot: "left" }, correct, ruleId: "gaveShot", situation: "sagging defender", actual });
    const newSet = (reads, changes) => withSet(Object.assign({ drill: "readTheD", reps: 4, made: 3, attempted: 4, extra: { reads } }, changes));
    const oldSet = (decisions, changes) => withSet(Object.assign({ drill: "readTheD", reps: 4, made: 3, attempted: 4, extra: { decisions } }, changes));
    const skip = { made: null, attempted: null, lostHandles: null, missedCalls: null, quality: null };
    const goodNew = newSet([read(1, true), read(2, false, "D_LANE_OPEN"), read(3, false), read(4, true)]);
    const goodOld = oldSet([dec(1, "PULL_UP", "PULL_UP"), dec(2, "PULL_UP", "DRIVE_LEFT"), dec(3, "PULL_UP", "FROZE"),
      dec(4, "PULL_UP", "PULL_UP"), Object.assign(dec(4, "DRIVE_LEFT", "DRIVE_LEFT"), { read: 2 })]);
    [["new: reviewed", goodNew], ["new: not reviewed", newSet([read(1, null), read(2, null)], skip)], ["new: no reps", newSet([])],
     ["new: silent shot", newSet([Object.assign(read(1, true), { chain: ["D_GO", "D_SAG"], terminal: "SHOT", driveSide: null })])],
     ["old: reviewed", goodOld], ["old: skipped", oldSet([dec(1, "PULL_UP", null)], skip)], ["old: empty", oldSet([])]].forEach(c => {
      const e = validateSet(c[1]);
      if (e) rf.push(c[0] + ": " + e.message);
    });
    [["new: rep 5 of 4", newSet([read(5, true)])], ["new: empty chain", newSet([Object.assign(read(1, true), { chain: [] })])],
     ["new: no terminal", newSet([Object.assign(read(1, true), { terminal: undefined })])],
     ["new: bad drive side", newSet([Object.assign(read(1, true), { driveSide: "middle" })])],
     ["new: ok as text", newSet([read(1, "yes")])], ["new: missed call not in the chain", newSet([read(1, false, "D_HANDS_UP")])],
     ["new: missed call on a right read", newSet([read(1, true, "D_TIGHT")])], ["new: reads not a list", newSet("D_GO")],
     ["neither shape", withSet({ drill: "readTheD", reps: 4, extra: {} })],
     ["old: unknown action", oldSet([dec(1, "PULL_UP", "PASS")])], ["old: rep 5 of 4", oldSet([dec(5, "PULL_UP", "PULL_UP")])],
     ["old: no situation", oldSet([Object.assign(dec(1, "PULL_UP", "PULL_UP"), { situation: undefined })])]].forEach(c => {
      if (!validateSet(c[1])) rf.push("accepted " + c[0]);
    });
    check("log: Read the D sets validate in both shapes: reps since the rewrite (extra.reads) and old decisions (extra.decisions)", rf);

    // A log holding both shapes: one combined reads-right figure, comparison and trend.
    const bf = [];
    const both = summarizeSets([goodNew, goodOld, withSet({})]);
    // New: 2 of 4 right; old: 3 of 5 right.
    if (both.reads !== 9 || both.readsRight !== 5 || !near(both.readsPct, 5 / 9)) bf.push("totals " + both.readsRight + "/" + both.reads);
    if (!both.readsScore || both.readsScore.mostMissed !== "D_LANE_OPEN") bf.push("most missed");
    if (summarizeSets([base]).readsPct !== null || summarizeSets([newSet([read(1, null)])]).readsPct !== null) bf.push("readsPct without reviewed reads");
    const blog = { version: 1, sessions: [
      { id: "r1", startedAt: "2026-05-01T10:00:00.000Z", sets: [oldSet([dec(1, "PULL_UP", "PULL_UP"), dec(2, "PULL_UP", "FROZE")])] },
      { id: "r2", startedAt: "2026-05-02T10:00:00.000Z", sets: [goodNew] },
    ] };
    const parsed = parseLog(JSON.stringify(blog));
    if (parsed.status !== "ok" || !parsed.log.sessions.every(sess => sess.sets.every(st => validateSet(st) === null))) bf.push("log does not load");
    const bcmp = compareWithPrevious(blog, blog.sessions[1], "readTheD", 5);
    if (comparisonText(bcmp) !== "Reads 50% right (avg 50). Make % 75 (avg 75). Lost handles 2.5 per 10 reps (avg 2.5)") bf.push("compare: " + comparisonText(bcmp));
    const bseries = trendSeries(blog, "readTheD", 20);
    const bgeo = trendGeometry(bseries, { width: 320, height: 180, left: 40, right: 40, top: 10, bottom: 30 });
    if (bseries.map(p => p.readsPct).join() !== "0.5,0.5" || bgeo.reads.length !== 2 || bgeo.reads[0].y !== 10 + 140 * 0.5) bf.push("trend");
    if (trendGeometry([{ makePct: 0.5, lostPer10: 1, readsPct: null }], { width: 320, height: 180, left: 40, right: 40, top: 10, bottom: 30 }).reads.length !== 0) bf.push("trend without reads");
    check("log: a log with old and new Read the D sets loads, and gives one reads-right total, comparison and trend line", bf);

    const up = [];
    const log0 = emptyLog();
    const log1 = upsertSession(log0, { id: "a", sets: [base] });
    const log2 = upsertSession(log1, { id: "a", sets: [base, base] });
    const log3 = upsertSession(log2, { id: "b", sets: [] });
    if (log0.sessions.length !== 0 || log1.sessions[0].sets.length !== 1) up.push("input changed");
    if (log2.sessions.length !== 1 || log2.sessions[0].sets.length !== 2) up.push("replace by id");
    if (log3.sessions.length !== 2 || log3.version !== 1) up.push("append");
    check("log: upsertSession appends or replaces by id without changing its input", up);

    const parse = [];
    const v1 = JSON.stringify(log3);
    const r1 = parseLog(v1);
    if (r1.status !== "ok" || r1.log.sessions.length !== 2 || r1.keepRaw !== null) parse.push("v1 not ok");
    [null, ""].forEach(raw => {
      const r = parseLog(raw);
      if (r.status !== "empty" || r.log.version !== 1 || r.keepRaw !== null) parse.push("empty " + JSON.stringify(raw));
    });
    [['{"version":2,"sessions":[{"id":"x"}]}', "newer"], ['{"version":99}', "newer"], ['{"sessions":[]}', "corrupt"],
     ['{"version":"1","sessions":[]}', "corrupt"], ['{"version":1,"sessions":"x"}', "corrupt"], ["{version:1}", "corrupt"],
     ["null", "corrupt"], ["[]", "corrupt"], ["42", "corrupt"], ['"text"', "corrupt"], ["{", "corrupt"]].forEach(c => {
      let r;
      try {
        r = parseLog(c[0]);
      } catch (e) {
        parse.push(c[0] + " threw " + e.message);
        return;
      }
      if (r.status !== c[1] || r.keepRaw !== c[0] || r.log.version !== 1 || r.log.sessions.length !== 0) {
        parse.push(c[0] + " -> " + r.status);
      }
    });
    check("log: parseLog reads version 1, and never throws on newer, unknown or broken text", parse);

    // Fake stores: a Map, and one whose writes to backup keys are lost (full storage).
    const fakeStore = (initial, dropBackups) => {
      const m = new Map(Object.entries(initial));
      return {
        map: m,
        get: k => (m.has(k) ? m.get(k) : null),
        set: (k, v) => { if (!(dropBackups && k.indexOf(BACKUP_PREFIX) === 0)) m.set(k, v); },
      };
    };
    const store = [];
    const newerRaw = '{"version":2,"sessions":[{"id":"future"}]}';
    const a = fakeStore({ [LOG_KEY]: newerRaw });
    let st = openLog(a);
    if (st.status !== "newer" || a.get(LOG_KEY) !== newerRaw) store.push("open changed the stored log");
    st.log = upsertSession(st.log, { id: "s", sets: [base] });
    const res = saveLog(st, a, 1000);
    if (!res.saved || a.get(BACKUP_PREFIX + "1000") !== newerRaw) store.push("newer log not backed up");
    if (parseLog(a.get(LOG_KEY)).status !== "ok") store.push("new log not written");
    const again = saveLog(res.state, a, 2000);
    if (a.map.size !== 2 || !again.saved) store.push("second save made another backup");

    const b = fakeStore({ [LOG_KEY]: "{broken" }, true);
    const rb = saveLog(openLog(b), b, 1000);
    if (rb.saved || b.get(LOG_KEY) !== "{broken") store.push("broken log overwritten although its backup failed");

    const c = fakeStore({});
    let sc = openLog(c);
    sc.log = upsertSession(sc.log, { id: "s1", sets: [base] });
    sc = saveLog(sc, c, 1).state;
    sc = openLog(c);
    sc.log = upsertSession(sc.log, { id: "s2", sets: [base] });
    saveLog(sc, c, 2);
    if (parseLog(c.get(LOG_KEY)).log.sessions.length !== 2 || c.map.size !== 1) store.push("valid log not kept across opens");
    check("log: saving backs up a newer or broken log first, and never overwrites it if the backup fails", store);

    TrainingLog.historySelfTest(check, base, withSet, near);
  }

  return {
    LOG_VERSION,
    LOG_KEY,
    BACKUP_PREFIX,
    QUALITIES,
    NOTE_MAX,
    clone,
    isPlainObject,
    byStart,
    emptyLog,
    validateSet,
    snapshotSettings,
    upsertSession,
    setSuccess,
    setErrorRate,
    summarizeSession,
    summarizeSets,
    setsOfDrill,
    sessionDrills,
    summarizeByDrill,
    sessionLengthMs,
    parseLog,
    openLog,
    saveLog,
    selfTest,
  };
})();
