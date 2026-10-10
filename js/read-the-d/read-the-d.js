// Read the D drill: the defender's state as cue calls, the rules that decide
// the right action, state sampling, the planner (with the second read),
// validation, the per-level fit table, self-test and profile. Pure (see
// js/core/planner.js). Scoring is in scoring.js; the UI in read-the-d-ui.js.
(function (P) {
  "use strict";
  const { OFFENSE_DEFAULTS, TRAINING_DEFAULTS, EPS, cloneSettings, durationsFor, randomInt, randomOf, sumOf,
    pickWeighted, fitRateIn, scheduleCalls, isWhole, isNonNegative, isWholeNonNegative, validateSpeech, hasKey,
    applyLevel, repPlanProblems } = P;

  // ---------------------------------------------------------------
  // Read the D drill: a lead-in, then the defender's state as cue calls in a
  // fixed order (momentum, distance, lead foot, and from Level 3 a hands call
  // at a random place among them), then NOW, which opens the decision window.
  // The rules that turn a state into the right action are in TRAINING_DEFAULTS.readTheD.
  // With Auto difficulty on, the level sets rate, cueGapMs, decisionMs, hands
  // and midDribble (TRAINING_DEFAULTS.levels.readTheD); these are the values
  // used with it off (the same as Level 3).
  // ---------------------------------------------------------------
  OFFENSE_DEFAULTS.readTheD = {
    // Speech rate of the cue calls and NOW (0.5 up to maxRate). The lead-in uses baseRate.
    rate: 1.3,
    // Silence between two cue calls, and before NOW (ms).
    cueGapMs: 200, // provisional
    // Decision window from NOW (ms): make the move and shoot.
    decisionMs: 2200,
    // 1 = add a HANDS UP / HANDS DOWN call (a distractor: it never changes the answer).
    hands: 1,
    // 0 = READY, then the read time, then the cues (before the move).
    // 1 = LIVE (start dribbling), then the cues liveDelay later (mid-dribble).
    midDribble: 0,
    // Read time: READY to the first cue call (ms), uniform in this range.
    readMinMs: 800, // provisional
    readMaxMs: 3500, // provisional
    // Mid-dribble: LIVE to the first cue call (ms), uniform in this range.
    liveDelayMinMs: 600, // provisional
    liveDelayMaxMs: 1500, // provisional
    // Wait after the decision window ends before the next lead-in (ms).
    resetPauseMs: 1000,
    // 1 = the defender can react to your first move with a second read (Levels 4-5):
    // with probability TRAINING_DEFAULTS.readTheD.secondRead.chance, a second cue
    // sequence starts secondGapMinMs..secondGapMaxMs after the first window ends
    // (after practice mode's explanation, when on), with its own full decision window.
    secondRead: 0,
    secondGapMinMs: 700, // provisional
    secondGapMaxMs: 1200, // provisional
    // Practice mode (1 = on): after each decision window, a pause of practicePauseMs,
    // then the correct action and its why, at baseRate. Not set by levels.
    practice: 0,
    practicePauseMs: 600, // provisional
  };

  Object.assign(OFFENSE_DEFAULTS.phrases, {
    // Read the D: the defender's state, from the attacker's point of view, then the go signal.
    D_CLOSING:    { display: "CLOSING",    spoken: "closing",    estMs: 500 },  // momentum
    D_SET:        { display: "SET",        spoken: "set",        estMs: 300 },  // momentum
    D_RETREATING: { display: "RETREATING", spoken: "retreating", estMs: 650 },  // momentum
    D_TIGHT:      { display: "TIGHT",      spoken: "tight",      estMs: 350 },  // distance
    D_CUSHION:    { display: "NO OPENING", spoken: "no opening", estMs: 700 },  // distance (state value "cushion")
    D_SAG:        { display: "SAGGING",    spoken: "sagging",    estMs: 500 },  // distance
    D_LEFT_FOOT:  { display: "LEFT FOOT",  spoken: "left foot",  estMs: 550 },  // lead foot
    D_RIGHT_FOOT: { display: "RIGHT FOOT", spoken: "right foot", estMs: 550 },  // lead foot
    D_HANDS_UP:   { display: "HANDS UP",   spoken: "hands up",   estMs: 550 },  // distractor
    D_HANDS_DOWN: { display: "HANDS DOWN", spoken: "hands down", estMs: 600 },  // distractor
    D_NOW:        { display: "NOW",        spoken: "now",        estMs: 300 },  // go signal
    D_LIVE:       { display: "LIVE",       spoken: "live",       estMs: 350 },  // mid-dribble lead-in
    // Read the D practice mode: the correct action, said after the decision window.
    // (Each rule's why is added below as W_<rule id>, from TRAINING_DEFAULTS.readTheD.rules.)
    A_DRIVE_LEFT:   { display: "DRIVE LEFT",   spoken: "drive left",   estMs: 600 },
    A_DRIVE_RIGHT:  { display: "DRIVE RIGHT",  spoken: "drive right",  estMs: 600 },
    A_PULL_UP:      { display: "PULL UP",      spoken: "pull up",      estMs: 450 },
    A_CREATE_SPACE: { display: "CREATE SPACE", spoken: "create space", estMs: 700 },
  });

  // Read the D: faster speech, tighter gaps and a shorter decision window per
  // level; Level 3 adds the hands distractor, Level 4 moves the cues mid-dribble.
  // Every rate must stay within the max speech rate.
  TRAINING_DEFAULTS.levels.readTheD = [
    { "readTheD.rate": 1.0, "readTheD.cueGapMs": 300, "readTheD.decisionMs": 3000,
      "readTheD.hands": 0, "readTheD.midDribble": 0, "readTheD.secondRead": 0 }, // provisional
    { "readTheD.rate": 1.15, "readTheD.cueGapMs": 250, "readTheD.decisionMs": 2500,
      "readTheD.hands": 0, "readTheD.midDribble": 0, "readTheD.secondRead": 0 }, // provisional
    { "readTheD.rate": 1.3, "readTheD.cueGapMs": 200, "readTheD.decisionMs": 2200,
      "readTheD.hands": 1, "readTheD.midDribble": 0, "readTheD.secondRead": 0 }, // provisional
    { "readTheD.rate": 1.45, "readTheD.cueGapMs": 150, "readTheD.decisionMs": 2000,
      "readTheD.hands": 1, "readTheD.midDribble": 1, "readTheD.secondRead": 1 }, // provisional
    { "readTheD.rate": 1.6, "readTheD.cueGapMs": 120, "readTheD.decisionMs": 1700,
      "readTheD.hands": 1, "readTheD.midDribble": 1, "readTheD.secondRead": 1 }, // provisional
  ];

  // ---- Read the D: the rules that turn the defender's state into an action. ----
  // State (from the attacker's point of view): momentum "closing" | "set" | "retreating",
  // distance "tight" (inside arm's reach) | "cushion" (about an arm's length; called NO OPENING) | "sag"
  // (well off, near the free-throw line), leadFoot "left" | "right" (the side his
  // forward foot is on), and from Level 3 hands "up" | "down" (never changes the answer).
  TRAINING_DEFAULTS.readTheD = {
    // Checked in order; the first rule with a matching `when` entry decides. An entry
    // matches when every key in `match` holds one of its listed values. Actions:
    // DRIVE_LEAD_SIDE (drive to the side of his lead foot: DRIVE_LEFT / DRIVE_RIGHT),
    // PULL_UP, CREATE_SPACE (hesi or step-back into a jumper). `situation` names the
    // defender in feedback, `answer` the action, `why` the reason; `evidence` is
    // "study-based" or "coaching heuristic".
    rules: [
      { id: "closing", when: [{ match: { momentum: ["closing"] }, situation: "closing defender" }],
        action: "DRIVE_LEAD_SIDE", answer: "drive to his front-foot side",
        why: "attack the closeout past his front foot", evidence: "coaching heuristic" },
      { id: "gaveShot", when: [{ match: { distance: ["sag"] }, situation: "sagging defender" },
                               { match: { momentum: ["retreating"] }, situation: "retreating defender" }],
        action: "PULL_UP", answer: "pull up", why: "he gave you the shot", evidence: "coaching heuristic" },
      { id: "tightSet", when: [{ match: { momentum: ["set"], distance: ["tight"] }, situation: "tight, set defender" }],
        action: "DRIVE_LEAD_SIDE", answer: "drive to his front-foot side",
        why: "attack his front foot", evidence: "study-based" },
      { id: "cushionSet", when: [{ match: { momentum: ["set"], distance: ["cushion"] }, situation: "set defender, no opening" }],
        action: "CREATE_SPACE", answer: "create space: hesi or step-back into a jumper",
        why: "his foot doesn't matter at this distance", evidence: "coaching heuristic" },
    ],
    // How often each correct action comes up. States are drawn by first picking
    // an action by these weights, then one of its states at random.
    actionWeights: { DRIVE_LEFT: 25, DRIVE_RIGHT: 25, PULL_UP: 25, CREATE_SPACE: 25 }, // provisional
    // Second read (Levels 4-5): the defender reacts to your first move. The second
    // state follows from the first CORRECT action and is scored with the same rules.
    // Each option has a weight and the state to call; a value can be fixed, a list
    // (one picked at random), "random" (any value) or, for leadFoot, "opposite"
    // (the other side from the drive).
    secondRead: {
      chance: 0.5, // provisional: share of reps with a second read
      afterDrive: [
        // He cut the drive off: tight, set, lead foot now on the other side -> counter the other way.
        { id: "cutOff", weight: 50, state: { momentum: "set", distance: "tight", leadFoot: "opposite" } }, // provisional
        // He gave ground: retreating -> pull up.
        { id: "retreat", weight: 50, state: { momentum: "retreating", distance: ["cushion", "sag"], leadFoot: "random" } }, // provisional
      ],
      afterPullUpOrCreateSpace: [
        // A hard closeout -> drive past his front foot.
        { id: "closeout", weight: 100, state: { momentum: "closing", distance: ["tight", "cushion"], leadFoot: "random" } }, // provisional
      ],
    },
    // Practice mode speaks each rule's why; its length estimate is this many ms per
    // character at rate 1.0 until the real length is learned.
    whyEstMsPerChar: 65, // provisional
  };

  // So is each Read the D rule's why (spoken in practice mode).
  TRAINING_DEFAULTS.readTheD.rules.forEach(r => {
    OFFENSE_DEFAULTS.phrases["W_" + r.id] = {
      display: r.why, spoken: r.why, estMs: Math.round(r.why.length * TRAINING_DEFAULTS.readTheD.whyEstMsPerChar),
    };
  });

  // ===================================================================
  // Read the D: lead-in (READY, or LIVE mid-dribble) -> cue calls describing
  // the defender (momentum, distance, lead foot, [hands]) -> NOW -> decision
  // window. No call names the move: the player turns the state into an action,
  // and correctAction (with TRAINING_DEFAULTS.readTheD.rules) knows the answer.
  // ===================================================================

  const RTD_MOMENTUM = ["closing", "set", "retreating"];
  const RTD_DISTANCE = ["tight", "cushion", "sag"];
  const RTD_FEET = ["left", "right"];
  const RTD_HANDS = ["up", "down"];
  // The fixed call order. A hands call goes at a random place among these.
  const RTD_ORDER = ["momentum", "distance", "leadFoot"];
  const RTD_VALUES = { momentum: RTD_MOMENTUM, distance: RTD_DISTANCE, leadFoot: RTD_FEET, hands: RTD_HANDS };
  const RTD_PHRASE = {
    momentum: { closing: "D_CLOSING", set: "D_SET", retreating: "D_RETREATING" },
    distance: { tight: "D_TIGHT", cushion: "D_CUSHION", sag: "D_SAG" },
    leadFoot: { left: "D_LEFT_FOOT", right: "D_RIGHT_FOOT" },
    hands: { up: "D_HANDS_UP", down: "D_HANDS_DOWN" },
  };
  const RTD_ACTIONS = ["DRIVE_LEFT", "DRIVE_RIGHT", "PULL_UP", "CREATE_SPACE"];
  const RTD_ACTION_NAMES = { DRIVE_LEFT: "DRIVE LEFT", DRIVE_RIGHT: "DRIVE RIGHT", PULL_UP: "PULL UP", CREATE_SPACE: "CREATE SPACE" };
  const RTD_RULE_ACTIONS = ["DRIVE_LEAD_SIDE", "PULL_UP", "CREATE_SPACE"];
  const RTD_EVIDENCE = ["study-based", "coaching heuristic"];

  // The rule table and weights a run uses: the session's copy, else the defaults.
  function rtdConfig(s) {
    return (s.training && s.training.readTheD) || TRAINING_DEFAULTS.readTheD;
  }

  // The correct action for a defender state, or null if no rule matches:
  // { action, ruleId, situation, answer, why, evidence }.
  function correctAction(state, rules) {
    for (const rule of rules) {
      for (const entry of rule.when) {
        const match = entry.match;
        if (Object.keys(match).every(key => match[key].indexOf(state[key]) !== -1)) {
          const action = rule.action !== "DRIVE_LEAD_SIDE" ? rule.action
            : state.leadFoot === "left" ? "DRIVE_LEFT" : "DRIVE_RIGHT";
          return { action, ruleId: rule.id, situation: entry.situation, answer: rule.answer, why: rule.why, evidence: rule.evidence };
        }
      }
    }
    return null;
  }

  // Every defender state: 18, or 36 with the hands call.
  function rtdStates(withHands) {
    const out = [];
    RTD_MOMENTUM.forEach(momentum => RTD_DISTANCE.forEach(distance => RTD_FEET.forEach(leadFoot => {
      if (withHands) RTD_HANDS.forEach(hands => out.push({ momentum, distance, leadFoot, hands }));
      else out.push({ momentum, distance, leadFoot });
    })));
    return out;
  }

  function sameState(a, b) {
    return !!a && !!b && a.momentum === b.momentum && a.distance === b.distance &&
      a.leadFoot === b.leadFoot && a.hands === b.hands;
  }

  // Draw a state: an action by cfg.actionWeights, then one of that action's
  // states at random, never `prev` again. Actions left without a state are skipped.
  function sampleState(cfg, withHands, prev, rng) {
    const byAction = {};
    rtdStates(withHands).forEach(st => {
      const c = correctAction(st, cfg.rules);
      if (c && !sameState(st, prev)) (byAction[c.action] = byAction[c.action] || []).push(st);
    });
    const actions = RTD_ACTIONS.filter(a => byAction[a]);
    const action = pickWeighted(actions, cfg.actionWeights, rng) || randomOf(actions, rng);
    return randomOf(byAction[action], rng);
  }

  // The cue call ids for a state, in the fixed order; a hands call goes at a
  // random place among the other three (first, between two of them, or last).
  function cueIds(state, rng) {
    const ids = RTD_ORDER.map(key => RTD_PHRASE[key][state[key]]);
    if (state.hands) ids.splice(Math.floor(rng() * (ids.length + 1)), 0, RTD_PHRASE.hands[state.hands]);
    return ids;
  }

  // Lay out cue calls (ending with NOW) from startMs with the per-window rate-fit
  // math: the window is just long enough for the calls at the cue rate with
  // cueGapMs between them, so every call is spoken at that rate and none can
  // overlap another. null when the cue rate is above maxRate.
  function layoutCues(ids, startMs, s, dur) {
    const rd = s.readTheD;
    const cueSpeech = { baseRate: rd.rate, maxRate: s.maxRate, minGapMs: rd.cueGapMs };
    const D = sumOf(ids, dur) / rd.rate + (ids.length - 1) * rd.cueGapMs;
    const rate = fitRateIn(ids, D, 0, cueSpeech, dur);
    if (rate === null) return null;
    return scheduleCalls(ids, D, rate, 0, dur).map(c => ({ id: c.id, atMs: startMs + c.startMs, durMs: c.durMs, rate }));
  }

  // One Read the D rep as a rep plan, plus
  //   cues: [{ atMs, durMs, state, ids, correct, ruleId }]
  // one per decision: its window (from NOW), the state called, the cue ids
  // called (without NOW) and the correct action. ctx.lastState is the previous
  // rep's state, which is never drawn twice in a row.
  function planReadTheDRep(s, dur, rng, onPick, ctx) {
    rng = rng || Math.random;
    const rd = s.readTheD;
    const cfg = rtdConfig(s);
    const base = s.baseRate;
    const calls = [];
    const windows = [];
    const cues = [];

    const lead = rd.midDribble === 1 ? "D_LIVE" : "READ";
    calls.push({ id: lead, atMs: 0, durMs: dur[lead] / base, rate: base });
    // Read time (READY) or live delay (LIVE), clamped so the first cue never overlaps the lead-in.
    const wait = rd.midDribble === 1
      ? randomInt(rd.liveDelayMinMs, rd.liveDelayMaxMs, rng)
      : randomInt(rd.readMinMs, rd.readMaxMs, rng);
    const firstAt = Math.max(wait, dur[lead] / base + s.minGapMs);

    // One decision: the cue calls and NOW from startMs, then the window from NOW.
    // Returns when the window ends.
    const decide = (state, startMs) => {
      const ids = cueIds(state, rng);
      const laid = layoutCues(ids.concat("D_NOW"), startMs, s, dur);
      if (!laid) throw new Error("The cue calls don't fit at cue rate " + rd.rate);
      laid.forEach(c => calls.push(c));
      const nowAt = laid[laid.length - 1].atMs;
      const c = correctAction(state, cfg.rules);
      windows.push({ startMs: nowAt, durMs: rd.decisionMs });
      cues.push({ atMs: nowAt, durMs: rd.decisionMs, state, ids, correct: c.action, ruleId: c.ruleId });
      return nowAt + rd.decisionMs;
    };

    // Practice mode: a pause after the window, then the correct action and its why
    // (shown as the caption under the action). Returns when the why has been spoken.
    const explain = (cue, fromMs) => {
      const answer = "A_" + cue.correct;
      const why = "W_" + cue.ruleId;
      const answerAt = fromMs + rd.practicePauseMs;
      calls.push({ id: answer, atMs: answerAt, durMs: dur[answer] / base, rate: base });
      const whyAt = answerAt + dur[answer] / base + s.minGapMs;
      calls.push({ id: why, atMs: whyAt, durMs: dur[why] / base, rate: base, show: "caption" });
      return whyAt + dur[why] / base;
    };

    const state = sampleState(cfg, rd.hands === 1, ctx && ctx.lastState, rng);
    let endMs = decide(state, firstAt);
    if (rd.practice === 1) endMs = explain(cues[0], endMs);

    // Second read: the defender reacts to the first correct action.
    if (rd.secondRead === 1 && rng() < cfg.secondRead.chance) {
      const reaction = reactionState(cues[0].correct, cfg, rng);
      endMs = decide(reaction.state, endMs + randomInt(rd.secondGapMinMs, rd.secondGapMaxMs, rng));
      cues[1].reaction = reaction.id;
      if (rd.practice === 1) endMs = explain(cues[1], endMs);
    }
    return { calls, windows, endMs, restMs: rd.resetPauseMs, cues };
  }

  // The defender's reaction to the first correct action, from cfg.secondRead:
  // { id, state } (no hands call in a second read).
  function reactionState(firstCorrect, cfg, rng) {
    const drove = firstCorrect === "DRIVE_LEFT" || firstCorrect === "DRIVE_RIGHT";
    const options = drove ? cfg.secondRead.afterDrive : cfg.secondRead.afterPullUpOrCreateSpace;
    const weights = {};
    options.forEach((o, i) => { weights[i] = o.weight; });
    const index = pickWeighted(options.map((o, i) => String(i)), weights, rng);
    const option = options[index === null ? 0 : Number(index)];
    const state = {};
    RTD_ORDER.forEach(key => {
      const v = option.state[key];
      if (Array.isArray(v)) state[key] = randomOf(v, rng);
      else if (v === "random" || (v === "opposite" && !drove)) state[key] = randomOf(RTD_VALUES[key], rng);
      else if (v === "opposite") state[key] = firstCorrect === "DRIVE_LEFT" ? "right" : "left";
      else state[key] = v;
    });
    return { id: option.id, state };
  }

  // A second-read mapping problem, or null.
  function secondReadProblem(sr) {
    if (!sr || !(sr.chance >= 0 && sr.chance <= 1)) return "Second read chance must be from 0 to 1.";
    for (const key of ["afterDrive", "afterPullUpOrCreateSpace"]) {
      const options = sr[key];
      if (!Array.isArray(options) || options.length === 0) return "Second read: " + key + " needs at least one option.";
      if (!options.every(o => isNonNegative(o.weight)) || !(options.reduce((a, o) => a + o.weight, 0) > 0)) {
        return "Second read: " + key + " weights must be 0 or more and add up to more than 0.";
      }
      for (const o of options) {
        const ok = o.state && RTD_ORDER.every(k => {
          const v = o.state[k];
          const valid = x => RTD_VALUES[k].indexOf(x) !== -1;
          return valid(v) || v === "random" || (k === "leadFoot" && v === "opposite") ||
            (Array.isArray(v) && v.length > 0 && v.every(valid));
        });
        if (!ok) return "Second read: option " + o.id + " needs a momentum, distance and lead foot it can call.";
      }
    }
    return null;
  }

  // The longest cue call of each kind, in call order (hands last).
  function longestCueIds(withHands, dur) {
    const keys = withHands ? RTD_ORDER.concat("hands") : RTD_ORDER;
    return keys.map(key => Object.keys(RTD_PHRASE[key]).map(v => RTD_PHRASE[key][v])
      .reduce((a, b) => (dur[b] > dur[a] ? b : a)));
  }

  // Read the D settings check (and its rule table). Returns null, or
  // { field: "speech" | "readTheD", message }.
  function validateReadTheD(s, dur) {
    const main = message => ({ field: "readTheD", message });
    const speechError = validateSpeech(s);
    if (speechError) return speechError;
    const rd = s.readTheD;
    const cfg = rtdConfig(s);

    if (!(rd.rate >= 0.5 && rd.rate <= 2)) return main("Cue speech rate must be between 0.5 and 2.0.");
    if (rd.rate > s.maxRate + 1e-9) {
      return main("Cue speech rate " + rd.rate + " is above the max speech rate " + s.maxRate +
        ". Raise the max speech rate or lower the cue speech rate.");
    }
    if (!isWholeNonNegative(rd.cueGapMs)) return main("Gap between cue calls must be a whole number of 0 ms or more.");
    if (!isWhole(rd.decisionMs) || rd.decisionMs < 500) return main("Decision window must be a whole number of at least 500 ms.");
    if ([rd.hands, rd.midDribble, rd.secondRead, rd.practice].some(f => f !== 0 && f !== 1)) {
      return main("Hands call, mid-dribble, second read and practice mode must each be off or on.");
    }
    if (!isWholeNonNegative(rd.secondGapMinMs) || !isWholeNonNegative(rd.secondGapMaxMs) || rd.secondGapMinMs > rd.secondGapMaxMs) {
      return main("Second read gap: min and max must be whole numbers of 0 ms or more, min not above max.");
    }
    if (!isWholeNonNegative(rd.practicePauseMs)) return main("Practice pause must be a whole number of 0 ms or more.");
    if (!isWhole(rd.readMinMs) || !isWhole(rd.readMaxMs) || rd.readMinMs < 100 || rd.readMaxMs < 100) {
      return main("Read times must be whole numbers of at least 100 ms.");
    }
    if (rd.readMinMs > rd.readMaxMs) return main("Min read time must not exceed max read time.");
    if (!isWholeNonNegative(rd.liveDelayMinMs) || !isWholeNonNegative(rd.liveDelayMaxMs) || rd.liveDelayMinMs > rd.liveDelayMaxMs) {
      return main("LIVE delay: min and max must be whole numbers of 0 ms or more, min not above max.");
    }
    if (!isWholeNonNegative(rd.resetPauseMs)) return main("Reset pause must be a whole number of 0 ms or more.");

    // The rule table (TRAINING_DEFAULTS.readTheD): known actions and cues, never
    // the hands call, and an answer for every state.
    if (!Array.isArray(cfg.rules) || cfg.rules.length === 0) return main("Read the D needs its rule table.");
    for (const rule of cfg.rules) {
      const name = "Rule " + rule.id;
      if (RTD_RULE_ACTIONS.indexOf(rule.action) === -1) return main(name + ": unknown action " + rule.action + ".");
      if (RTD_EVIDENCE.indexOf(rule.evidence) === -1 || typeof rule.why !== "string" || typeof rule.answer !== "string") {
        return main(name + " needs an answer, a why and an evidence tag.");
      }
      if (!(dur["W_" + rule.id] > 0)) return main(name + " has no spoken why (W_" + rule.id + ").");
      if (!Array.isArray(rule.when) || rule.when.length === 0) return main(name + " needs at least one when entry.");
      for (const entry of rule.when) {
        const keys = Object.keys(entry.match || {});
        if (typeof entry.situation !== "string" || !keys.every(k => RTD_ORDER.indexOf(k) !== -1 &&
            Array.isArray(entry.match[k]) && entry.match[k].every(v => RTD_VALUES[k].indexOf(v) !== -1))) {
          return main(name + ": a when entry may only match momentum, distance and lead foot values, and needs a situation.");
        }
      }
    }
    const uncovered = rtdStates(false).find(st => !correctAction(st, cfg.rules));
    if (uncovered) {
      return main("No rule covers " + RTD_ORDER.map(k => s.phrases[RTD_PHRASE[k][uncovered[k]]].display).join(" · ") + ".");
    }
    const w = cfg.actionWeights;
    if (!RTD_ACTIONS.every(a => isNonNegative(w[a]))) return main("Action weights must be numbers of 0 or more.");
    if (!(sumOf(RTD_ACTIONS, w) > 0)) return main("Action weights must add up to more than 0.");
    const srProblem = secondReadProblem(cfg.secondRead);
    if (srProblem) return main(srProblem);

    if (layoutCues(longestCueIds(rd.hands === 1, dur).concat("D_NOW"), 0, s, dur) === null) {
      return main("The cue calls don't fit at cue speech rate " + rd.rate + ".");
    }
    return null;
  }

  // Per level: the cue rate and gap, the longest cue sequence and how long it is spoken.
  function readTheDFitTable(s, dur) {
    return TRAINING_DEFAULTS.levels.readTheD.map((values, i) => {
      const ls = applyLevel(s, "readTheD", i + 1, TRAINING_DEFAULTS);
      const rd = ls.readTheD;
      const ids = longestCueIds(rd.hands === 1, dur).concat("D_NOW");
      const laid = layoutCues(ids, 0, ls, dur);
      const last = laid ? laid[laid.length - 1] : null;
      return {
        level: i + 1,
        rate: rd.rate,
        cueGapMs: rd.cueGapMs,
        sequence: ids.map(id => s.phrases[id].display).join(" > "),
        sequenceMs: last ? Math.round(last.atMs + last.durMs) : null,
        decisionMs: rd.decisionMs,
        fits: last ? "yes" : "no",
      };
    });
  }

  // Read the D: vocabulary, rules, validation, call sequences, timing and sampling.
  function readTheDSelfTest(check, reps) {
    const t = TRAINING_DEFAULTS;
    const cfg = t.readTheD;
    const defaults = Object.assign(cloneSettings(OFFENSE_DEFAULTS), { training: Object.assign({}, t) });
    const dur = durationsFor(defaults, null);
    const atLevel = level => applyLevel(defaults, "readTheD", level, t);
    const show = st => RTD_ORDER.concat("hands").map(k => st[k]).filter(Boolean).join("/");
    const isHands = id => id === RTD_PHRASE.hands.up || id === RTD_PHRASE.hands.down;

    // 1. Vocabulary.
    const vf = [];
    const words = { D_CLOSING: "CLOSING", D_SET: "SET", D_RETREATING: "RETREATING", D_TIGHT: "TIGHT", D_CUSHION: "NO OPENING",
      D_SAG: "SAGGING", D_LEFT_FOOT: "LEFT FOOT", D_RIGHT_FOOT: "RIGHT FOOT", D_HANDS_UP: "HANDS UP",
      D_HANDS_DOWN: "HANDS DOWN", D_NOW: "NOW", D_LIVE: "LIVE" };
    Object.keys(words).forEach(id => {
      const p = defaults.phrases[id];
      if (!p || p.display !== words[id] || p.spoken !== words[id].toLowerCase() || !(p.estMs > 0)) vf.push(id);
    });
    Object.keys(RTD_VALUES).forEach(k => RTD_VALUES[k].forEach(v => { if (!words[RTD_PHRASE[k][v]]) vf.push(k + " " + v + " has no call"); }));
    check("read the d: 11 cue phrases and LIVE, spoken as shown, with estimates; every state value has its call", vf);

    // 2. correctAction against the rule table, written out independently here.
    const lead = st => (st.leadFoot === "left" ? "DRIVE_LEFT" : "DRIVE_RIGHT");
    const expected = st => st.momentum === "closing" ? lead(st)
      : st.distance === "sag" || st.momentum === "retreating" ? "PULL_UP"
      : st.momentum === "set" && st.distance === "tight" ? lead(st)
      : st.momentum === "set" && st.distance === "cushion" ? "CREATE_SPACE" : null;
    const rf = [];
    const withHands = rtdStates(true);
    const plain = rtdStates(false);
    if (withHands.length !== 36 || plain.length !== 18) rf.push("state counts " + plain.length + " / " + withHands.length);
    plain.concat(withHands).forEach(st => {
      const c = correctAction(st, cfg.rules);
      if (!c || c.action !== expected(st)) rf.push(show(st) + " -> " + (c && c.action));
    });
    check("read the d: correctAction matches the rule table for all 3 x 3 x 2 (x 2 hands) states", rf);

    // 3. The hands call never changes the answer.
    const hf = [];
    plain.forEach(st => {
      const a = correctAction(st, cfg.rules);
      RTD_HANDS.forEach(h => {
        const b = correctAction(Object.assign({}, st, { hands: h }), cfg.rules);
        if (b.action !== a.action || b.ruleId !== a.ruleId) hf.push(show(st) + " hands " + h);
      });
    });
    check("read the d: the hands distractor never changes the answer", hf);

    // 4. Every rule explains itself; only the tight, set lead-foot rule is study-based.
    const ef = [];
    cfg.rules.forEach(r => {
      if (!r.why || !r.answer || RTD_EVIDENCE.indexOf(r.evidence) === -1) ef.push(r.id);
      r.when.forEach(w => { if (!w.situation) ef.push(r.id + " situation"); });
    });
    plain.forEach(st => {
      const study = correctAction(st, cfg.rules).evidence === "study-based";
      if (study !== (st.momentum === "set" && st.distance === "tight")) ef.push(show(st) + " evidence");
    });
    check("read the d: every rule has a why and an evidence tag; only the tight, set lead-foot rule is study-based", ef);

    // 5. Validation.
    const valf = [];
    [null, 1, 2, 3, 4, 5].forEach(level => {
      const e = validateReadTheD(level === null ? defaults : atLevel(level), dur);
      if (e) valf.push((level === null ? "defaults" : "level " + level) + ": " + e.message);
    });
    const variant = (rd, rules) => {
      const s = cloneSettings(defaults);
      Object.assign(s.readTheD, rd || {});
      if (rules) s.training.readTheD = Object.assign({}, cfg, rules);
      return s;
    };
    [[{ rate: 1.7 }], [{ rate: 0.4 }], [{ cueGapMs: -1 }], [{ cueGapMs: 1.5 }], [{ decisionMs: 400 }], [{ decisionMs: NaN }],
     [{ hands: 2 }], [{ midDribble: 0.5 }], [{ practice: -1 }], [{ practicePauseMs: -5 }], [{ readMinMs: 50 }], [{ readMinMs: 4000 }], [{ liveDelayMinMs: 1600 }],
     [{ liveDelayMinMs: -1 }], [{ resetPauseMs: -1 }],
     [null, { rules: cfg.rules.filter(r => r.id !== "cushionSet") }],
     [null, { rules: cfg.rules.concat({ id: "x", when: [{ match: { hands: ["up"] }, situation: "x" }], action: "PULL_UP", answer: "x", why: "x", evidence: "study-based" }) }],
     [null, { rules: [Object.assign({}, cfg.rules[0], { action: "PASS" })].concat(cfg.rules.slice(1)) }],
     [null, { rules: [Object.assign({}, cfg.rules[0], { evidence: "hunch" })].concat(cfg.rules.slice(1)) }],
     [null, { actionWeights: { DRIVE_LEFT: 0, DRIVE_RIGHT: 0, PULL_UP: 0, CREATE_SPACE: 0 } }],
     [null, { actionWeights: { DRIVE_LEFT: -1, DRIVE_RIGHT: 25, PULL_UP: 25, CREATE_SPACE: 25 } }],
    ].forEach(c => {
      const e = validateReadTheD(variant(c[0], c[1]), dur);
      if (!e || e.field !== "readTheD") valf.push("accepted " + JSON.stringify(c[0] || Object.keys(c[1])));
    });
    const speechBad = validateReadTheD(Object.assign(variant(), { baseRate: 3 }), dur);
    if (!speechBad || speechBad.field !== "speech") valf.push("accepted base rate 3");
    check("read the d: defaults and all 5 levels validate; bad rate, gap, window, flags, ranges, rules and weights are rejected", valf);

    // 6-7. Call sequences and timing, at every level.
    const sf = [];
    const tf = [];
    const handPos = {};
    for (let level = 1; level <= 5; level++) {
      const s = atLevel(level);
      const rd = s.readTheD;
      handPos[level] = [0, 0, 0, 0];
      let last = null;
      for (let n = 0; n < Math.ceil(reps / 5); n++) {
        const plan = planReadTheDRep(s, dur, Math.random, null, { lastState: last });
        const c = plan.calls;
        const ids = c.map(x => x.id);
        const cue = plan.cues[0];
        const st = cue.state;
        last = st;
        const where = "L" + level + ": " + ids.join(" > ");
        const leadIn = rd.midDribble === 1 ? "D_LIVE" : "READ";
        if (ids[0] !== leadIn || c[0].atMs !== 0 || c[0].rate !== s.baseRate) sf.push(where + " (lead-in)");
        // The first decision: everything up to the first NOW (a second read follows it at Levels 4-5).
        const fc = c.slice(0, ids.indexOf("D_NOW") + 1);
        const seq = ids.slice(1, fc.length);
        if (fc.length === 0 || seq.length < 4) sf.push(where + " (no NOW)");
        const core = seq.slice(0, -1).filter(id => !isHands(id));
        if (core.join() !== RTD_ORDER.map(k => RTD_PHRASE[k][st[k]]).join()) sf.push(where + " (order, or not the state's calls)");
        const h = seq.findIndex(isHands);
        if (level >= 3) {
          if (h === -1 || seq[h] !== RTD_PHRASE.hands[st.hands]) sf.push(where + " (hands)");
          else handPos[level][h]++;
        } else if (h !== -1 || st.hands !== undefined) sf.push(where + " (hands below Level 3)");
        if (cue.ids.join() !== seq.slice(0, -1).join() || cue.correct !== correctAction(st, cfg.rules).action) sf.push(where + " (cue record)");

        // Timing: lead-in wait, cue rate and gaps, the window from NOW.
        const end = x => x.atMs + x.durMs;
        const range = rd.midDribble === 1 ? [rd.liveDelayMinMs, rd.liveDelayMaxMs] : [rd.readMinMs, rd.readMaxMs];
        const clamp = end(c[0]) + s.minGapMs;
        if (c[1].atMs < Math.max(range[0], clamp) - EPS || c[1].atMs > Math.max(range[1], clamp) + EPS) tf.push(where + " (first cue at " + c[1].atMs + ")");
        for (let k = 1; k < fc.length; k++) {
          if (Math.abs(c[k].rate - rd.rate) > EPS || Math.abs(c[k].durMs - dur[c[k].id] / rd.rate) > EPS) tf.push(where + " (rate)");
          if (k > 1 && Math.abs(c[k].atMs - end(c[k - 1]) - rd.cueGapMs) > EPS) tf.push(where + " (gap)");
        }
        for (let k = 1; k < c.length; k++) if (c[k].atMs < end(c[k - 1]) - EPS) tf.push(where + " (overlap)");
        const now = fc[fc.length - 1];
        const w = plan.windows;
        const single = plan.cues.length === 1;
        if (w.length !== plan.cues.length || w[0].startMs !== now.atMs || w[0].durMs !== rd.decisionMs || cue.atMs !== now.atMs ||
            cue.durMs !== rd.decisionMs || (single && plan.endMs !== now.atMs + rd.decisionMs) || plan.restMs !== rd.resetPauseMs) {
          tf.push(where + " (window)");
        }
        if (fitRateIn(seq, end(now) - c[1].atMs, 0, { baseRate: rd.rate, maxRate: s.maxRate, minGapMs: rd.cueGapMs }, dur) === null) {
          tf.push(where + " (does not fit at the level's rate)");
        }
      }
      if (level >= 3 && handPos[level].some(x => x === 0)) sf.push("L" + level + ": hands positions " + handPos[level].join("/"));
    }
    check("read the d: lead-in, momentum > distance > lead foot in order, hands only from Level 3 at a random place, NOW last", sf);
    check("read the d: no overlaps; cues at the level's rate with its gap, after the read time or LIVE delay; NOW opens the decision window", tf);

    // 8-9. Sampling: action shares follow the weights; never the same state twice in a row.
    const ff = [];
    const pf = [];
    [1, 3].forEach(level => {
      const s = atLevel(level);
      const tally = {};
      const seen = {};
      let last = null;
      const n = reps * 4;
      for (let i = 0; i < n; i++) {
        const st = planReadTheDRep(s, dur, Math.random, null, { lastState: last }).cues[0].state;
        if (sameState(st, last)) pf.push("L" + level + ": " + show(st) + " twice");
        last = st;
        const a = correctAction(st, cfg.rules).action;
        tally[a] = (tally[a] || 0) + 1;
        seen[show(st)] = true;
      }
      const total = sumOf(RTD_ACTIONS, cfg.actionWeights);
      RTD_ACTIONS.forEach(a => {
        const got = (tally[a] || 0) / n;
        if (Math.abs(got - cfg.actionWeights[a] / total) > 0.02) ff.push("L" + level + " " + a + " " + got.toFixed(3));
      });
      if (Object.keys(seen).length !== rtdStates(s.readTheD.hands === 1).length) pf.push("L" + level + ": only " + Object.keys(seen).length + " states came up");
    });
    check("read the d: correct-action shares match the weights within 2 points over " + reps * 4 + " reps", ff);
    check("read the d: the same state never comes twice in a row, and every state comes up", pf);

    // 10. Practice mode: after the window, the pause, the correct action, then its why as the caption.
    const xf = [];
    RTD_ACTIONS.forEach(a => { if (!(dur["A_" + a] > 0)) xf.push("A_" + a + " phrase"); });
    cfg.rules.forEach(r => {
      const p = defaults.phrases["W_" + r.id];
      if (!p || p.display !== r.why || p.spoken !== r.why || !(p.estMs > 0)) xf.push("W_" + r.id + " phrase");
    });
    [1, 3, 5].forEach(level => {
      const s = atLevel(level);
      s.readTheD.practice = 1;
      const rd = s.readTheD;
      if (validateReadTheD(s, dur)) xf.push("L" + level + " practice does not validate");
      for (let n = 0; n < 500; n++) {
        const plan = planReadTheDRep(s, dur, Math.random);
        const ids = plan.calls.map(x => x.id);
        const where = "L" + level + ": " + ids.join(" > ");
        const cue = plan.cues[0];
        const k = ids.indexOf("D_NOW");
        const answer = plan.calls[k + 1];
        const why = plan.calls[k + 2];
        const windowEnd = cue.atMs + cue.durMs;
        if (!answer || answer.id !== "A_" + cue.correct || Math.abs(answer.atMs - windowEnd - rd.practicePauseMs) > EPS) xf.push(where + " (answer)");
        if (!why || why.id !== "W_" + cue.ruleId || why.show !== "caption" || why.atMs < answer.atMs + answer.durMs + s.minGapMs - EPS) xf.push(where + " (why)");
        if (answer && answer.show !== undefined) xf.push(where + " (answer shown as caption)");
        const lastCall = plan.calls[plan.calls.length - 1];
        if (Math.abs(plan.endMs - (lastCall.atMs + lastCall.durMs)) > EPS || plan.calls.filter(x => x.show === "caption").length !== plan.cues.length) {
          xf.push(where + " (endMs, or not one why per decision)");
        }
        repPlanProblems(plan, s.phrases).forEach(x => xf.push(where + " " + x));
      }
    });
    check("read the d: practice mode says the correct action after the window and its why as a caption, then rests", xf);

    // 11. Second read (Levels 4-5): how often, the gap, the state that follows, its own full window.
    const rdf = [];
    const sr = cfg.secondRead;
    for (let level = 1; level <= 5; level++) {
      const s = atLevel(level);
      const rd = s.readTheD;
      const n = level >= 4 ? reps * 2 : Math.ceil(reps / 5);
      let seconds = 0;
      const reactions = {};
      for (let i = 0; i < n; i++) {
        const plan = planReadTheDRep(s, dur, Math.random);
        const where = "L" + level + ": " + plan.calls.map(x => x.id).join(" > ");
        if (plan.cues.length === 1) continue;
        seconds++;
        if (level < 4 || plan.cues.length !== 2) { rdf.push(where + " (second read at Level " + level + ")"); continue; }
        const a = plan.cues[0];
        const b = plan.cues[1];
        // Gap from the end of the first window to the first call of the second sequence.
        const firstCue = plan.calls.find(x => x.atMs > a.atMs + a.durMs - EPS);
        const gap = firstCue.atMs - (a.atMs + a.durMs);
        if (gap < rd.secondGapMinMs - EPS || gap > rd.secondGapMaxMs + EPS) rdf.push(where + " (gap " + gap + ")");
        // Each window gets the level's full decision time; the rep ends with the second.
        if (plan.windows.length !== 2 || plan.windows.some(w => w.durMs !== rd.decisionMs) ||
            b.durMs !== rd.decisionMs || plan.endMs !== b.atMs + b.durMs) rdf.push(where + " (windows)");
        // Same fixed order, no hands, then NOW; scored with the same rules.
        const second = plan.calls.filter(x => x.atMs >= firstCue.atMs - EPS).map(x => x.id);
        if (second.join() !== RTD_ORDER.map(k => RTD_PHRASE[k][b.state[k]]).concat("D_NOW").join() || b.state.hands !== undefined) {
          rdf.push(where + " (second sequence)");
        }
        if (b.correct !== correctAction(b.state, cfg.rules).action) rdf.push(where + " (second answer)");
        // The state follows the mapping from the first correct action.
        const drove = a.correct === "DRIVE_LEFT" || a.correct === "DRIVE_RIGHT";
        const other = a.correct === "DRIVE_LEFT" ? "DRIVE_RIGHT" : "DRIVE_LEFT";
        const st = b.state;
        const ok = drove
          ? (b.reaction === "cutOff" && st.momentum === "set" && st.distance === "tight" && b.correct === other) ||
            (b.reaction === "retreat" && st.momentum === "retreating" && b.correct === "PULL_UP")
          : b.reaction === "closeout" && st.momentum === "closing" && b.correct === (st.leadFoot === "left" ? "DRIVE_LEFT" : "DRIVE_RIGHT");
        if (!ok) rdf.push(where + " (reaction " + b.reaction + " after " + a.correct + ")");
        reactions[b.reaction] = (reactions[b.reaction] || 0) + 1;
      }
      if (level >= 4) {
        if (Math.abs(seconds / n - sr.chance) > 0.02) rdf.push("L" + level + ": second read in " + (seconds / n).toFixed(3) + " of reps");
        ["cutOff", "retreat", "closeout"].forEach(id => { if (!reactions[id]) rdf.push("L" + level + ": " + id + " never came up"); });
      }
    }
    const srBad = [{ chance: 1.5 }, { afterDrive: [] }, { afterDrive: [{ id: "x", weight: 0, state: sr.afterDrive[0].state }] },
      { afterPullUpOrCreateSpace: [{ id: "x", weight: 1, state: { momentum: "closing", distance: "far", leadFoot: "random" } }] },
      { afterPullUpOrCreateSpace: [{ id: "x", weight: 1, state: { momentum: "opposite", distance: "tight", leadFoot: "left" } }] }];
    srBad.forEach(c => {
      const s = cloneSettings(defaults);
      s.training.readTheD = Object.assign({}, cfg, { secondRead: Object.assign({}, sr, c) });
      if (!validateReadTheD(s, dur)) rdf.push("accepted second read " + JSON.stringify(c));
    });
    [{ secondRead: 2 }, { secondGapMinMs: 1300 }, { secondGapMinMs: -1 }].forEach(c => {
      if (!validateReadTheD(Object.assign(cloneSettings(defaults), { readTheD: Object.assign({}, defaults.readTheD, c) }), dur)) rdf.push("accepted " + JSON.stringify(c));
    });
    check("read the d: second read only at Levels 4-5, in " + Math.round(sr.chance * 100) + "% of reps (within 2 points), " +
      defaults.readTheD.secondGapMinMs + "-" + defaults.readTheD.secondGapMaxMs + " ms after the first window, following the mapping, each with a full window", rdf);

    return readTheDFitTable(defaults, dur);
  }

  P.registerDrill({
    id: "readTheD",
    phraseIds: ["READ", "D_LIVE"].concat(...Object.keys(RTD_PHRASE).map(k => Object.keys(RTD_PHRASE[k]).map(v => RTD_PHRASE[k][v])), "D_NOW"),
    next: null,  // no state machine: a fixed call order (RTD_ORDER)
    weightTables: [],  // action weights live in TRAINING_DEFAULTS.readTheD
    planRep: planReadTheDRep,
    validate: validateReadTheD,
    fitTable: readTheDFitTable,
    levelled: true,
    levelWindow: s => s.readTheD.decisionMs,
    selfTest: readTheDSelfTest,
    // levelDecision is added by scoring.js.
  });

  Object.assign(P, {
    RTD_ORDER,
    RTD_PHRASE,
    RTD_ACTIONS,
    RTD_ACTION_NAMES,
    correctAction,
    rtdStates,
    sampleState,
    planReadTheDRep,
    validateReadTheD,
    readTheDFitTable,
  });
})(OffensePlanner);
