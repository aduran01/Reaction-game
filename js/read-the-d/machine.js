// Read the D rewrite (in progress): a branching state machine where every
// spoken call is followed by a call that a real defender could give next.
// GO -> an entry read (TIGHT / NO OPENING / SAGGING / RETREATING) -> foot,
// hands, cut-off, lane and help calls -> a terminal call (HANDS DOWN or
// LAY ON …) or a silent end on a shot, then one countdown window.
// Pure (see js/core/planner.js). Not wired into the runner or UI yet: it lives
// alongside the current Read the D (read-the-d.js) until the next step.
(function (P) {
  "use strict";
  const { OFFENSE_DEFAULTS, TRAINING_DEFAULTS, EPS, cloneSettings, durationsFor, randomInt, sumOf, pickWeighted,
    isWhole, isNonNegative, isWholeNonNegative, validateSpeech, repPlanProblems } = P;

  // ---------------------------------------------------------------
  // Every tunable number of the machine. Waits are measured from the END of
  // one call to the START of the next, uniform (whole ms) in their range, and
  // never shorter than minGapMs.
  // ---------------------------------------------------------------
  OFFENSE_DEFAULTS.readTheD2 = {
    // Speech rate of every call after GO (0.5 up to maxRate). GO is spoken at baseRate.
    rate: 1.3, // provisional
    waits: {
      read:    { minMs: 800,  maxMs: 3500 }, // provisional: GO -> the entry read
      jab:     { minMs: 900,  maxMs: 2200 }, // provisional: TIGHT -> a foot call
      dribble: { minMs: 1000, maxMs: 2500 }, // provisional: NO OPENING / HANDS UP -> the next read
      quick:   { minMs: 250,  maxMs: 700 },  // provisional: reactions (foot, CUT OFF, CROSSED, SAGGING, RETREATING)
      finish:  { minMs: 500,  maxMs: 1300 }, // provisional: LANE OPEN / HELP D -> the next call
    },
    // The countdown window after the last call (or after a silent end), ms.
    endWindowMs: 1800, // provisional
    // Wait after the window before the next GO (ms).
    resetPauseMs: 1000, // provisional

    // Weights (any non-negative numbers, normalized at pick time).
    entryWeights: { D_TIGHT: 25, D_CUSHION: 30, D_SAG: 25, D_RETREATING: 20 },                    // provisional: after GO
    tightWeights: { D_LEFT_FOOT: 50, D_RIGHT_FOOT: 50 },                                          // provisional: after TIGHT
    noOpeningWeights: { D_LEFT_FOOT: 35, D_RIGHT_FOOT: 35, D_HANDS_DOWN: 30 },                    // provisional: after NO OPENING
    handsUpWeights: { D_CUSHION: 30, D_LEFT_FOOT: 15, D_RIGHT_FOOT: 15, D_HANDS_DOWN: 20, D_SAG: 20 }, // provisional: after HANDS UP
    // HELP D side: the side you are driving to, or the other one.
    helpSideWeights: { drive: 65, other: 35 }, // provisional
    // LAY side: the drive side, center or the other side; the HELP D side (if any) is removed.
    laySideWeights: { drive: 40, center: 30, other: 30 }, // provisional

    // Chances (0-1).
    sagHandsUpChance: 0.20,     // provisional: SAGGING -> HANDS UP (else the rep ends on a shot)
    retreatHandsUpChance: 0.25, // provisional: RETREATING -> HANDS UP (else the rep ends on a shot)
    cutOffChance: 0.35,         // provisional: a foot call -> CUT OFF (else LANE OPEN)
    cutOffAgainChance: 0.45,    // provisional: CUT OFF -> CUT OFF again (else CROSSED)
    helpChance: 0.30,           // provisional: LANE OPEN -> HELP D (else a LAY call)

    // Caps per rep. At the CUT OFF cap a foot call gives LANE OPEN and CUT OFF gives
    // CROSSED; at the HANDS UP cap SAGGING / RETREATING end the rep; HELP D comes at most once.
    maxCutOffsPerRep: 2, // provisional
    maxHandsUpPerRep: 2, // provisional
    maxHelpPerRep: 1,    // provisional (0 or 1)
  };

  // The machine's own calls (D_TIGHT, D_CUSHION = NO OPENING, D_SAG, D_RETREATING,
  // the foot and hands calls are shared with read-the-d.js).
  Object.assign(OFFENSE_DEFAULTS.phrases, {
    D_GO:         { display: "GO",              spoken: "go",                estMs: 300 },
    D_LANE_OPEN:  { display: "LANE OPEN",       spoken: "lane open",         estMs: 650 },
    D_CUT_OFF:    { display: "CUT OFF",         spoken: "cut off",           estMs: 450 },  // not Drive's CUT_OFF
    D_CROSSED:    { display: "CROSSED",         spoken: "crossed",           estMs: 500 },
    D_HELP_LEFT:  { display: "HELP D ON LEFT",  spoken: "help dee on left",  estMs: 900 },
    D_HELP_RIGHT: { display: "HELP D ON RIGHT", spoken: "help dee on right", estMs: 900 },
    D_LAY_LEFT:   { display: "LAY ON LEFT",     spoken: "lay on left",       estMs: 650 },
    D_LAY_RIGHT:  { display: "LAY ON RIGHT",    spoken: "lay on right",      estMs: 650 },
    D_LAY_CENTER: { display: "LAY ON CENTER",   spoken: "lay on center",     estMs: 750 },
  });

  // What each call tells the player (shown in the README; for practice and review later).
  TRAINING_DEFAULTS.readTheD2 = {
    reads: {
      D_GO: "Start: live dribble, the defender is about to show you something.",
      D_TIGHT: "He's up on you, inside arm's reach: wait for his foot.",
      D_CUSHION: "He's at arm's length and set: no lane yet, keep the dribble alive.",
      D_SAG: "He's backed off: the shot is there.",
      D_RETREATING: "He's backing up: the shot is there.",
      D_LEFT_FOOT: "His front foot is on your left: attack that side.",
      D_RIGHT_FOOT: "His front foot is on your right: attack that side.",
      D_HANDS_UP: "He's contesting the shot: keep the dribble, read again.",
      D_HANDS_DOWN: "His hands dropped: rise up and shoot.",
      D_CUT_OFF: "He beat you to the spot: change direction.",
      D_CROSSED: "You crossed him over: you're past him, keep going.",
      D_LANE_OPEN: "The lane is open: get to the rim.",
      D_HELP_LEFT: "Help defender coming from the left: finish away from him.",
      D_HELP_RIGHT: "Help defender coming from the right: finish away from him.",
      D_LAY_LEFT: "Finish on the left side.",
      D_LAY_RIGHT: "Finish on the right side.",
      D_LAY_CENTER: "Finish through the middle.",
    },
  };

  // ---- The machine (structure, not tuning) ----
  // node -> { wait: the wait type before the next call (null when terminal),
  //           next: every call that may follow (null = the rep ends silently on a shot) }
  const LAYS = ["D_LAY_LEFT", "D_LAY_RIGHT", "D_LAY_CENTER"];
  const READTHED_MACHINE = {
    D_GO:         { wait: "read",    next: ["D_TIGHT", "D_CUSHION", "D_SAG", "D_RETREATING"] },
    D_TIGHT:      { wait: "jab",     next: ["D_LEFT_FOOT", "D_RIGHT_FOOT"] },
    D_CUSHION:    { wait: "dribble", next: ["D_LEFT_FOOT", "D_RIGHT_FOOT", "D_HANDS_DOWN"] },
    D_SAG:        { wait: "quick",   next: ["D_HANDS_UP", null] },
    D_RETREATING: { wait: "quick",   next: ["D_HANDS_UP", null] },
    D_LEFT_FOOT:  { wait: "quick",   next: ["D_CUT_OFF", "D_LANE_OPEN"] },
    D_RIGHT_FOOT: { wait: "quick",   next: ["D_CUT_OFF", "D_LANE_OPEN"] },
    D_CUT_OFF:    { wait: "quick",   next: ["D_CUT_OFF", "D_CROSSED"] },
    D_CROSSED:    { wait: "quick",   next: ["D_LANE_OPEN"] },
    D_LANE_OPEN:  { wait: "finish",  next: ["D_HELP_LEFT", "D_HELP_RIGHT"].concat(LAYS) },
    D_HELP_LEFT:  { wait: "finish",  next: ["D_LAY_RIGHT", "D_LAY_CENTER"] },
    D_HELP_RIGHT: { wait: "finish",  next: ["D_LAY_LEFT", "D_LAY_CENTER"] },
    D_HANDS_UP:   { wait: "dribble", next: ["D_CUSHION", "D_LEFT_FOOT", "D_RIGHT_FOOT", "D_HANDS_DOWN", "D_SAG"] },
    D_HANDS_DOWN: { wait: null,      next: [] },
    D_LAY_LEFT:   { wait: null,      next: [] },
    D_LAY_RIGHT:  { wait: null,      next: [] },
    D_LAY_CENTER: { wait: null,      next: [] },
  };
  const WAIT_TYPES = ["read", "jab", "dribble", "quick", "finish"];
  const FOOT_SIDE = { D_LEFT_FOOT: "left", D_RIGHT_FOOT: "right" };
  const HELP_ID = { left: "D_HELP_LEFT", right: "D_HELP_RIGHT" };
  const HELP_SIDE = { D_HELP_LEFT: "left", D_HELP_RIGHT: "right" };
  const LAY_ID = { left: "D_LAY_LEFT", right: "D_LAY_RIGHT", center: "D_LAY_CENTER" };
  const otherSide = side => (side === "left" ? "right" : "left");
  // Node weight tables: which table, and which ids it may name.
  const NODE_TABLES = {
    entryWeights: READTHED_MACHINE.D_GO.next,
    tightWeights: READTHED_MACHINE.D_TIGHT.next,
    noOpeningWeights: READTHED_MACHINE.D_CUSHION.next,
    handsUpWeights: READTHED_MACHINE.D_HANDS_UP.next,
  };
  const CHANCES = ["sagHandsUpChance", "retreatHandsUpChance", "cutOffChance", "cutOffAgainChance", "helpChance"];

  // The state a rep starts with: { driveSide, cutOffs, handsUps, helps, helpSide, chain }.
  function newMachineCtx() {
    return { driveSide: null, cutOffs: 0, handsUps: 0, helps: 0, helpSide: null, chain: ["D_GO"] };
  }

  // ctx after `next` is called (a new object; ctx is not changed).
  function advance(ctx, next) {
    const c = Object.assign({}, ctx, { chain: ctx.chain.concat(next) });
    if (FOOT_SIDE[next]) c.driveSide = FOOT_SIDE[next];
    if (next === "D_CUT_OFF") {
      c.cutOffs++;
      c.driveSide = otherSide(c.driveSide);
    }
    if (next === "D_HANDS_UP") c.handsUps++;
    if (HELP_SIDE[next]) {
      c.helps++;
      c.helpSide = HELP_SIDE[next];
    }
    return c;
  }

  // A LAY call: drive side / center / other side by laySideWeights, never the HELP D side.
  function layCall(ctx, cfg, rng) {
    const w = {};
    w[ctx.driveSide] = cfg.laySideWeights.drive;
    w[otherSide(ctx.driveSide)] = cfg.laySideWeights.other;
    w.center = cfg.laySideWeights.center;
    const sides = ["left", "center", "right"].filter(side => side !== ctx.helpSide);
    return LAY_ID[pickWeighted(sides, w, rng) || "center"];
  }

  // The call after `node`: { next: id | null, wait: wait type | null, ctx }.
  // next null with a wait = the rep ends silently on a shot after that wait;
  // next and wait both null = node is terminal.
  function readTheDNext(node, ctx, cfg, rng) {
    rng = rng || Math.random;
    const m = READTHED_MACHINE[node];
    if (!m) throw new Error("Unknown Read the D call " + node);
    if (m.wait === null) return { next: null, wait: null, ctx };
    const pick = table => pickWeighted(Object.keys(table), table, rng);
    const chance = p => rng() < p;
    let next;
    switch (node) {
      case "D_GO": next = pick(cfg.entryWeights); break;
      case "D_TIGHT": next = pick(cfg.tightWeights); break;
      case "D_CUSHION": next = pick(cfg.noOpeningWeights); break;
      case "D_HANDS_UP": next = pick(cfg.handsUpWeights); break;
      case "D_SAG":
      case "D_RETREATING": {
        const p = node === "D_SAG" ? cfg.sagHandsUpChance : cfg.retreatHandsUpChance;
        next = ctx.handsUps < cfg.maxHandsUpPerRep && chance(p) ? "D_HANDS_UP" : null;
        break;
      }
      case "D_LEFT_FOOT":
      case "D_RIGHT_FOOT":
        next = ctx.cutOffs < cfg.maxCutOffsPerRep && chance(cfg.cutOffChance) ? "D_CUT_OFF" : "D_LANE_OPEN";
        break;
      case "D_CUT_OFF":
        next = ctx.cutOffs < cfg.maxCutOffsPerRep && chance(cfg.cutOffAgainChance) ? "D_CUT_OFF" : "D_CROSSED";
        break;
      case "D_CROSSED": next = "D_LANE_OPEN"; break;
      case "D_LANE_OPEN":
        if (ctx.helps < cfg.maxHelpPerRep && chance(cfg.helpChance)) {
          const toDrive = pickWeighted(["drive", "other"], cfg.helpSideWeights, rng) === "drive";
          next = HELP_ID[toDrive ? ctx.driveSide : otherSide(ctx.driveSide)];
        } else next = layCall(ctx, cfg, rng);
        break;
      default: next = layCall(ctx, cfg, rng);  // after HELP D
    }
    return { next, wait: m.wait, ctx: next === null ? ctx : advance(ctx, next) };
  }

  // One wait of a type, whole ms, never below minGapMs.
  function machineWait(type, s, rng) {
    const range = s.readTheD2.waits[type];
    return Math.max(randomInt(range.minMs, range.maxMs, rng), s.minGapMs);
  }

  // One rep of the machine as a rep plan, plus
  //   cues: [{ atMs, durMs, chain, terminal, driveSide }]
  // (the window, every call in order, the last call or "SHOT", the final drive side).
  // onPick(node, ctxBefore, step) sees every readTheDNext decision (for the self-test).
  function planReadTheDMachineRep(s, dur, rng, onPick, ctx) {
    rng = rng || Math.random;
    const m = s.readTheD2;
    const calls = [{ id: "D_GO", atMs: 0, durMs: dur.D_GO / s.baseRate, rate: s.baseRate }];
    let end = calls[0].durMs;
    let node = "D_GO";
    let state = newMachineCtx();
    let silent = false;
    for (;;) {
      const step = readTheDNext(node, state, m, rng);
      if (onPick) onPick(node, state, step);
      if (step.wait === null) break;
      const wait = machineWait(step.wait, s, rng);
      if (step.next === null) {
        end += wait;  // nothing more is said: the window opens after the wait
        silent = true;
        break;
      }
      const call = { id: step.next, atMs: end + wait, durMs: dur[step.next] / m.rate, rate: m.rate };
      calls.push(call);
      end = call.atMs + call.durMs;
      node = step.next;
      state = step.ctx;
    }
    const cue = { atMs: end, durMs: m.endWindowMs, chain: state.chain.slice(), terminal: silent ? "SHOT" : node,
      driveSide: state.driveSide };
    return { calls, windows: [{ startMs: end, durMs: m.endWindowMs }], endMs: end + m.endWindowMs, restMs: m.resetPauseMs, cues: [cue] };
  }

  // Machine settings check. Returns null, or { field: "speech" | "readTheD", message }.
  function validateReadTheDMachine(s, dur) {
    const main = message => ({ field: "readTheD", message });
    const speechError = validateSpeech(s);
    if (speechError) return speechError;
    const m = s.readTheD2;
    if (!(m.rate >= 0.5 && m.rate <= 2)) return main("Read the D speech rate must be between 0.5 and 2.0.");
    if (m.rate > s.maxRate + 1e-9) {
      return main("Read the D speech rate " + m.rate + " is above the max speech rate " + s.maxRate + ".");
    }
    for (const type of WAIT_TYPES) {
      const w = m.waits && m.waits[type];
      if (!w || !isWholeNonNegative(w.minMs) || !isWholeNonNegative(w.maxMs)) {
        return main("The " + type + " wait needs a min and max of whole numbers of 0 ms or more.");
      }
      if (w.minMs > w.maxMs) return main("The " + type + " wait: min must not exceed max.");
    }
    if (!isWhole(m.endWindowMs) || m.endWindowMs < 500) return main("The end window must be a whole number of at least 500 ms.");
    if (!isWholeNonNegative(m.resetPauseMs)) return main("Reset pause must be a whole number of 0 ms or more.");
    for (const key of CHANCES) {
      if (!(m[key] >= 0 && m[key] <= 1)) return main(key + " must be a chance from 0 to 1.");
    }
    const table = (name, ids) => {
      const t = m[name];
      if (!t || !Object.keys(t).every(id => ids.indexOf(id) !== -1 && isNonNegative(t[id]))) {
        return name + ": every weight must be a number of 0 or more, for " + ids.join(", ") + ".";
      }
      return sumOf(Object.keys(t), t) > 0 ? null : name + " must add up to more than 0.";
    };
    for (const name of Object.keys(NODE_TABLES)) {
      const e = table(name, NODE_TABLES[name]);
      if (e) return main(e);
    }
    const sideError = table("helpSideWeights", ["drive", "other"]) || table("laySideWeights", ["drive", "center", "other"]);
    if (sideError) return main(sideError);
    // With a HELP D side removed, a LAY call must still be possible.
    const lay = m.laySideWeights;
    if (!((lay.center || 0) + (lay.other || 0) > 0) || !((lay.center || 0) + (lay.drive || 0) > 0)) {
      return main("laySideWeights must leave a LAY call after the HELP D side is removed.");
    }
    if (!isWholeNonNegative(m.maxCutOffsPerRep) || !isWholeNonNegative(m.maxHandsUpPerRep)) {
      return main("Max cut offs and max hands up per rep must be whole numbers of 0 or more.");
    }
    if (m.maxHelpPerRep !== 0 && m.maxHelpPerRep !== 1) return main("Max help per rep must be 0 or 1.");
    for (const id of Object.keys(READTHED_MACHINE)) {
      if (!(dur[id] > 0)) return main("The call " + id + " has no spoken length.");
    }
    return null;
  }

  // Rep length (ms from GO to the end of the window) and calls per rep, by entry read
  // and overall, over `reps` reps: [{ entry, reps, avgMs, maxMs, avgCalls, maxCalls }].
  function readTheDMachineLengthTable(s, dur, reps, rng) {
    const rows = {};
    const add = (key, plan) => {
      const r = rows[key] = rows[key] || { entry: key, reps: 0, totalMs: 0, maxMs: 0, totalCalls: 0, maxCalls: 0 };
      r.reps++;
      r.totalMs += plan.endMs;
      r.maxMs = Math.max(r.maxMs, plan.endMs);
      r.totalCalls += plan.calls.length;
      r.maxCalls = Math.max(r.maxCalls, plan.calls.length);
    };
    for (let i = 0; i < reps; i++) {
      const plan = planReadTheDMachineRep(s, dur, rng);
      add(s.phrases[plan.calls[1].id].display, plan);
      add("all", plan);
    }
    return Object.keys(rows).filter(k => k !== "all").sort().concat("all").map(k => {
      const r = rows[k];
      return { entry: r.entry, reps: r.reps, avgMs: Math.round(r.totalMs / r.reps), maxMs: Math.round(r.maxMs),
        avgCalls: +(r.totalCalls / r.reps).toFixed(1), maxCalls: r.maxCalls };
    });
  }

  // ---- Self-test (only called from ?selftest=1) ----

  function readTheDMachineSelfTest(check, reps) {
    const s = cloneSettings(OFFENSE_DEFAULTS);
    const dur = durationsFor(s, null);
    const cfg = s.readTheD2;
    const n = reps * 4;
    const near = (got, want) => Math.abs(got - want) <= 0.02;
    const share = (t, key) => (t.total ? (t[key] || 0) / t.total : NaN);
    const isLay = id => LAYS.indexOf(id) !== -1;
    const isFoot = id => !!FOOT_SIDE[id];

    // 1. Vocabulary: the new calls, and a phrase and a meaning for every call of the machine.
    const vf = [];
    const want = { D_GO: ["GO", "go", 300], D_LANE_OPEN: ["LANE OPEN", "lane open", 650], D_CUT_OFF: ["CUT OFF", "cut off", 450],
      D_CROSSED: ["CROSSED", "crossed", 500], D_HELP_LEFT: ["HELP D ON LEFT", "help dee on left", 900],
      D_HELP_RIGHT: ["HELP D ON RIGHT", "help dee on right", 900], D_LAY_LEFT: ["LAY ON LEFT", "lay on left", 650],
      D_LAY_RIGHT: ["LAY ON RIGHT", "lay on right", 650], D_LAY_CENTER: ["LAY ON CENTER", "lay on center", 750] };
    Object.keys(want).forEach(id => {
      const p = s.phrases[id];
      if (!p || p.display !== want[id][0] || p.spoken !== want[id][1] || p.estMs !== want[id][2]) vf.push(id);
    });
    if (s.phrases.D_CUSHION.display !== "NO OPENING" || s.phrases.CUT_OFF.display !== "CUT OFF") vf.push("shared calls changed");
    Object.keys(READTHED_MACHINE).forEach(id => {
      if (!(dur[id] > 0)) vf.push(id + " has no length");
      if (typeof TRAINING_DEFAULTS.readTheD2.reads[id] !== "string") vf.push(id + " has no meaning");
      READTHED_MACHINE[id].next.forEach(x => { if (x !== null && !READTHED_MACHINE[x]) vf.push(id + " -> unknown " + x); });
    });
    check("read the d machine: the new calls, and a phrase and a meaning for every call", vf);

    // Walk n reps once, collecting structure problems, decision tallies and timing problems.
    const sf = [];
    const tf = [];
    const tally = {};
    const t = key => (tally[key] = tally[key] || { total: 0 });
    const count = (key, outcome) => { const x = t(key); x.total++; x[outcome] = (x[outcome] || 0) + 1; };
    let longest = 0;
    for (let i = 0; i < n; i++) {
      const plan = planReadTheDMachineRep(s, dur, Math.random, (node, before, step) => {
        const next = step.next === null ? "END" : step.next;
        if (JSON.stringify(before) === JSON.stringify(step.ctx) && step.next !== null) sf.push("ctx not advanced");
        if (node === "D_GO") count("entry", next);
        if (node === "D_CUSHION") count("noOpening", next);
        if (node === "D_HANDS_UP") count("handsUp", next);
        if ((node === "D_SAG" || node === "D_RETREATING") && before.handsUps < cfg.maxHandsUpPerRep) count(node, next);
        if (isFoot(node) && before.cutOffs < cfg.maxCutOffsPerRep) count("foot", next);
        if (node === "D_CUT_OFF" && before.cutOffs < cfg.maxCutOffsPerRep) count("cutOff", next);
        if (node === "D_LANE_OPEN" && before.helps < cfg.maxHelpPerRep) {
          count("help", HELP_SIDE[next] ? "HELP" : "LAY");
          if (HELP_SIDE[next]) count("helpSide", HELP_SIDE[next] === before.driveSide ? "drive" : "other");
        }
        if (isLay(step.next)) {
          const side = step.next === "D_LAY_CENTER" ? "center" : (step.next === "D_LAY_LEFT" ? "left" : "right") === before.driveSide ? "drive" : "other";
          const help = before.helpSide === null ? "none" : before.helpSide === before.driveSide ? "drive" : "other";
          count("lay:" + help, side);
          if (help === "none" && before.cutOffs > 0) count("lay:none:afterCutOff", side);
        }
      });
      const c = plan.calls;
      const ids = c.map(x => x.id);
      const where = ids.join(" > ");
      const cue = plan.cues[0];
      longest = Math.max(longest, ids.length);

      // 2. Structure.
      if (ids.length > 14) sf.push(where + " (more than 14 calls)");
      if (ids[0] !== "D_GO" || ids.indexOf("D_GO", 1) !== -1) sf.push(where + " (GO)");
      for (let k = 1; k < ids.length; k++) {
        if (READTHED_MACHINE[ids[k - 1]].next.indexOf(ids[k]) === -1) sf.push(where + " (edge " + ids[k - 1] + " > " + ids[k] + ")");
      }
      ids.forEach((id, k) => {
        const prev = ids[k - 1];
        const next = ids[k + 1];
        if (id === "D_TIGHT" && next !== undefined && !isFoot(next)) sf.push(where + " (TIGHT not followed by a foot)");
        if (id === "D_TIGHT" && next === undefined) sf.push(where + " (rep ends on TIGHT)");
        if (isFoot(id) && next !== "D_CUT_OFF" && next !== "D_LANE_OPEN") sf.push(where + " (foot not followed by CUT OFF / LANE OPEN)");
        if (id === "D_LANE_OPEN" && !isFoot(prev) && prev !== "D_CROSSED") sf.push(where + " (LANE OPEN after " + prev + ")");
        if (isLay(id) && prev !== "D_LANE_OPEN" && !HELP_SIDE[prev]) sf.push(where + " (LAY after " + prev + ")");
        if ((id === "D_LAY_LEFT" && prev === "D_HELP_LEFT") || (id === "D_LAY_RIGHT" && prev === "D_HELP_RIGHT")) sf.push(where + " (LAY on the help side)");
        if ((id === "D_HANDS_DOWN" || isLay(id)) && next !== undefined) sf.push(where + " (" + id + " not last)");
      });
      const last = ids[ids.length - 1];
      const silentEnd = last === "D_SAG" || last === "D_RETREATING";
      if (!(READTHED_MACHINE[last].wait === null || silentEnd)) sf.push(where + " (does not end on a terminal call or a silent shot)");
      if (cue.terminal !== (silentEnd ? "SHOT" : last) || cue.chain.join() !== ids.join()) sf.push(where + " (cue chain / terminal)");
      const cnt = id => ids.filter(x => x === id).length;
      if (cnt("D_CUT_OFF") > cfg.maxCutOffsPerRep || cnt("D_HANDS_UP") > cfg.maxHandsUpPerRep ||
          cnt("D_HELP_LEFT") + cnt("D_HELP_RIGHT") > cfg.maxHelpPerRep) sf.push(where + " (caps)");
      // The drive side: the last foot call, flipped by every CUT OFF after it.
      let side = null;
      ids.forEach(id => { if (isFoot(id)) side = FOOT_SIDE[id]; if (id === "D_CUT_OFF") side = otherSide(side); });
      if (cue.driveSide !== side) sf.push(where + " (drive side " + cue.driveSide + ", want " + side + ")");

      // 4. Timing.
      const endOf = x => x.atMs + x.durMs;
      if (c[0].atMs !== 0 || c[0].rate !== s.baseRate || Math.abs(c[0].durMs - dur.D_GO / s.baseRate) > EPS) tf.push(where + " (GO)");
      const inRange = (gap, type) => {
        const r = cfg.waits[type];
        return gap >= Math.max(r.minMs, s.minGapMs) - EPS && gap <= Math.max(r.maxMs, s.minGapMs) + EPS && gap >= s.minGapMs - EPS;
      };
      for (let k = 1; k < c.length; k++) {
        if (c[k].rate !== cfg.rate || Math.abs(c[k].durMs - dur[c[k].id] / cfg.rate) > EPS) tf.push(where + " (rate of " + c[k].id + ")");
        const gap = c[k].atMs - endOf(c[k - 1]);
        const type = READTHED_MACHINE[c[k - 1].id].wait;
        if (!inRange(gap, type)) tf.push(where + " (" + type + " wait " + gap + " before " + c[k].id + ")");
        if (Math.abs(gap - Math.round(gap)) > EPS) tf.push(where + " (wait not whole ms)");
      }
      const w = plan.windows[0];
      const lastEnd = endOf(c[c.length - 1]);
      if (silentEnd) {
        if (!inRange(w.startMs - lastEnd, "quick")) tf.push(where + " (silent end window at +" + (w.startMs - lastEnd) + ")");
      } else if (Math.abs(w.startMs - lastEnd) > EPS) tf.push(where + " (window not right after the last call)");
      if (plan.windows.length !== 1 || w.durMs !== cfg.endWindowMs || plan.endMs !== w.startMs + w.durMs ||
          plan.restMs !== cfg.resetPauseMs || cue.atMs !== w.startMs || cue.durMs !== w.durMs) tf.push(where + " (window / endMs / restMs)");
      repPlanProblems(plan, s.phrases).forEach(x => tf.push(where + " " + x));
    }
    // readTheDNext never changes the ctx it is given.
    const ctx0 = newMachineCtx();
    const frozen = JSON.stringify(ctx0);
    readTheDNext("D_GO", ctx0, cfg, Math.random);
    if (JSON.stringify(ctx0) !== frozen) sf.push("readTheDNext changed its ctx");
    check("read the d machine: " + n + " reps end within 14 calls; GO first, every edge in the table, terminals last, caps kept, drive side tracked", sf);

    // 3. Frequencies.
    const ff = [];
    const weights = (key, table) => {
      const sum = sumOf(Object.keys(table), table);
      Object.keys(table).forEach(id => {
        if (!near(share(t(key), id), table[id] / sum)) ff.push(key + " " + id + " " + share(t(key), id).toFixed(3));
      });
    };
    weights("entry", cfg.entryWeights);
    weights("noOpening", cfg.noOpeningWeights);
    weights("handsUp", cfg.handsUpWeights);
    [["D_SAG", cfg.sagHandsUpChance], ["D_RETREATING", cfg.retreatHandsUpChance], ["foot", cfg.cutOffChance],
     ["cutOff", cfg.cutOffAgainChance]].forEach(c => {
      const key = c[0];
      const hit = key === "foot" || key === "cutOff" ? "D_CUT_OFF" : "D_HANDS_UP";
      if (!near(share(t(key), hit), c[1])) ff.push(key + " " + hit + " " + share(t(key), hit).toFixed(3));
    });
    if (!near(share(t("help"), "HELP"), cfg.helpChance)) ff.push("HELP D " + share(t("help"), "HELP").toFixed(3));
    const hs = cfg.helpSideWeights;
    if (!near(share(t("helpSide"), "drive"), hs.drive / (hs.drive + hs.other))) ff.push("HELP D side " + share(t("helpSide"), "drive").toFixed(3));
    const lw = cfg.laySideWeights;
    const layWant = { none: { drive: lw.drive, center: lw.center, other: lw.other },
      drive: { center: lw.center, other: lw.other }, other: { drive: lw.drive, center: lw.center } };
    Object.keys(layWant).forEach(help => {
      weights("lay:" + help, layWant[help]);
      if (t("lay:" + help).total < 1000) ff.push("lay:" + help + " only " + t("lay:" + help).total + " samples");
    });
    weights("lay:none:afterCutOff", layWant.none);
    check("read the d machine: entry, NO OPENING, HANDS UP, cut-off, help and lay-side frequencies match within 2 points over " + n + " reps", ff);
    check("read the d machine: waits in their type's range and >= min gap, no overlaps, GO at base rate, the rest at the rate, window placed right", tf);

    // 5. Validation.
    const vaf = [];
    if (validateReadTheDMachine(s, dur)) vaf.push("defaults: " + validateReadTheDMachine(s, dur).message);
    const variant = changes => {
      const v = cloneSettings(s);
      changes(v.readTheD2, v);
      return v;
    };
    [["min > max", m => { m.waits.jab = { minMs: 2300, maxMs: 2200 }; }],
     ["negative wait", m => { m.waits.quick.minMs = -1; }],
     ["fractional wait", m => { m.waits.read.maxMs = 900.5; }],
     ["chance 1.2", m => { m.helpChance = 1.2; }],
     ["all-zero weights", m => { m.entryWeights = { D_TIGHT: 0, D_CUSHION: 0, D_SAG: 0, D_RETREATING: 0 }; }],
     ["unknown weight id", m => { m.tightWeights = { D_LEFT_FOOT: 50, D_HANDS_UP: 50 }; }],
     ["help side all zero", m => { m.helpSideWeights = { drive: 0, other: 0 }; }],
     ["no lay after help", m => { m.laySideWeights = { drive: 40, center: 0, other: 0 }; }],
     ["rate above maxRate", m => { m.rate = 1.7; }],
     ["negative cap", m => { m.maxCutOffsPerRep = -1; }],
     ["help cap 2", m => { m.maxHelpPerRep = 2; }],
     ["end window 400", m => { m.endWindowMs = 400; }],
     ["negative reset", m => { m.resetPauseMs = -1; }],
    ].forEach(c => {
      const e = validateReadTheDMachine(variant(c[1]), dur);
      if (!e || e.field !== "readTheD") vaf.push("accepted " + c[0]);
    });
    const speech = validateReadTheDMachine(variant((m, v) => { v.baseRate = 3; }), dur);
    if (!speech || speech.field !== "speech") vaf.push("accepted base rate 3");
    check("read the d machine: validation accepts the defaults, rejects bad waits, chances, weights, rate, caps and windows", vaf);
  }

  P.registerSuite(readTheDMachineSelfTest);

  Object.assign(P, {
    READTHED_MACHINE,
    readTheDNext,
    planReadTheDMachineRep,
    validateReadTheDMachine,
    readTheDMachineLengthTable,
  });
})(OffensePlanner);
