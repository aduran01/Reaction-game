// Drive drill: READY -> read time -> LEFT/RIGHT -> CUT OFF / LAY UP ... ->
// finisher, inside a drive window. Defaults, phrases, levels, state machine,
// planner, validation, fit table, self-test and profile. Pure (see js/core/planner.js).
(function (P) {
  "use strict";
  const { OFFENSE_DEFAULTS, TRAINING_DEFAULTS, EPS, cloneSettings, durationsFor, randomInt, sumOf, cheapest,
    fitRateIn, minWindowIn, pickWeighted, scheduleCalls, isWhole, isNonNegative } = P;

  // Drive settings (top-level keys of OFFENSE_DEFAULTS; speech settings are in core).
  Object.assign(OFFENSE_DEFAULTS, {
    // Drive window D (ms). Picked uniformly in this range each time LEFT/RIGHT is called.
    driveMinMs: 1400,
    driveMaxMs: 2000,

    // Read time: wait after READY before the drive starts (ms), uniform in this range.
    // A wide range keeps the drive call unpredictable.
    readMinMs: 800, // provisional
    readMaxMs: 3500, // provisional

    // Wait after a drive ends before READY is called again (ms).
    resetPauseMs: 1000,

    // The finisher must finish being spoken this long before D ends (ms).
    finisherBufferMs: 0,

    // Caps per drive. A pick that would exceed a cap is not allowed.
    maxCutOffsPerDrive: 3,
    maxLayUpsPerDrive: 2,

    // Pick weights (any non-negative numbers). Normalized at pick time,
    // after illegal and non-fitting choices have been removed.
    startWeights: { LEFT: 50, RIGHT: 50 },
    afterDriveOrCutOffWeights: {
      CUT_OFF: 20, LAY_UP: 20, LAY_UP_LEFT_SIDE: 20, LAY_UP_RIGHT_SIDE: 20, LAY_UP_CENTER_SIDE: 20,
    },
    afterLayUpWeights: { CUT_OFF: 25, LEFT_SIDE: 25, RIGHT_SIDE: 25, CENTER_SIDE: 25 },
  });

  // Drive phrases (READY, LEFT and RIGHT are shared, in core).
  Object.assign(OFFENSE_DEFAULTS.phrases, {
    CUT_OFF:            { display: "CUT OFF",            spoken: "cut off",            estMs: 450 },
    LAY_UP:             { display: "LAY UP",             spoken: "lay up",             estMs: 450 },
    LEFT_SIDE:          { display: "LEFT SIDE",          spoken: "left side",          estMs: 650 },
    RIGHT_SIDE:         { display: "RIGHT SIDE",         spoken: "right side",         estMs: 650 },
    CENTER_SIDE:        { display: "CENTER SIDE",        spoken: "center side",        estMs: 750 },
    LAY_UP_LEFT_SIDE:   { display: "LAY UP LEFT SIDE",   spoken: "lay up left side",   estMs: 1000 },
    LAY_UP_RIGHT_SIDE:  { display: "LAY UP RIGHT SIDE",  spoken: "lay up right side",  estMs: 1000 },
    LAY_UP_CENTER_SIDE: { display: "LAY UP CENTER SIDE", spoken: "lay up center side", estMs: 1100 },
  });

  // Five levels, Level 1 easiest (see js/core/levels.js).
  TRAINING_DEFAULTS.levels.drive = [
    { driveMinMs: 2200, driveMaxMs: 2800, readMinMs: 2000, readMaxMs: 3500,
      "afterDriveOrCutOffWeights.CUT_OFF": 10, "afterDriveOrCutOffWeights.LAY_UP": 10 }, // provisional
    { driveMinMs: 1900, driveMaxMs: 2500, readMinMs: 1500, readMaxMs: 3000,
      "afterDriveOrCutOffWeights.CUT_OFF": 15, "afterDriveOrCutOffWeights.LAY_UP": 15 }, // provisional
    { driveMinMs: 1600, driveMaxMs: 2200, readMinMs: 1000, readMaxMs: 2500,
      "afterDriveOrCutOffWeights.CUT_OFF": 20, "afterDriveOrCutOffWeights.LAY_UP": 20 }, // provisional
    { driveMinMs: 1500, driveMaxMs: 2000, readMinMs: 800, readMaxMs: 2000,
      "afterDriveOrCutOffWeights.CUT_OFF": 28, "afterDriveOrCutOffWeights.LAY_UP": 25 }, // provisional
    { driveMinMs: 1400, driveMaxMs: 1800, readMinMs: 600, readMaxMs: 1500,
      "afterDriveOrCutOffWeights.CUT_OFF": 35, "afterDriveOrCutOffWeights.LAY_UP": 30 }, // provisional
  ];

  // ---- State machine (structure, not tuning) ----

  const AFTER_DRIVE = ["CUT_OFF", "LAY_UP", "LAY_UP_LEFT_SIDE", "LAY_UP_RIGHT_SIDE", "LAY_UP_CENTER_SIDE"];
  const AFTER_LAY_UP = ["CUT_OFF", "LEFT_SIDE", "RIGHT_SIDE", "CENTER_SIDE"];

  const NEXT = {
    READ: ["LEFT", "RIGHT"],
    LEFT: AFTER_DRIVE,
    RIGHT: AFTER_DRIVE,
    CUT_OFF: AFTER_DRIVE,
    LAY_UP: AFTER_LAY_UP,
  };

  const LONG_FINISHERS = ["LAY_UP_LEFT_SIDE", "LAY_UP_RIGHT_SIDE", "LAY_UP_CENTER_SIDE"];
  const SHORT_FINISHERS = ["LEFT_SIDE", "RIGHT_SIDE", "CENTER_SIDE"];
  const FINISHERS = new Set(LONG_FINISHERS.concat(SHORT_FINISHERS));

  const WEIGHT_TABLES = ["startWeights", "afterDriveOrCutOffWeights", "afterLayUpWeights"];

  function weightTableKey(state) {
    if (state === "READ") return "startWeights";
    if (state === "LAY_UP") return "afterLayUpWeights";
    return "afterDriveOrCutOffWeights";
  }
  function cheapestFinisherAfter(state, dur) {
    return cheapest(NEXT[state].filter(id => FINISHERS.has(id)), dur);
  }

  // Drive versions: the finisher buffer is kept free.
  function fitRate(ids, D, s, dur) {
    return fitRateIn(ids, D, s.finisherBufferMs, s, dur);
  }

  function minWindowFor(ids, s, dur) {
    return minWindowIn(ids, s.finisherBufferMs, s, dur);
  }

  // Plan one drive: { D, rate, calls: [{ id, startMs, durMs }] }.
  // onPick(state, legal, survivors, pick) is an optional hook for the self-test.
  function planDrive(s, dur, rng, onPick) {
    rng = rng || Math.random;
    const D = randomInt(s.driveMinMs, s.driveMaxMs, rng);
    const path = [];
    const counts = { CUT_OFF: 0, LAY_UP: 0 };
    let state = "READ";

    for (;;) {
      const legal = NEXT[state];
      const survivors = legal.filter(id => {
        if (id === "CUT_OFF" && counts.CUT_OFF >= s.maxCutOffsPerDrive) return false;
        if (id === "LAY_UP" && counts.LAY_UP >= s.maxLayUpsPerDrive) return false;
        const seq = path.concat(id);
        if (!FINISHERS.has(id)) seq.push(cheapestFinisherAfter(id, dur));
        return fitRate(seq, D, s, dur) !== null;
      });
      if (survivors.length === 0) {
        throw new Error("No call fits after " + state + " in a " + D + " ms drive");
      }

      let pick = pickWeighted(survivors, s[weightTableKey(state)], rng);
      if (pick === null) {
        // Every survivor has weight 0: fall back to the cheapest fitting finisher
        // (or the cheapest drive direction when choosing LEFT/RIGHT).
        const finishers = survivors.filter(id => FINISHERS.has(id));
        pick = cheapest(finishers.length ? finishers : survivors, dur);
      }
      if (onPick) onPick(state, legal, survivors, pick);

      path.push(pick);
      if (pick in counts) counts[pick]++;
      state = pick;
      if (FINISHERS.has(pick)) break;
    }

    const rate = fitRate(path, D, s, dur);
    return { D, rate, calls: scheduleCalls(path, D, rate, s.finisherBufferMs, dur) };
  }

  // One Drive rep: READY (id READ) at 0, the read time (s.readMinMs..s.readMaxMs),
  // then the drive window, then the reset pause.
  function planDriveRep(s, dur, rng, onPick) {
    rng = rng || Math.random;
    const readMs = randomInt(s.readMinMs, s.readMaxMs, rng);
    const drive = planDrive(s, dur, rng, onPick);
    const calls = [{ id: "READ", atMs: 0, durMs: dur.READ / s.baseRate, rate: s.baseRate }];
    drive.calls.forEach(c => {
      calls.push({ id: c.id, atMs: readMs + c.startMs, durMs: c.durMs, rate: drive.rate });
    });
    return {
      calls,
      windows: [{ startMs: readMs, durMs: drive.D }],
      endMs: readMs + drive.D,
      restMs: s.resetPauseMs,
    };
  }

  // The shortest possible drive: cheapest LEFT/RIGHT plus its cheapest finisher.
  function shortestDrive(dur) {
    const start = cheapest(NEXT.READ, dur);
    return [start, cheapestFinisherAfter(start, dur)];
  }

  const WEIGHT_TABLE_NAMES = {
    startWeights: "Start weights",
    afterDriveOrCutOffWeights: "After LEFT / RIGHT / CUT OFF weights",
    afterLayUpWeights: "After LAY UP weights",
  };

  // Drive settings check. Returns null, or { field: "drive" | "advanced" | "speech", message }.
  function validateOffense(s, dur) {
    const drive = message => ({ field: "drive", message });
    const advanced = message => ({ field: "advanced", message });
    const speech = message => ({ field: "speech", message });

    if (!isWhole(s.readMinMs) || !isWhole(s.readMaxMs) || s.readMinMs < 100 || s.readMaxMs < 100) {
      return drive("Read times must be whole numbers of at least 100 ms.");
    }
    if (s.readMinMs > s.readMaxMs) return drive("Min read time must not exceed max read time.");

    if (!isWhole(s.driveMinMs) || s.driveMinMs < 600) {
      return drive("Min drive window must be a whole number of at least 600 ms.");
    }
    if (!isWhole(s.driveMaxMs) || s.driveMaxMs < s.driveMinMs) {
      return drive("Min drive window must not exceed max drive window.");
    }
    if (!isNonNegative(s.resetPauseMs)) return advanced("Reset pause must be 0 ms or more.");
    if (!(s.baseRate >= 0.5 && s.baseRate <= 2) || !(s.maxRate >= 0.5 && s.maxRate <= 2)) {
      return speech("Speech rates must be between 0.5 and 2.0.");
    }
    if (s.baseRate > s.maxRate) return speech("Base speech rate must not exceed max speech rate.");
    if (!isNonNegative(s.minGapMs)) return speech("Min gap must be 0 ms or more.");
    if (!isNonNegative(s.finisherBufferMs)) return advanced("Finisher buffer must be 0 ms or more.");
    if (!isNonNegative(s.speechLeadMs)) return speech("Speech lead must be 0 ms or more.");
    if (!isWhole(s.maxCutOffsPerDrive) || s.maxCutOffsPerDrive < 0 || s.maxCutOffsPerDrive > 3) {
      return advanced("Max cut offs per drive must be a whole number from 0 to 3.");
    }
    if (!isWhole(s.maxLayUpsPerDrive) || s.maxLayUpsPerDrive < 0 || s.maxLayUpsPerDrive > 5) {
      return advanced("Max lay ups per drive must be a whole number from 0 to 5.");
    }
    for (const key of WEIGHT_TABLES) {
      const table = s[key];
      const ids = Object.keys(table);
      if (!ids.every(id => isNonNegative(table[id]))) {
        return advanced(WEIGHT_TABLE_NAMES[key] + ": every weight must be a number of 0 or more.");
      }
      if (!(sumOf(ids, table) > 0)) {
        return advanced(WEIGHT_TABLE_NAMES[key] + " must add up to more than 0.");
      }
    }

    const shortest = shortestDrive(dur);
    if (fitRate(shortest, s.driveMinMs, s, dur) === null) {
      const need = Math.ceil(minWindowFor(shortest, s, dur));
      const names = shortest.map(id => s.phrases[id].display).join(" + ");
      return drive("The shortest drive (" + names + ") needs a window of at least " + need +
        " ms at max speech rate " + s.maxRate + ". Raise the min drive window or the max speech rate.");
    }
    return null;
  }
  // Minimum drive window needed at maxRate for 0-3 cut-offs and each finisher.
  function fitTable(s, dur) {
    const start = NEXT.READ.reduce((a, b) => (dur[b] < dur[a] ? b : a));
    const rows = [];
    for (let cutOffs = 0; cutOffs <= 3; cutOffs++) {
      LONG_FINISHERS.concat(SHORT_FINISHERS).forEach(fin => {
        const ids = [start];
        for (let i = 0; i < cutOffs; i++) ids.push("CUT_OFF");
        if (SHORT_FINISHERS.indexOf(fin) !== -1) ids.push("LAY_UP");
        ids.push(fin);
        const need = Math.ceil(minWindowFor(ids, s, dur));
        rows.push({
          cutOffs,
          finisher: s.phrases[fin].display,
          sequence: ids.map(id => s.phrases[id].display).join(" > "),
          minWindowMs: need,
          fitsAtDriveMax: need <= s.driveMaxMs ? "yes" : "no",
        });
      });
    }
    return rows;
  }

  // Drive self-test. check(name, failures) records one PASS/FAIL line.
  function driveSelfTest(check, drives) {
    const defaults = cloneSettings(OFFENSE_DEFAULTS);
    const dur = durationsFor(defaults, null);
    const tight = Object.assign(cloneSettings(defaults), { driveMinMs: 1400, driveMaxMs: 1400, maxRate: 2, minGapMs: 40 });
    const loose = Object.assign(cloneSettings(defaults), { driveMinMs: 30000, driveMaxMs: 30000, maxRate: 2 });

    [["default", defaults], ["tight", tight]].forEach(pair => {
      const label = pair[0];
      const s = pair[1];
      const settingsError = validateOffense(s, dur);
      check(label + ": settings pass validation", settingsError ? [settingsError.message] : []);

      const f = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], plan: [] };
      for (let n = 0; n < drives; n++) {
        let plan;
        try {
          plan = planDrive(s, dur, Math.random);
        } catch (e) {
          f.plan.push(e.message);
          continue;
        }
        const ids = plan.calls.map(c => c.id);
        const where = ids.join(" > ");

        if (NEXT.READ.indexOf(ids[0]) === -1) f[1].push(where);

        const seq = ["READ"].concat(ids);
        for (let i = 1; i < seq.length; i++) {
          if (FINISHERS.has(seq[i - 1]) || !NEXT[seq[i - 1]] || NEXT[seq[i - 1]].indexOf(seq[i]) === -1) {
            f[2].push(where);
            break;
          }
        }

        const last = ids[ids.length - 1];
        const prev = ids[ids.length - 2];
        const expected = prev === "LAY_UP" ? SHORT_FINISHERS : LONG_FINISHERS;
        if (ids.filter(id => FINISHERS.has(id)).length !== 1 || expected.indexOf(last) === -1) f[3].push(where);

        const cuts = ids.filter(id => id === "CUT_OFF").length;
        const layUps = ids.filter(id => id === "LAY_UP").length;
        if (cuts > s.maxCutOffsPerDrive || layUps > s.maxLayUpsPerDrive) f[4].push(where);

        if (plan.D < s.driveMinMs || plan.D > s.driveMaxMs ||
            plan.rate < s.baseRate - EPS || plan.rate > s.maxRate + EPS) {
          f[5].push("D=" + plan.D + " rate=" + plan.rate);
        }

        const avail = plan.D - s.finisherBufferMs;
        plan.calls.forEach((c, i) => {
          const end = c.startMs + c.durMs;
          if (c.startMs < -EPS || end > avail + EPS) f[6].push(where + " (" + c.id + " outside window)");
          if (i > 0) {
            const p = plan.calls[i - 1];
            const gap = c.startMs - (p.startMs + p.durMs);
            if (gap < s.minGapMs - EPS) f[6].push(where + " (gap " + gap.toFixed(1) + " ms)");
          }
        });
      }

      check(label + ": every drive could be planned", f.plan);
      check(label + ": 1. drive starts with LEFT or RIGHT after READY", f[1]);
      check(label + ": 2. every transition is legal, nothing after a finisher", f[2]);
      check(label + ": 3. exactly one finisher, legal for the previous call", f[3]);
      check(label + ": 4. cut-offs <= " + s.maxCutOffsPerDrive + ", lay-ups <= " + s.maxLayUpsPerDrive, f[4]);
      check(label + ": 5. D within drive window, rate within base..max", f[5]);
      check(label + ": 6. calls inside [0, D - buffer], no overlap, gaps >= minGap", f[6]);
    });

    // 7. With loose timing, picks made with every legal choice available
    // should match the weights.
    const tallies = {};
    for (let n = 0; n < drives * 4; n++) {
      planDrive(loose, dur, Math.random, (state, legal, survivors, pick) => {
        if (survivors.length !== legal.length) return;
        const key = weightTableKey(state);
        tallies[key] = tallies[key] || { total: 0, picks: {} };
        tallies[key].total++;
        tallies[key].picks[pick] = (tallies[key].picks[pick] || 0) + 1;
      });
    }
    const freqFailures = [];
    WEIGHT_TABLES.forEach(key => {
      const table = loose[key];
      const weightSum = sumOf(Object.keys(table), table);
      const t = tallies[key];
      if (!t) {
        freqFailures.push(key + ": no samples");
        return;
      }
      Object.keys(table).forEach(id => {
        const want = table[id] / weightSum;
        const got = (t.picks[id] || 0) / t.total;
        if (Math.abs(got - want) > 0.02) {
          freqFailures.push(key + "." + id + " expected " + want.toFixed(3) + " got " + got.toFixed(3));
        }
      });
    });
    check("loose: 7. pick frequencies match the weights (within 2 points)", freqFailures);

    // The rep wrapper the runner executes: READY at 0, then the drive inside its window.
    const repSettings = defaults;
    const repFailures = [];
    let shortestRead = Infinity;
    let longestRead = 0;
    for (let n = 0; n < drives; n++) {
      const rep = planDriveRep(repSettings, dur, Math.random);
      const w = rep.windows[0];
      const first = rep.calls[0];
      shortestRead = Math.min(shortestRead, w.startMs);
      longestRead = Math.max(longestRead, w.startMs);
      if (first.id !== "READ" || first.atMs !== 0 || first.rate !== repSettings.baseRate) repFailures.push("READY not first");
      if (rep.windows.length !== 1 || w.startMs < repSettings.readMinMs || w.startMs > repSettings.readMaxMs) {
        repFailures.push("read time " + w.startMs);
      }
      if (rep.calls[1].atMs !== w.startMs) repFailures.push("LEFT/RIGHT not at window start");
      if (rep.endMs !== w.startMs + w.durMs || rep.restMs !== repSettings.resetPauseMs) repFailures.push("endMs/restMs");
      rep.calls.slice(1).forEach(c => {
        if (c.atMs < w.startMs - EPS || c.atMs + c.durMs > w.startMs + w.durMs + EPS) repFailures.push(c.id + " outside window");
      });
    }
    // The read time should use (nearly) the whole range, not cluster in the middle.
    const span = repSettings.readMaxMs - repSettings.readMinMs;
    if (shortestRead > repSettings.readMinMs + span * 0.02 || longestRead < repSettings.readMaxMs - span * 0.02) {
      repFailures.push("read times only spread " + shortestRead + "-" + longestRead);
    }
    check("drive rep: READY at 0, read time spread over " + repSettings.readMinMs + "-" + repSettings.readMaxMs +
      " ms, calls inside the window", repFailures);

    return fitTable(defaults, dur);
  }

  // A wide read time keeps the drive call unpredictable.
  function driveDefaultsSelfTest(check) {
    const s = OFFENSE_DEFAULTS;
    const f = s.readMaxMs - s.readMinMs < 2000 ? ["read time range " + s.readMinMs + "-" + s.readMaxMs] : [];
    check("defaults: the Drive read time range is at least 2000 ms wide", f);
  }

  P.registerDrill({
    id: "drive",
    phraseIds: ["READ"].concat(NEXT.READ, AFTER_DRIVE, SHORT_FINISHERS),
    next: NEXT,
    weightTables: WEIGHT_TABLES,
    planRep: planDriveRep,
    validate: validateOffense,
    fitTable,
    levelled: true,
    levelWindow: s => s.driveMaxMs,
    selfTest: (check, reps) => {
      const table = driveSelfTest(check, reps);
      driveDefaultsSelfTest(check);
      return table;
    },
  });

  Object.assign(P, {
    NEXT,
    FINISHERS,
    LONG_FINISHERS,
    SHORT_FINISHERS,
    WEIGHT_TABLES,
    fitRate,
    minWindowFor,
    planDrive,
    planDriveRep,
    validateOffense,
    fitTable,
  });
})(OffensePlanner);
