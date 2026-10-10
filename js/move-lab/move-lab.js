// Move Lab drill: a start call -> LEFT / RIGHT -> the picked moves -> SHOT.
// Defaults, phrases, the move list, planner, validation, self-test and profile.
// Pure (see js/core/planner.js). Its start-screen picker is in move-lab-ui.js.
(function (P) {
  "use strict";
  const { OFFENSE_DEFAULTS, TRAINING_DEFAULTS, EPS, DIRECTIONS, cloneSettings, durationsFor, randomInt, randomOf,
    pickWeighted, isWhole, isNonNegative, isWholeNonNegative, validateSpeech, hasKey } = P;

  // ---------------------------------------------------------------
  // Move Lab drill: a start call (SPRINT FROM LEFT / RIGHT CORNER or CATCH),
  // LEFT / RIGHT, then 1..maxMovesPerRep of the picked moves, then SHOT.
  // Every call is spoken at baseRate.
  // ---------------------------------------------------------------
  OFFENSE_DEFAULTS.moveLab = {
    // The moves picked on the start screen (TRAINING_DEFAULTS.moves ids). Each
    // move call is one of these, picked uniformly at random.
    moveIds: ["CROSSOVER", "HESI"],
    // Most moves called in one rep before SHOT (whole number 1-6). Every rep has at least one.
    maxMovesPerRep: 3,
    // Get-set time (ms) from the start of the start call to LEFT / RIGHT, uniform in
    // the range. Silently raised to at least the start call's length (at baseRate) +
    // minGapMs. Each min is at least that length at the defaults (1.25, 120 ms).
    getSetMs: {
      SPRINT_FROM_LEFT_CORNER:  { minMs: 1000, maxMs: 2300 }, // provisional
      SPRINT_FROM_RIGHT_CORNER: { minMs: 1040, maxMs: 2300 }, // provisional
      CATCH:                    { minMs: 440,  maxMs: 1100 }, // provisional
    },
    // Silence from the end of LEFT / RIGHT to the first move (ms), uniform in this range.
    firstMoveGapMinMs: 150,
    firstMoveGapMaxMs: 400,
    // Silence from the end of a move to the next move or SHOT (ms), uniform in this range.
    moveGapMinMs: 800, // provisional
    moveGapMaxMs: 1500, // provisional
    // After a move, while under maxMovesPerRep: another move or SHOT.
    // At maxMovesPerRep moves SHOT always follows.
    afterMoveWeights: { MOVE: 50, SHOT: 50 }, // provisional
    // Wait after SHOT has been spoken before the next start call (ms).
    resetPauseMs: 1000,
  };

  // Move Lab start calls and SHOT (LEFT and RIGHT are shared, in core).
  Object.assign(OFFENSE_DEFAULTS.phrases, {
    SPRINT_FROM_LEFT_CORNER:  { display: "SPRINT FROM LEFT CORNER",  spoken: "sprint from left corner",  estMs: 1100 },
    SPRINT_FROM_RIGHT_CORNER: { display: "SPRINT FROM RIGHT CORNER", spoken: "sprint from right corner", estMs: 1150 },
    CATCH:                    { display: "CATCH",                    spoken: "catch",                    estMs: 400 },
    SHOT:                     { display: "SHOT",                     spoken: "shot",                     estMs: 350 },
  });

  Object.assign(TRAINING_DEFAULTS, {
    // Reps per set for Move Lab (whole number 3-30); the other drills use repsPerSet.
    moveLabRepsPerSet: 10,
    // Every move the app can call. Edit freely: id (unique, A-Z and _), display (on
    // screen), spoken (sent to the voice), type "handle" | "shot", and estMs (rough
    // spoken length at rate 1.0; learned lengths replace it, as for every phrase).
    // Each move is added to OFFENSE_DEFAULTS.phrases under its id.
    moves: [
      { id: "CROSSOVER",        display: "CROSSOVER",        spoken: "crossover",        type: "handle", estMs: 650 },
      { id: "BETWEEN_THE_LEGS", display: "BETWEEN THE LEGS", spoken: "between the legs", type: "handle", estMs: 850 },
      { id: "BEHIND_THE_BACK",  display: "BEHIND THE BACK",  spoken: "behind the back",  type: "handle", estMs: 850 },
      { id: "HESI",             display: "HESI",             spoken: "hesi",             type: "handle", estMs: 450 },
      { id: "IN_AND_OUT",       display: "IN AND OUT",       spoken: "in and out",       type: "handle", estMs: 650 },
      { id: "SPIN",             display: "SPIN",             spoken: "spin",             type: "handle", estMs: 350 },
      { id: "PULL_UP",          display: "PULL UP",          spoken: "pull up",          type: "shot",   estMs: 450 },
      { id: "STEP_BACK",        display: "STEP BACK",        spoken: "step back",        type: "shot",   estMs: 550 },
    ],
  });

  // Each move is also a phrase (shared table, so learned lengths work for it too).
  TRAINING_DEFAULTS.moves.forEach(m => {
    OFFENSE_DEFAULTS.phrases[m.id] = { display: m.display, spoken: m.spoken, estMs: m.estMs };
  });

  // ===================================================================
  // Move Lab: start call -> LEFT/RIGHT -> move [-> move ...] -> SHOT.
  // The moves come from the player's pick (s.moveLab.moveIds); a rep has
  // 1..maxMovesPerRep of them. Every call is spoken at baseRate, one after
  // the other, so no call can overlap another.
  // ===================================================================

  const MOVE_LAB_START_CALLS = ["SPRINT_FROM_LEFT_CORNER", "SPRINT_FROM_RIGHT_CORNER", "CATCH"];
  const MOVE_TYPES = ["handle", "shot"];
  // Hard limits for the moves-per-rep field.
  const MOVE_LAB_MIN_MOVES = 1;
  const MOVE_LAB_MAX_MOVES = 6;

  // MOVE stands for any picked move. REP_START is the state before the first call.
  const MOVE_LAB_NEXT = {
    REP_START: MOVE_LAB_START_CALLS,
    SPRINT_FROM_LEFT_CORNER: DIRECTIONS,
    SPRINT_FROM_RIGHT_CORNER: DIRECTIONS,
    CATCH: DIRECTIONS,
    LEFT: ["MOVE"],
    RIGHT: ["MOVE"],
    MOVE: ["MOVE", "SHOT"],
  };

  function findMove(id, t) {
    return t.moves.find(m => m.id === id) || null;
  }

  // One Move Lab rep as a rep plan. onPick(state, legal, pick) is an optional
  // hook for the self-test, called for every MOVE-or-SHOT decision.
  function planMoveLabRep(s, dur, rng, onPick) {
    rng = rng || Math.random;
    const ml = s.moveLab;
    const base = s.baseRate;
    const calls = [];
    const say = (id, atMs) => {
      const c = { id, atMs, durMs: dur[id] / base, rate: base };
      calls.push(c);
      return c.atMs + c.durMs;  // when it has been spoken
    };

    const start = randomOf(MOVE_LAB_START_CALLS, rng);
    const startEnd = say(start, 0);

    // Get-set time, measured from the start of the start call and clamped so
    // LEFT / RIGHT can never overlap the start call.
    const getSet = ml.getSetMs[start];
    const dirAt = Math.max(randomInt(getSet.minMs, getSet.maxMs, rng), startEnd + s.minGapMs);
    const dirEnd = say(randomOf(DIRECTIONS, rng), dirAt);

    let at = dirEnd + randomInt(ml.firstMoveGapMinMs, ml.firstMoveGapMaxMs, rng);
    const moves = [];
    for (;;) {
      const id = randomOf(ml.moveIds, rng);
      moves.push(id);
      const end = say(id, at);
      at = end + randomInt(ml.moveGapMinMs, ml.moveGapMaxMs, rng);
      const legal = moves.length < ml.maxMovesPerRep ? MOVE_LAB_NEXT.MOVE : ["SHOT"];
      const next = pickWeighted(legal, ml.afterMoveWeights, rng) || "SHOT";
      if (onPick) onPick("MOVE", legal, next);
      if (next === "SHOT") break;
    }
    const shotEnd = say("SHOT", at);

    return {
      calls,
      // The bar drains from LEFT / RIGHT until SHOT has been spoken.
      windows: [{ startMs: dirAt, durMs: shotEnd - dirAt }],
      endMs: shotEnd,
      restMs: ml.resetPauseMs,
      moves,
    };
  }

  // Move Lab settings check. Returns null, or { field: "speech" | "moveLab", message }.
  function validateMoveLab(s, dur) {
    const main = message => ({ field: "moveLab", message });
    const speechError = validateSpeech(s);
    if (speechError) return speechError;
    const ml = s.moveLab;
    const ids = ml.moveIds;
    if (!Array.isArray(ids) || ids.length === 0) return main("Pick at least one move.");
    if (!ids.every(id => findMove(id, TRAINING_DEFAULTS) && hasKey(s.phrases, id) && dur[id] > 0)) {
      return main("Pick moves from the list.");
    }
    if (new Set(ids).size !== ids.length) return main("Pick each move only once.");
    if (!isWhole(ml.maxMovesPerRep) || ml.maxMovesPerRep < MOVE_LAB_MIN_MOVES || ml.maxMovesPerRep > MOVE_LAB_MAX_MOVES) {
      return main("Moves per rep must be a whole number from " + MOVE_LAB_MIN_MOVES + " to " + MOVE_LAB_MAX_MOVES + ".");
    }
    if (!isWholeNonNegative(ml.moveGapMinMs) || !isWholeNonNegative(ml.moveGapMaxMs)) {
      return main("Gap between moves: min and max must be whole numbers of 0 ms or more.");
    }
    if (ml.moveGapMinMs > ml.moveGapMaxMs) return main("Gap between moves: min must not exceed max.");
    const w = ml.afterMoveWeights;
    if (!isNonNegative(w.MOVE) || !isNonNegative(w.SHOT)) {
      return main("Weights after a move: every weight must be a number of 0 or more.");
    }
    if (!(w.MOVE + w.SHOT > 0)) return main("Weights after a move must add up to more than 0.");
    if (!isWholeNonNegative(ml.resetPauseMs)) return main("Reset pause must be a whole number of 0 ms or more.");

    for (const id of MOVE_LAB_START_CALLS) {
      const range = ml.getSetMs[id];
      const name = "Get-set after " + s.phrases[id].display;
      if (!isWholeNonNegative(range.minMs) || !isWholeNonNegative(range.maxMs) || range.minMs > range.maxMs) {
        return main(name + " needs a min and max of 0 ms or more, min not above max.");
      }
    }
    if (!isWholeNonNegative(ml.firstMoveGapMinMs) || !isWholeNonNegative(ml.firstMoveGapMaxMs) ||
        ml.firstMoveGapMinMs > ml.firstMoveGapMaxMs) {
      return main("Gap before the first move: min and max must be whole numbers of 0 ms or more, min not above max.");
    }
    return null;
  }

  // ---- Self-test support (only called from ?selftest=1) ----

  // Move Lab: move list, validation, plans and the move-or-shot weights.
  function moveLabSelfTest(check, reps) {
    const t = TRAINING_DEFAULTS;
    const defaults = cloneSettings(OFFENSE_DEFAULTS);
    const dur = durationsFor(defaults, null);
    const allIds = t.moves.map(m => m.id);

    // 1. The move list and its phrases.
    const lf = [];
    const want = ["CROSSOVER:handle", "BETWEEN_THE_LEGS:handle", "BEHIND_THE_BACK:handle", "HESI:handle",
      "IN_AND_OUT:handle", "SPIN:handle", "PULL_UP:shot", "STEP_BACK:shot"];
    if (t.moves.map(m => m.id + ":" + m.type).join() !== want.join()) lf.push("move list " + allIds);
    const seen = {};
    t.moves.forEach(m => {
      if (seen[m.id]) lf.push("duplicate id " + m.id);
      seen[m.id] = true;
      if (MOVE_TYPES.indexOf(m.type) === -1) lf.push(m.id + " type " + m.type);
      const p = OFFENSE_DEFAULTS.phrases[m.id];
      if (!p || p.display !== m.display || p.spoken !== m.spoken || p.estMs !== m.estMs || !(m.estMs > 0)) lf.push(m.id + " phrase");
      if (!(dur[m.id] > 0)) lf.push(m.id + " has no length");
    });
    MOVE_LAB_START_CALLS.concat(DIRECTIONS, "SHOT").forEach(id => { if (!(dur[id] > 0)) lf.push(id + " phrase"); });
    defaults.moveLab.moveIds.forEach(id => { if (!findMove(id, t)) lf.push("default move " + id); });
    check("move lab: 8 moves (6 handle, 2 shot), each also a phrase with a length estimate", lf);

    // 2. Validation.
    const vf = [];
    const variant = ml => {
      const s = cloneSettings(defaults);
      Object.assign(s.moveLab, ml || {});
      return s;
    };
    const accepted = [{}, { moveIds: allIds }, { maxMovesPerRep: 1 }, { maxMovesPerRep: 6 },
      { moveGapMinMs: 0, moveGapMaxMs: 0 }, { afterMoveWeights: { MOVE: 0, SHOT: 1 } },
      { afterMoveWeights: { MOVE: 1, SHOT: 0 } }, { resetPauseMs: 0 }].concat(allIds.map(id => ({ moveIds: [id] })));
    accepted.forEach(c => {
      const e = validateMoveLab(variant(c), dur);
      if (e) vf.push("rejected " + JSON.stringify(c) + ": " + e.message);
    });
    const rejected = [
      [{ moveIds: [] }], [{ moveIds: ["DUNK"] }], [{ moveIds: ["SHOT"] }], [{ moveIds: ["HESI", "HESI"] }],
      [{ moveIds: "HESI" }], [{ maxMovesPerRep: 0 }], [{ maxMovesPerRep: 7 }], [{ maxMovesPerRep: 2.5 }],
      [{ maxMovesPerRep: NaN }], [{ moveGapMinMs: 900, moveGapMaxMs: 800 }], [{ moveGapMinMs: -1 }],
      [{ moveGapMaxMs: 1.5 }], [{ afterMoveWeights: { MOVE: 0, SHOT: 0 } }],
      [{ afterMoveWeights: { MOVE: -1, SHOT: 5 } }], [{ afterMoveWeights: { MOVE: NaN, SHOT: 5 } }],
      [{ resetPauseMs: -1 }],
      [{ getSetMs: Object.assign({}, defaults.moveLab.getSetMs, { CATCH: { minMs: 900, maxMs: 800 } }) }],
      [{ firstMoveGapMinMs: 500, firstMoveGapMaxMs: 400 }], [{ firstMoveGapMinMs: -10 }],
    ];
    rejected.forEach(c => {
      const e = validateMoveLab(variant(c[0]), dur);
      if (!e || e.field !== "moveLab") vf.push("accepted " + JSON.stringify(c));
    });
    const speechBad = validateMoveLab(Object.assign(variant(), { baseRate: 3 }), dur);
    if (!speechBad || speechBad.field !== "speech") vf.push("accepted base rate 3");
    check("move lab: picked moves, 1-6 moves per rep, gaps, weights and the get-set time are validated", vf);

    // 3. Plans: start call -> LEFT/RIGHT -> 1..max picked moves -> SHOT, every
    // call at baseRate, never overlapping, with the gaps in their ranges.
    const pf = [];
    const counts = {};
    const seenCalls = {};
    const perMax = Math.max(1, Math.floor(reps / MOVE_LAB_MAX_MOVES));
    for (let max = MOVE_LAB_MIN_MOVES; max <= MOVE_LAB_MAX_MOVES; max++) {
      counts[max] = {};
      for (let i = 0; i < perMax; i++) {
        // A random non-empty subset of the moves.
        let picked = allIds.filter(() => Math.random() < 0.4);
        if (picked.length === 0) picked = [randomOf(allIds, Math.random)];
        const s = variant({ maxMovesPerRep: max, moveIds: picked });
        const ml = s.moveLab;
        const plan = planMoveLabRep(s, dur);
        const c = plan.calls;
        const ids = c.map(x => x.id);
        const where = "max " + max + ": " + ids.join(" > ");
        const end = x => x.atMs + x.durMs;
        const gap = k => c[k].atMs - end(c[k - 1]);
        const nMoves = c.length - 3;
        if (MOVE_LAB_START_CALLS.indexOf(ids[0]) === -1 || c[0].atMs !== 0) pf.push(where + " (start call)");
        if (DIRECTIONS.indexOf(ids[1]) === -1) pf.push(where + " (direction)");
        if (ids[ids.length - 1] !== "SHOT") pf.push(where + " (no SHOT at the end)");
        if (nMoves < 1 || nMoves > max) pf.push(where + " (move count)");
        ids.slice(2, -1).forEach(id => { if (picked.indexOf(id) === -1) pf.push(where + " (unpicked move " + id + ")"); });
        if (plan.moves.join() !== ids.slice(2, -1).join()) pf.push(where + " (moves)");
        counts[max][nMoves] = (counts[max][nMoves] || 0) + 1;
        ids.forEach(id => { seenCalls[id] = true; });

        const getSet = ml.getSetMs[ids[0]];
        const lowest = Math.max(getSet.minMs, end(c[0]) + s.minGapMs);
        const highest = Math.max(getSet.maxMs, end(c[0]) + s.minGapMs);
        if (c[1].atMs < lowest - EPS || c[1].atMs > highest + EPS) pf.push(where + " (get-set " + c[1].atMs + ")");
        if (gap(2) < ml.firstMoveGapMinMs - EPS || gap(2) > ml.firstMoveGapMaxMs + EPS) pf.push(where + " (first move gap " + gap(2) + ")");
        for (let k = 3; k < c.length; k++) {
          if (gap(k) < ml.moveGapMinMs - EPS || gap(k) > ml.moveGapMaxMs + EPS) pf.push(where + " (move gap " + gap(k) + ")");
        }
        c.forEach((x, k) => {
          if (x.rate !== s.baseRate || Math.abs(x.durMs - dur[x.id] / s.baseRate) > EPS) pf.push(where + " (rate)");
          if (k > 0 && x.atMs < end(c[k - 1]) - EPS) pf.push(where + " (overlap)");
        });
        const w = plan.windows;
        if (w.length !== 1 || w[0].startMs !== c[1].atMs || Math.abs(w[0].startMs + w[0].durMs - end(c[c.length - 1])) > EPS ||
            Math.abs(plan.endMs - end(c[c.length - 1])) > EPS || plan.restMs !== ml.resetPauseMs) pf.push(where + " (window)");
      }
      for (let n = 1; n <= max; n++) if (!counts[max][n]) pf.push("max " + max + ": never " + n + " moves");
    }
    MOVE_LAB_START_CALLS.concat(DIRECTIONS, allIds).forEach(id => { if (!seenCalls[id]) pf.push(id + " never called"); });
    check("move lab: start call > LEFT/RIGHT > 1..max picked moves > SHOT, base rate, no overlap, gaps in range", pf);

    // 4. After a move: MOVE vs SHOT by afterMoveWeights; the cap forces SHOT.
    const wf = [];
    const freq = (weights, max) => {
      const s = variant({ afterMoveWeights: weights, maxMovesPerRep: max });
      const tally = { MOVE: 0, SHOT: 0, total: 0, forcedOk: true, moveCounts: {} };
      for (let i = 0; i < reps; i++) {
        const plan = planMoveLabRep(s, dur, Math.random, (state, legal, pick) => {
          if (legal.length === 2) { tally[pick]++; tally.total++; } else if (pick !== "SHOT") tally.forcedOk = false;
        });
        tally.moveCounts[plan.moves.length] = (tally.moveCounts[plan.moves.length] || 0) + 1;
      }
      return tally;
    };
    const d = defaults.moveLab.afterMoveWeights;
    const dt = freq(d, defaults.moveLab.maxMovesPerRep);
    const wantMove = d.MOVE / (d.MOVE + d.SHOT);
    if (Math.abs(dt.MOVE / dt.total - wantMove) > 0.02) wf.push("MOVE share " + (dt.MOVE / dt.total).toFixed(3));
    if (!dt.forcedOk) wf.push("cap not forcing SHOT");
    if (freq({ MOVE: 0, SHOT: 1 }, 4).moveCounts[1] !== reps) wf.push("MOVE weight 0: not always 1 move");
    if (freq({ MOVE: 1, SHOT: 0 }, 4).moveCounts[4] !== reps) wf.push("SHOT weight 0: not always the max");
    check("move lab: MOVE vs SHOT follows the weights (within 2 points); at the max SHOT always follows", wf);
    return null;
  }

  // Every get-set minimum clears the start call + min gap; every range is wide.
  function getSetDefaultsSelfTest(check) {
    const s = OFFENSE_DEFAULTS;
    const gf = [];
    const dur = durationsFor(s, null);
    MOVE_LAB_START_CALLS.forEach(id => {
      const range = s.moveLab.getSetMs[id];
      const need = dur[id] / s.baseRate + s.minGapMs;
      if (range.minMs < need - 1e-9) gf.push(id + " min " + range.minMs + " < " + need);
      if (range.maxMs - range.minMs < 600) gf.push(id + " range only " + (range.maxMs - range.minMs) + " ms");
    });
    check("defaults: Move Lab get-set mins clear the start call + min gap, and each range is at least 600 ms wide", gf);
  }

  P.registerDrill({
    id: "moveLab",
    phraseIds: MOVE_LAB_START_CALLS.concat(DIRECTIONS, TRAINING_DEFAULTS.moves.map(m => m.id), "SHOT"),
    next: MOVE_LAB_NEXT,
    weightTables: ["afterMoveWeights"],
    planRep: planMoveLabRep,
    validate: validateMoveLab,
    fitTable: null,
    repsPerSetKey: "moveLabRepsPerSet",
    selfTest: (check, reps) => {
      moveLabSelfTest(check, reps);
      getSetDefaultsSelfTest(check);
      return null;
    },
  });

  Object.assign(P, {
    MOVE_LAB_START_CALLS,
    MOVE_LAB_NEXT,
    MOVE_LAB_MIN_MOVES,
    MOVE_LAB_MAX_MOVES,
    planMoveLabRep,
    validateMoveLab,
  });
})(OffensePlanner);
