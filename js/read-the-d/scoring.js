// Read the D scoring: the reps reviewed after the set (read right, or the call
// misread), the reads-right share, the most-missed call and the rest-screen
// lines. Pure (see js/core/planner.js).
(function (P) {
  "use strict";
  const { TRAINING_DEFAULTS, OFFENSE_DEFAULTS } = P;

  // A logged rep: { rep, chain, terminal, driveSide, ok, missedCall }; ok is
  // true (read it right), false (misread; missedCall is the call, or null) or
  // null when not reviewed (skipped set).

  // { total, right, share (null if none reviewed), missed: { id: count },
  //   mostMissed (id or null; ties go to the call missed first), mostMissedCount }.
  function scoreReads(reads) {
    const out = { total: 0, right: 0, share: null, missed: {}, mostMissed: null, mostMissedCount: 0 };
    const order = [];
    (reads || []).forEach(r => {
      if (!r || r.ok === null || r.ok === undefined) return;
      out.total++;
      if (r.ok) {
        out.right++;
        return;
      }
      if (r.missedCall) {
        if (!out.missed[r.missedCall]) {
          out.missed[r.missedCall] = 0;
          order.push(r.missedCall);
        }
        out.missed[r.missedCall]++;
      }
    });
    if (out.total > 0) out.share = out.right / out.total;
    order.forEach(id => {
      if (out.missed[id] > out.mostMissedCount) {
        out.mostMissed = id;
        out.mostMissedCount = out.missed[id];
      }
    });
    return out;
  }

  // The two rest-screen lines: ["7/8 reads right.", "Most missed: HANDS UP. <its read>"
  // or null], or null when nothing was reviewed. phrases gives the call's name,
  // reads (TRAINING_DEFAULTS.readTheD.reads) the read to make.
  function readsFeedback(score, phrases, reads) {
    if (!score || score.total === 0) return null;
    const lines = [score.right + "/" + score.total + " reads right.", null];
    const id = score.mostMissed;
    if (id) lines[1] = "Most missed: " + (phrases[id] ? phrases[id].display : id) + "." + (reads[id] ? " " + reads[id] : "");
    return lines;
  }

  // ---- Self-test (only called from ?selftest=1) ----

  function scoringSelfTest(check) {
    const f = [];
    const rep = (ok, missedCall) => ({ rep: 1, chain: ["D_GO", "D_SAG", "D_HANDS_UP", "D_HANDS_DOWN"], terminal: "D_HANDS_DOWN",
      driveSide: null, ok, missedCall: missedCall || null });
    const phrases = OFFENSE_DEFAULTS.phrases;
    const reads = TRAINING_DEFAULTS.readTheD.reads;
    // 8 reps, 7 right, HANDS UP misread.
    const eight = [rep(true), rep(true), rep(false, "D_HANDS_UP"), rep(true), rep(true), rep(true), rep(true), rep(true)];
    const s8 = scoreReads(eight);
    if (s8.total !== 8 || s8.right !== 7 || Math.abs(s8.share - 7 / 8) > 1e-9 || s8.mostMissed !== "D_HANDS_UP") f.push("7/8");
    const lines = readsFeedback(s8, phrases, reads);
    if (!lines || lines[0] !== "7/8 reads right." ||
        lines[1] !== "Most missed: HANDS UP. Don't take the shot: hesi and relocate, drive, or keep reading.") {
      f.push("lines " + JSON.stringify(lines));
    }
    // The most missed call; a tie goes to the call missed first.
    const most = scoreReads([rep(false, "D_SAG"), rep(false, "D_HANDS_UP"), rep(false, "D_HANDS_UP"), rep(false, "D_SAG"), rep(false, "D_SAG")]);
    if (most.mostMissed !== "D_SAG" || most.mostMissedCount !== 3) f.push("most missed");
    const tie = scoreReads([rep(false, "D_HANDS_UP"), rep(false, "D_SAG"), rep(false, "D_SAG"), rep(false, "D_HANDS_UP")]);
    if (tie.mostMissed !== "D_HANDS_UP") f.push("tie " + tie.mostMissed);
    // No misses, misses without a call, nothing reviewed.
    const clean = readsFeedback(scoreReads([rep(true), rep(true)]), phrases, reads);
    if (!clean || clean[0] !== "2/2 reads right." || clean[1] !== null) f.push("no misses");
    const noCall = scoreReads([rep(false), rep(true)]);
    if (noCall.total !== 2 || noCall.right !== 1 || noCall.mostMissed !== null || readsFeedback(noCall, phrases, reads)[1] !== null) f.push("miss without a call");
    const none = scoreReads([rep(null), rep(undefined)]);
    if (none.total !== 0 || none.share !== null || readsFeedback(none, phrases, reads) !== null || scoreReads(undefined).total !== 0) f.push("not reviewed");
    check("read the d scoring: reads-right share, the most-missed call (ties to the first), the two rest-screen lines", f);
  }

  P.registerSuite(scoringSelfTest);

  Object.assign(P, {
    scoreReads,
    readsFeedback,
  });
})(OffensePlanner);
