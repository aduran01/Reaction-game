// Session structure: sets of reps, the set / rep counter, the session clock
// and the fatigue warning. Pure (see js/core/planner.js).
(function (P) {
  "use strict";
  const { TRAINING_DEFAULTS, PROFILES, isWhole, isWholeNonNegative, isLevel } = P;

  // A session is everything from Start until the player ends it; it is made of
  // sets, and a set is a fixed number of reps (one rep plan each).
  Object.assign(TRAINING_DEFAULTS, {
    // Reps in one set (whole number 3-30). The set ends at the last rep's endMs.
    repsPerSet: 8,

    // Planned sets per session (whole number 1-20). A target shown on the game
    // screen ("SET 2 / 4"), not a hard stop: the player can keep going.
    plannedSets: 4,

    // Minutes after Start when a fatigue warning banner appears. 0 = off.
    // The session is never stopped automatically.
    sessionWarningMin: 45, // provisional

    // Rest countdown after "Save & rest" on the set log, in seconds (whole number 0-600).
    restSec: 60, // provisional

    // Spoken when a set ends (at baseRate, queued behind the last call, never cancelling it).
    setDoneSpoken: "set done",
  });

  // Session settings check. Returns null, or { field: "session", message }.
  function validateSession(t) {
    const session = message => ({ field: "session", message });
    if (!isWhole(t.repsPerSet) || t.repsPerSet < 3 || t.repsPerSet > 30) {
      return session("Reps per set must be a whole number from 3 to 30.");
    }
    if (!isWhole(t.plannedSets) || t.plannedSets < 1 || t.plannedSets > 20) {
      return session("Planned sets must be a whole number from 1 to 20.");
    }
    if (!isWholeNonNegative(t.sessionWarningMin)) {
      return session("Session time warning must be a whole number of 0 minutes or more (0 = off).");
    }
    if (!isWhole(t.restSec) || t.restSec < 0 || t.restSec > 600) {
      return session("Rest between sets must be a whole number from 0 to 600 seconds.");
    }
    return null;
  }

  // The session settings a drill runs with: a drill whose profile names its own
  // reps-per-set setting (repsPerSetKey, e.g. Move Lab) uses that.
  function sessionForDrill(t, drill) {
    const key = PROFILES[drill] && PROFILES[drill].repsPerSetKey;
    return key ? Object.assign({}, t, { repsPerSet: t[key] }) : t;
  }

  // Session progress { set, rep }: the current set (from 1) and the reps started in it.
  function newSession() {
    return { set: 1, rep: 0 };
  }

  function beginRep(p) {
    return { set: p.set, rep: p.rep + 1 };
  }

  // True once the rep just begun is the set's last one.
  function isSetComplete(p, t) {
    return p.rep >= t.repsPerSet;
  }

  function beginSet(p) {
    return { set: p.set + 1, rep: 0 };
  }

  // "SET 2 / 4 · REP 5 / 8", plus " · LVL 3" when a level is given. Sets past the
  // plan keep counting ("SET 5 / 4").
  function progressLabel(p, t, level) {
    return "SET " + p.set + " / " + t.plannedSets + " · REP " + p.rep + " / " + t.repsPerSet +
      (isLevel(level) ? " · LVL " + level : "");
  }

  // Elapsed session time as mm:ss (minutes keep counting past 59, e.g. "75:03").
  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }

  function sessionWarningDue(elapsedMs, t) {
    return t.sessionWarningMin > 0 && elapsedMs >= t.sessionWarningMin * 60000;
  }

  function sessionWarningText(t) {
    return t.sessionWarningMin + " min: decision quality and technique drop with fatigue. " +
      "Consider finishing this set and stopping.";
  }
  // Session helpers self-test.
  function trainingSelfTest(check) {
    const t = Object.assign({}, TRAINING_DEFAULTS);
    const err = validateSession(t);
    check("session: defaults pass validation", err ? [err.message] : []);

    const bad = [
      { repsPerSet: 2 }, { repsPerSet: 31 }, { repsPerSet: 8.5 }, { repsPerSet: NaN },
      { plannedSets: 0 }, { plannedSets: 21 }, { plannedSets: 1.5 }, { plannedSets: NaN },
      { sessionWarningMin: -1 }, { sessionWarningMin: 2.5 }, { sessionWarningMin: NaN },
      { restSec: -1 }, { restSec: 601 }, { restSec: 2.5 }, { restSec: NaN },
    ];
    const good = [
      { repsPerSet: 3 }, { repsPerSet: 30 }, { plannedSets: 1 }, { plannedSets: 20 }, { sessionWarningMin: 0 },
      { restSec: 0 }, { restSec: 600 },
    ];
    const vf = [];
    bad.forEach(c => {
      const e = validateSession(Object.assign({}, t, c));
      if (!e || e.field !== "session") vf.push("accepted " + JSON.stringify(c));
    });
    good.forEach(c => {
      if (validateSession(Object.assign({}, t, c))) vf.push("rejected " + JSON.stringify(c));
    });
    check("session: validation rejects out-of-range or non-whole values, accepts the bounds", vf);

    const df = [];
    const ml = sessionForDrill(t, "moveLab");
    if (ml.repsPerSet !== 10 || t.repsPerSet !== 8 || sessionForDrill(t, "drive").repsPerSet !== 8) df.push("reps per set");
    if (validateSession(sessionForDrill(Object.assign({}, t, { moveLabRepsPerSet: 31 }), "moveLab")) === null) df.push("31 accepted");
    if (validateSession(sessionForDrill(Object.assign({}, t, { moveLabRepsPerSet: 31 }), "drive")) !== null) df.push("drive checks Move Lab reps");
    check("session: Move Lab uses its own reps per set (default 10), the other drills keep repsPerSet", df);

    // Walk 6 sets (past the 4 planned) for several set sizes.
    const cf = [];
    [3, 8, 30].forEach(repsPerSet => {
      const ts = Object.assign({}, t, { repsPerSet });
      let p = newSession();
      for (let set = 1; set <= 6; set++) {
        if (p.set !== set || p.rep !== 0 || isSetComplete(p, ts)) cf.push(repsPerSet + ": bad start of set " + set);
        let reps = 0;
        do {
          p = beginRep(p);
          reps++;
          const want = "SET " + set + " / 4 · REP " + reps + " / " + repsPerSet;
          if (progressLabel(p, ts) !== want) cf.push(progressLabel(p, ts) + " (want " + want + ")");
        } while (!isSetComplete(p, ts) && reps < 100);
        if (reps !== repsPerSet) cf.push(repsPerSet + ": set " + set + " had " + reps + " reps");
        p = beginSet(p);
      }
    });
    check("session: each set ends after exactly repsPerSet reps, labels count sets and reps", cf);

    const ff = [];
    [[0, "00:00"], [999, "00:00"], [1000, "00:01"], [59999, "00:59"], [60000, "01:00"],
     [754000, "12:34"], [3600000, "60:00"], [4503000, "75:03"], [-5, "00:00"]].forEach(c => {
      if (formatElapsed(c[0]) !== c[1]) ff.push(c[0] + " ms -> " + formatElapsed(c[0]) + " (want " + c[1] + ")");
    });
    check("session: elapsed time formats as mm:ss", ff);

    const wf = [];
    const t45 = Object.assign({}, t, { sessionWarningMin: 45 });
    const off = Object.assign({}, t, { sessionWarningMin: 0 });
    if (sessionWarningDue(45 * 60000 - 1, t45)) wf.push("due before 45 min");
    if (!sessionWarningDue(45 * 60000, t45) || !sessionWarningDue(90 * 60000, t45)) wf.push("not due at/after 45 min");
    if (sessionWarningDue(0, off) || sessionWarningDue(1e9, off)) wf.push("due while off (0)");
    if (sessionWarningText(t45).indexOf("45 min: decision quality") !== 0) wf.push("text: " + sessionWarningText(t45));
    check("session: fatigue warning due only at or after the set minutes, never when 0", wf);
  }
  P.registerSuite(trainingSelfTest);

  Object.assign(P, {
    validateSession,
    sessionForDrill,
    newSession,
    beginRep,
    isSetComplete,
    beginSet,
    progressLabel,
    formatElapsed,
    sessionWarningDue,
    sessionWarningText,
  });
})(OffensePlanner);
