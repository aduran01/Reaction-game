// Read the D scoring: decisions reviewed after the set, accuracy, the most
// common miss, the rest-screen lines and the drill's own level rule.
// Pure (see js/core/planner.js).
(function (P) {
  "use strict";
  const { TRAINING_DEFAULTS, PROFILES, LEVEL_COUNT, RTD_ACTIONS, levelDecisionFor } = P;

  Object.assign(TRAINING_DEFAULTS, {
    // Read the D uses decision accuracy (right decisions / decisions reviewed) too:
    // step up when accuracy >= readTheDLevelUpAccuracy AND success >= readTheDLevelUpSuccess;
    // step down when accuracy < readTheDLevelDownAccuracy OR error rate >= readTheDLevelDownErrorRate.
    readTheDLevelUpAccuracy: 0.85, // provisional
    readTheDLevelUpSuccess: 0.60, // provisional
    readTheDLevelDownAccuracy: 0.65, // provisional
    readTheDLevelDownErrorRate: 0.30, // provisional
  });

  // ---- Read the D scoring (decisions reviewed after the set) ----
  // A logged decision: { rep, read, ids, state, correct, ruleId, situation, actual },
  // actual one of RTD_REVIEW_ACTIONS, or null when not reviewed (skipped set).

  const RTD_REVIEW_ACTIONS = RTD_ACTIONS.concat("FROZE");

  function isReviewed(d) {
    return d && d.actual !== null && d.actual !== undefined;
  }

  // What the player did, said about the outcome: "you drove anyway", "you froze", …
  function didText(correct, actual) {
    if (actual === "FROZE") return "you froze";
    if (actual === "PULL_UP") return "you pulled up";
    if (actual === "CREATE_SPACE") return "you created space";
    return correct === "DRIVE_LEFT" || correct === "DRIVE_RIGHT" ? "you drove the wrong way" : "you drove anyway";
  }

  // Score reviewed decisions: { total, correct, accuracy (null if none), byAction:
  // { DRIVE_LEFT: { total, correct }, … }, topConfusion }. topConfusion is the
  // most common miss (same situation, same kind of wrong action; ties go to the
  // first one): { situation, ruleId, correct, actual, did, count }, or null.
  function scoreDecisions(decisions) {
    const out = { total: 0, correct: 0, accuracy: null, byAction: {}, topConfusion: null };
    RTD_ACTIONS.forEach(a => { out.byAction[a] = { total: 0, correct: 0 }; });
    const misses = {};
    const order = [];
    (decisions || []).filter(isReviewed).forEach(d => {
      out.total++;
      const slot = out.byAction[d.correct];
      if (slot) slot.total++;
      if (d.actual === d.correct) {
        out.correct++;
        if (slot) slot.correct++;
        return;
      }
      const did = didText(d.correct, d.actual);
      const key = d.situation + "|" + did;
      if (!misses[key]) {
        misses[key] = { situation: d.situation, ruleId: d.ruleId, correct: d.correct, actual: d.actual, did, count: 0 };
        order.push(key);
      }
      misses[key].count++;
    });
    if (out.total > 0) out.accuracy = out.correct / out.total;
    order.forEach(key => {
      if (!out.topConfusion || misses[key].count > out.topConfusion.count) out.topConfusion = misses[key];
    });
    return out;
  }

  // "sagging defender → you drove anyway (2×)"
  function confusionText(c) {
    return c.situation + " → " + c.did + (c.count > 1 ? " (" + c.count + "×)" : "");
  }

  // The two rest-screen lines: [accuracy, most common miss with its rule or null],
  // e.g. ["7/8 correct.", "Missed: sagging defender → pull up, he gave you the shot."].
  // null when nothing was reviewed.
  function decisionFeedback(score, rules) {
    if (!score || score.total === 0) return null;
    const lines = [score.correct + "/" + score.total + " correct.", null];
    const c = score.topConfusion;
    const rule = c && rules.find(r => r.id === c.ruleId);
    if (rule) lines[1] = "Missed: " + c.situation + " → " + rule.answer + ", " + rule.why + ".";
    return lines;
  }

  // The adjustment rule for a Read the D set: decision accuracy and shot success.
  // Same result shape as levelDecision. A set counts only when its outcomes and
  // its decisions were logged, with at least levelMinAttempts shots and decisions.
  function readTheDLevelDecision(level, set, cfg) {
    const decisions = set && set.extra && Array.isArray(set.extra.decisions) ? set.extra.decisions : [];
    const logged = set && set.made !== null && set.attempted !== null && set.lostHandles !== null &&
      set.missedCalls !== null && set.reps > 0 && decisions.length > 0 && decisions.every(isReviewed);
    if (!logged) return { level, change: "skipped" };
    if (set.attempted < cfg.levelMinAttempts || decisions.length < cfg.levelMinAttempts) return { level, change: "tooFew" };
    const eps = 1e-9;
    const accuracy = scoreDecisions(decisions).accuracy;
    const success = set.made / set.attempted;
    const errorRate = (set.lostHandles + set.missedCalls) / set.reps;
    // Step down is checked first, so a set with too many errors never steps up.
    let change = "hold";
    if (accuracy < cfg.readTheDLevelDownAccuracy - eps || errorRate >= cfg.readTheDLevelDownErrorRate - eps) change = "down";
    else if (accuracy >= cfg.readTheDLevelUpAccuracy - eps && success >= cfg.readTheDLevelUpSuccess - eps) change = "up";
    if (change === "up" && level >= LEVEL_COUNT) return { level: LEVEL_COUNT, change: "atTop" };
    if (change === "down" && level <= 1) return { level: 1, change: "atBottom" };
    return { level: level + (change === "up" ? 1 : change === "down" ? -1 : 0), change };
  }

  // Read the D scoring: accuracy, per-action breakdown, most common miss,
  // the rest-screen lines and the level rule.
  function decisionSelfTest(check) {
    const t = TRAINING_DEFAULTS;
    const rules = t.readTheD.rules;
    const d = (correct, actual, situation, ruleId) => ({ rep: 1, read: 1, ids: ["D_SET"], state: {}, correct, actual,
      situation: situation || "x", ruleId: ruleId || "x" });
    const sag = (actual) => d("PULL_UP", actual, "sagging defender", "gaveShot");
    const sf = [];
    // 8 decisions, 7 right; one sagging defender driven anyway.
    const set8 = [sag("PULL_UP"), sag("DRIVE_LEFT"), d("DRIVE_LEFT", "DRIVE_LEFT"), d("DRIVE_RIGHT", "DRIVE_RIGHT"),
      d("CREATE_SPACE", "CREATE_SPACE"), d("DRIVE_RIGHT", "DRIVE_RIGHT"), d("PULL_UP", "PULL_UP"), d("CREATE_SPACE", "CREATE_SPACE")];
    const s8 = scoreDecisions(set8);
    if (s8.total !== 8 || s8.correct !== 7 || Math.abs(s8.accuracy - 7 / 8) > 1e-9) sf.push("7/8 accuracy");
    if (s8.byAction.PULL_UP.total !== 3 || s8.byAction.PULL_UP.correct !== 2 || s8.byAction.DRIVE_RIGHT.correct !== 2 ||
        s8.byAction.CREATE_SPACE.total !== 2) sf.push("per action");
    const fb = decisionFeedback(s8, rules);
    if (!fb || fb[0] !== "7/8 correct." || fb[1] !== "Missed: sagging defender → pull up, he gave you the shot.") sf.push("feedback " + fb);
    if (confusionText(s8.topConfusion) !== "sagging defender → you drove anyway") sf.push("confusion " + confusionText(s8.topConfusion));
    // Most common: two closing-defender misses (one each way counts as the same "wrong way" kind) beat one sag miss.
    const close = actual => d("DRIVE_LEFT", actual, "closing defender", "closing");
    const top = scoreDecisions([sag("DRIVE_RIGHT"), close("DRIVE_RIGHT"), close("DRIVE_RIGHT"), close("FROZE")]).topConfusion;
    if (!top || top.situation !== "closing defender" || top.count !== 2 || confusionText(top) !== "closing defender → you drove the wrong way (2×)") {
      sf.push("most common " + (top && confusionText(top)));
    }
    const allRight = decisionFeedback(scoreDecisions([sag("PULL_UP")]), rules);
    if (!allRight || allRight[0] !== "1/1 correct." || allRight[1] !== null) sf.push("all correct");
    const skipped = scoreDecisions([sag(null), sag(undefined)]);
    if (skipped.total !== 0 || skipped.accuracy !== null || decisionFeedback(skipped, rules) !== null) sf.push("not reviewed");
    if (didText("PULL_UP", "FROZE") !== "you froze" || didText("DRIVE_LEFT", "CREATE_SPACE") !== "you created space") sf.push("did text");
    check("read the d scoring: accuracy, per-action breakdown, most common miss and the rest-screen lines", sf);

    const lf = [];
    const set = (made, attempted, lost, missed, reps, right, wrong, unreviewed) => ({
      made, attempted, lostHandles: lost, missedCalls: missed, reps,
      extra: { decisions: Array(right).fill(sag("PULL_UP")).concat(Array(wrong).fill(sag("FROZE")), Array(unreviewed || 0).fill(sag(null))) },
    });
    [
      ["up: 17/20 right, 6/10 made", 3, set(6, 10, 0, 0, 10, 17, 3), 4, "up"],
      ["hold: 84% right", 3, set(10, 10, 0, 0, 100, 84, 16), 3, "hold"],
      ["hold: 59% made", 3, set(59, 100, 0, 0, 100, 90, 10), 3, "hold"],
      ["down: 64% right", 3, set(10, 10, 0, 0, 100, 64, 36), 2, "down"],
      ["hold: exactly 65% right", 3, set(5, 10, 0, 0, 20, 13, 7), 3, "hold"],
      ["down: error rate 0.30", 3, set(10, 10, 2, 1, 10, 10, 0), 2, "down"],
      ["clamped at 5", 5, set(10, 10, 0, 0, 10, 10, 0), 5, "atTop"],
      ["clamped at 1", 1, set(0, 10, 0, 0, 10, 0, 10), 1, "atBottom"],
      ["too few shots", 3, set(4, 4, 0, 0, 8, 8, 0), 3, "tooFew"],
      ["decisions not reviewed", 3, set(8, 8, 0, 0, 8, 7, 0, 1), 3, "skipped"],
      ["skipped set", 3, set(null, null, null, null, 8, 8, 0), 3, "skipped"],
    ].forEach(c => {
      const r = levelDecisionFor("readTheD", c[1], c[2], t);
      if (r.level !== c[3] || r.change !== c[4]) lf.push(c[0] + ": got " + r.level + " " + r.change);
    });
    if (levelDecisionFor("drive", 3, set(8, 10, 1, 0, 10, 0, 0), t).change !== "up") lf.push("drive still uses its own rule");
    check("read the d levels: up at >= 85% right and >= 60% made, down below 65% right or at >= 0.30 errors per rep", lf);
  }

  PROFILES.readTheD.levelDecision = readTheDLevelDecision;
  P.registerSuite(decisionSelfTest);

  Object.assign(P, {
    RTD_REVIEW_ACTIONS,
    scoreDecisions,
    confusionText,
    decisionFeedback,
    readTheDLevelDecision,
  });
})(OffensePlanner);
