// Adaptive difficulty: five levels per levelled drill, the adjustment rule and
// the rest-screen message. Pure (see js/core/planner.js).
(function (P) {
  "use strict";
  const { OFFENSE_DEFAULTS, TRAINING_DEFAULTS, PROFILES, LEVEL_DRILLS, cloneSettings, durationsFor, getSettingPath,
    setSettingPath } = P;

  Object.assign(TRAINING_DEFAULTS, {
    // ---- Adaptive difficulty (challenge point: hard but doable). ----
    // Every value below is a starting heuristic to tune, not a research-proven number.
    // Level for a drill that has never been played, and after "Reset level".
    startLevel: 3, // provisional
    // A logged set adjusts the level only with at least this many shots attempted.
    levelMinAttempts: 5, // provisional
    // Step up when success (made / attempted) >= levelUpSuccess AND
    // error rate ((lost handles + missed calls) / reps) <= levelUpMaxErrorRate.
    levelUpSuccess: 0.80, // provisional
    levelUpMaxErrorRate: 0.10, // provisional
    // Step down when success < levelDownSuccess OR error rate >= levelDownErrorRate.
    levelDownSuccess: 0.50, // provisional
    levelDownErrorRate: 0.30, // provisional
    // Five levels per drill, Level 1 easiest, in levels[drill] (set by each drill
    // file). Each maps a settings path (as in OFFENSE_DEFAULTS) to its value; with
    // Auto difficulty on these replace the matching manual fields. Every level must
    // pass the drill's validation.
  });

  const LEVEL_COUNT = 5;

  // The settings paths a drill's levels control (e.g. "driveMinMs").
  function levelPaths(drill, t) {
    return Object.keys(t.levels[drill][0]);
  }

  // A copy of settings s with level `level` of `drill` applied. s is not changed.
  function applyLevel(s, drill, level, t) {
    const next = cloneSettings(s);
    const values = t.levels[drill][level - 1];
    Object.keys(values).forEach(path => setSettingPath(next, path, values[path]));
    return next;
  }

  function isLevel(n) {
    return Number.isInteger(n) && n >= 1 && n <= LEVEL_COUNT;
  }

  // Stored levels -> { drive, … } (one per LEVEL_DRILLS), each a valid level (else startLevel).
  function normalizeLevels(stored, t) {
    const out = {};
    LEVEL_DRILLS.forEach(drill => {
      const v = stored && typeof stored === "object" ? stored[drill] : undefined;
      out[drill] = isLevel(v) ? v : t.startLevel;
    });
    return out;
  }

  // The adjustment rule after one logged set. Returns { level, change } with
  // change "up" | "down" | "hold" | "atTop" | "atBottom" (a step clamped to 1-5)
  // | "tooFew" (fewer than levelMinAttempts shots) | "skipped" (outcomes not logged).
  function levelDecision(level, set, cfg) {
    const logged = set && set.made !== null && set.attempted !== null &&
      set.lostHandles !== null && set.missedCalls !== null && set.reps > 0;
    if (!logged) return { level, change: "skipped" };
    if (set.attempted < cfg.levelMinAttempts) return { level, change: "tooFew" };
    const eps = 1e-9;
    const success = set.made / set.attempted;
    const errorRate = (set.lostHandles + set.missedCalls) / set.reps;
    let change = "hold";
    if (success >= cfg.levelUpSuccess - eps && errorRate <= cfg.levelUpMaxErrorRate + eps) change = "up";
    else if (success < cfg.levelDownSuccess - eps || errorRate >= cfg.levelDownErrorRate - eps) change = "down";
    if (change === "up" && level >= LEVEL_COUNT) return { level: LEVEL_COUNT, change: "atTop" };
    if (change === "down" && level <= 1) return { level: 1, change: "atBottom" };
    return { level: level + (change === "up" ? 1 : change === "down" ? -1 : 0), change };
  }

  function nextLevel(level, set, cfg) {
    return levelDecision(level, set, cfg).level;
  }

  // One line for the rest screen, e.g. "Level 3 → 4: nice, timing gets tighter".
  function levelMessage(from, decision, cfg) {
    const to = decision.level;
    switch (decision.change) {
      case "up": return "Level " + from + " → " + to + ": nice, timing gets tighter";
      case "down": return "Level " + from + " → " + to + ": easing off so you can lock it in";
      case "atTop": return "Holding at Level " + to + ", the top level";
      case "tooFew": return "Holding at Level " + to + " (a set needs at least " + cfg.levelMinAttempts + " shots to adjust)";
      case "skipped": return "Holding at Level " + to + " (skipped sets don't change the level)";
      default: return "Holding at Level " + to;
    }
  }
  // The adjustment rule for any levelled drill: its own, or levelDecision.
  function levelDecisionFor(drill, level, set, cfg) {
    const profile = PROFILES[drill];
    return profile && profile.levelDecision ? profile.levelDecision(level, set, cfg) : levelDecision(level, set, cfg);
  }

  // Difficulty levels and the adjustment rule.
  function levelSelfTest(check, reps) {
    const t = TRAINING_DEFAULTS;
    const base = Object.assign(cloneSettings(OFFENSE_DEFAULTS), { training: Object.assign({}, t) });
    const dur = durationsFor(base, null);

    // 1. Every level of every levelled drill passes validation, and plans reps without error.
    const vf = [];
    LEVEL_DRILLS.forEach(drill => {
      const levels = t.levels[drill];
      if (levels.length !== LEVEL_COUNT) vf.push(drill + ": " + levels.length + " levels");
      levelPaths(drill, t).forEach(path => {
        if (getSettingPath(OFFENSE_DEFAULTS, path) === undefined) vf.push(drill + ": unknown setting " + path);
      });
      levels.forEach((values, i) => {
        if (Object.keys(values).join() !== levelPaths(drill, t).join()) vf.push(drill + " level " + (i + 1) + ": different settings");
        const s = applyLevel(Object.assign({}, base, { drill }), drill, i + 1, t);
        const err = PROFILES[drill].validate(s, dur);
        if (err) vf.push(drill + " level " + (i + 1) + ": " + err.message);
        else {
          try {
            for (let n = 0; n < Math.min(reps, 500); n++) PROFILES[drill].planRep(s, dur, Math.random);
          } catch (e) {
            vf.push(drill + " level " + (i + 1) + " planning: " + e.message);
          }
        }
        if (i > 0) {
          const prev = applyLevel(base, drill, i, t);
          const win = PROFILES[drill].levelWindow;  // never longer at a higher level
          if (win(s) > win(prev)) vf.push(drill + " level " + (i + 1) + " has a longer window than level " + i);
        }
      });
    });
    check("levels: all 5 levels of every levelled drill pass validation (incl. shortest-fit) and plan reps", vf);

    // 2. The adjustment rule.
    const rf = [];
    const set = (made, attempted, lost, missed, reps) => ({ made, attempted, lostHandles: lost, missedCalls: missed, reps });
    [
      ["up: 8/10, 1 error in 10 reps", 3, set(8, 10, 1, 0, 10), 4, "up"],
      ["hold: 79% success", 3, set(79, 100, 0, 0, 100), 3, "hold"],
      ["hold: error rate 0.11", 3, set(9, 10, 11, 0, 100), 3, "hold"],
      ["down: 49% success", 3, set(49, 100, 0, 0, 100), 2, "down"],
      ["down: error rate 0.30", 3, set(10, 10, 2, 1, 10), 2, "down"],
      ["hold: 50% success, error rate 0.29", 3, set(5, 10, 29, 0, 100), 3, "hold"],
      ["up exactly at both thresholds (4/5, 1/10)", 2, set(4, 5, 1, 0, 10), 3, "up"],
      ["clamped at 5", 5, set(10, 10, 0, 0, 10), 5, "atTop"],
      ["clamped at 1", 1, set(0, 10, 5, 5, 10), 1, "atBottom"],
      ["too few attempts (4)", 3, set(4, 4, 0, 0, 4), 3, "tooFew"],
      ["skipped set", 3, set(null, null, null, null, 8), 3, "skipped"],
      ["errors not logged", 3, set(8, 8, null, 0, 8), 3, "skipped"],
      ["partial set with 5 attempts", 3, set(5, 5, 0, 0, 5), 4, "up"],
    ].forEach(c => {
      const d = levelDecision(c[1], c[2], t);
      if (d.level !== c[3] || d.change !== c[4] || nextLevel(c[1], c[2], t) !== c[3]) {
        rf.push(c[0] + ": got " + d.level + " " + d.change);
      }
    });
    check("levels: nextLevel steps up at >= 80% and <= 0.10 errors, down below 50% or at >= 0.30, else holds; 1-5", rf);

    // 3. applyLevel, stored levels, labels and messages.
    const mf = [];
    const s0 = Object.assign(cloneSettings(base), { drill: "drive" });
    const before = JSON.stringify(s0);
    const s4 = applyLevel(s0, "drive", 4, t);
    if (JSON.stringify(s0) !== before) mf.push("applyLevel changed its input");
    if (s4.driveMinMs !== 1500 || s4.afterDriveOrCutOffWeights.CUT_OFF !== 28 ||
        s4.afterDriveOrCutOffWeights.LAY_UP !== 25) mf.push("level 4 values");
    if (s4.maxCutOffsPerDrive !== s0.maxCutOffsPerDrive || s4.afterLayUpWeights.CUT_OFF !== s0.afterLayUpWeights.CUT_OFF ||
        s4.moveLab.maxMovesPerRep !== s0.moveLab.maxMovesPerRep) mf.push("non-level settings changed");
    const d1 = applyLevel(base, "drive", 1, t);
    if (d1.readMinMs !== 2000 || d1.afterDriveOrCutOffWeights.CUT_OFF !== 10 || d1.afterDriveOrCutOffWeights.LAY_UP_LEFT_SIDE !== 20) {
      mf.push("drive level 1 values");
    }
    const lv = normalizeLevels({ drive: 5, shooters: 4 }, t);
    if (lv.drive !== 5 || "shooters" in lv || normalizeLevels({ drive: 9 }, t).drive !== t.startLevel) mf.push("normalizeLevels");
    if (normalizeLevels(null, t).drive !== t.startLevel || normalizeLevels({ drive: 2.5 }, t).drive !== t.startLevel) mf.push("bad stored levels");
    if (P.progressLabel({ set: 2, rep: 5 }, t, 3) !== "SET 2 / 4 · REP 5 / 8 · LVL 3" ||
        P.progressLabel({ set: 2, rep: 5 }, t, null) !== "SET 2 / 4 · REP 5 / 8") mf.push("progress label");
    if (levelMessage(3, { level: 4, change: "up" }, t) !== "Level 3 → 4: nice, timing gets tighter" ||
        levelMessage(3, { level: 3, change: "hold" }, t) !== "Holding at Level 3") mf.push("messages");
    check("levels: applyLevel changes only level settings, stored levels are clamped, LVL label and messages", mf);
  }
  P.registerSuite(levelSelfTest);

  Object.assign(P, {
    LEVEL_COUNT,
    levelPaths,
    applyLevel,
    isLevel,
    normalizeLevels,
    levelDecision,
    nextLevel,
    levelMessage,
    levelDecisionFor,
  });
})(OffensePlanner);
