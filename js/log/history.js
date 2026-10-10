// History over the training log: today vs earlier sessions, trend series and
// chart geometry, delete, import / merge, CSV export and backup bookkeeping.
// Pure (see js/core/planner.js); adds its functions to TrainingLog.
(function (L) {
  "use strict";
  const { LOG_VERSION, clone, isPlainObject, byStart, setsOfDrill, summarizeSets, validateSet, summarizeByDrill,
    sessionLengthMs } = L;

  Object.assign(OffensePlanner.TRAINING_DEFAULTS, {
    // Session summary: compare today with the mean of this many earlier sessions of the same drill.
    compareSessions: 5,
    // History: trend charts cover this many latest sessions per drill, and need at least trendMinSessions.
    trendSessions: 20,
    trendMinSessions: 3,
    // Start screen: remind to export once more than this many sessions are not backed up.
    backupReminderSessions: 10, // provisional
  });

  // Sessions with sets of this drill, oldest first.
  function sessionsWithDrill(log, drill) {
    return log.sessions.filter(s => isPlainObject(s) && typeof s.startedAt === "string" && setsOfDrill(s, drill).length > 0)
      .sort(byStart);
  }

  function mean(values) {
    const v = values.filter(x => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  // Today's make % and lost handles per 10 reps for one drill, against the mean
  // of the previous n sessions (started earlier) that played the same drill.
  function compareWithPrevious(log, session, drill, n) {
    const today = summarizeSets(setsOfDrill(session, drill));
    const prev = sessionsWithDrill(log, drill)
      .filter(s => s.id !== session.id && s.startedAt < session.startedAt)
      .slice(-n)
      .map(s => summarizeSets(setsOfDrill(s, drill)));
    return {
      drill,
      count: prev.length,
      today: { makePct: today.makePct, lostPer10: today.lostPer10, decisionPct: today.decisionPct },
      avg: {
        makePct: mean(prev.map(p => p.makePct)), lostPer10: mean(prev.map(p => p.lostPer10)),
        decisionPct: mean(prev.map(p => p.decisionPct)),
      },
    };
  }

  // "Make % 62 (avg 55). Lost handles 1.2 per 10 reps (avg 2.0)", led by
  // "Decisions 85% right (avg 78)" when decisions were reviewed (Read the D).
  function comparisonText(cmp) {
    const pct = x => String(Math.round(x * 100));
    const parts = [];
    if (cmp.today.decisionPct !== null && cmp.today.decisionPct !== undefined) {
      parts.push("Decisions " + pct(cmp.today.decisionPct) + "% right" +
        (cmp.avg.decisionPct !== null && cmp.avg.decisionPct !== undefined ? " (avg " + pct(cmp.avg.decisionPct) + ")" : ""));
    }
    if (cmp.today.makePct !== null) {
      parts.push("Make % " + pct(cmp.today.makePct) + (cmp.avg.makePct !== null ? " (avg " + pct(cmp.avg.makePct) + ")" : ""));
    }
    if (cmp.today.lostPer10 !== null) {
      parts.push("Lost handles " + cmp.today.lostPer10.toFixed(1) + " per 10 reps" +
        (cmp.avg.lostPer10 !== null ? " (avg " + cmp.avg.lostPer10.toFixed(1) + ")" : ""));
    }
    if (parts.length === 0) return "Nothing logged to compare.";
    if (cmp.count === 0) parts.push("No earlier sessions to compare with yet");
    return parts.join(". ");
  }

  // The last n sessions of a drill, oldest first:
  // [{ id, startedAt, makePct, lostPer10, decisionPct }] (decisionPct null unless decisions were reviewed).
  function trendSeries(log, drill, n) {
    return sessionsWithDrill(log, drill).slice(-n).map(s => {
      const sum = summarizeSets(setsOfDrill(s, drill));
      return { id: s.id, startedAt: s.startedAt, makePct: sum.makePct, lostPer10: sum.lostPer10, decisionPct: sum.decisionPct };
    });
  }

  // Chart geometry for a trend in box { width, height, left, right, top, bottom }
  // (the last four are padding). Make % and decision accuracy run 0..1 on the
  // left axis, lost handles per 10 reps 0..lostMax on the right; points with no
  // value are left out.
  function trendGeometry(series, box) {
    const plotW = box.width - box.left - box.right;
    const plotH = box.height - box.top - box.bottom;
    const n = series.length;
    const x = i => box.left + (n <= 1 ? plotW / 2 : i * plotW / (n - 1));
    const maxLost = Math.max(0, ...series.map(p => (p.lostPer10 === null ? 0 : p.lostPer10)));
    const lostMax = Math.max(2, Math.ceil(maxLost));
    const make = [];
    const lost = [];
    const decision = [];
    series.forEach((p, i) => {
      if (p.makePct !== null) make.push({ x: x(i), y: box.top + plotH * (1 - p.makePct), value: p.makePct });
      if (p.lostPer10 !== null) lost.push({ x: x(i), y: box.top + plotH * (1 - p.lostPer10 / lostMax), value: p.lostPer10 });
      if (p.decisionPct !== null && p.decisionPct !== undefined) {
        decision.push({ x: x(i), y: box.top + plotH * (1 - p.decisionPct), value: p.decisionPct });
      }
    });
    return { make, lost, decision, lostMax, plot: { x0: box.left, x1: box.left + plotW, y0: box.top, y1: box.top + plotH } };
  }

  // A new log without the session with this id.
  function deleteSession(log, id) {
    const next = clone(log);
    next.sessions = next.sessions.filter(s => !(s && s.id === id));
    return next;
  }

  // A stored session is importable if it has an id, a start time and only valid sets.
  function isValidSession(s) {
    return isPlainObject(s) && typeof s.id === "string" && s.id !== "" && typeof s.startedAt === "string" &&
      (s.endedAt === null || typeof s.endedAt === "string") && Array.isArray(s.sets) &&
      s.sets.every(set => validateSet(set) === null);
  }

  // Read an exported backup. Returns { log, skipped } (invalid sessions are
  // skipped) or { error } for text that isn't a version 1 log.
  function parseImport(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { error: "This isn't a backup file (it isn't valid JSON)." };
    }
    if (!isPlainObject(data) || !Array.isArray(data.sessions)) return { error: "This file isn't a Reaction Caller log." };
    if (data.version !== LOG_VERSION) {
      return {
        error: typeof data.version === "number" && data.version > LOG_VERSION
          ? "This backup is from a newer version of the app (log version " + data.version + "). Update the app first."
          : "This file has an unknown log version.",
      };
    }
    const sessions = data.sessions.filter(isValidSession);
    return { log: { version: LOG_VERSION, sessions: clone(sessions) }, skipped: data.sessions.length - sessions.length };
  }

  // Merge incoming sessions into a log by session id. New ids are added, exact
  // copies are skipped, and sessions that differ are only replaced when
  // replaceConflicts is true. Never duplicates an id. Inputs are not changed.
  // Returns { log, added, identical, conflicts } (arrays of ids).
  function mergeLogs(current, incoming, replaceConflicts) {
    const log = clone(current);
    const out = { log, added: [], identical: [], conflicts: [] };
    incoming.sessions.forEach(s => {
      const i = log.sessions.findIndex(x => x && x.id === s.id);
      if (i === -1) {
        log.sessions.push(clone(s));
        out.added.push(s.id);
      } else if (JSON.stringify(log.sessions[i]) === JSON.stringify(s)) {
        if (out.added.indexOf(s.id) === -1) out.identical.push(s.id);
      } else {
        out.conflicts.push(s.id);
        if (replaceConflicts) log.sessions[i] = clone(s);
      }
    });
    log.sessions.sort(byStart);
    return out;
  }

  const CSV_COLUMNS = [
    "session_id", "session_started", "set", "drill", "level", "reps", "set_started", "set_ended",
    "made", "attempted", "lost_handles", "missed_calls", "quality", "note",
  ];

  // One CSV field: empty for null, quoted (with "" for ") when it holds a comma,
  // quote, line break or leading/trailing space.
  function csvField(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // Every set as one CSV row (RFC 4180 style, CRLF line ends), oldest session first.
  function setsToCsv(log) {
    const rows = [CSV_COLUMNS.join(",")];
    log.sessions.slice().sort(byStart).forEach(s => {
      s.sets.forEach((set, i) => {
        rows.push([
          s.id, s.startedAt, i + 1, set.drill, set.level, set.reps, set.startedAt, set.endedAt,
          set.made, set.attempted, set.lostHandles, set.missedCalls, set.quality, set.note,
        ].map(csvField).join(","));
      });
    });
    return rows.join("\r\n") + "\r\n";
  }

  // "reaction-caller-log-2026-10-08.json" for a Date (local calendar day).
  function exportFileName(date, base, ext) {
    const two = n => String(n).padStart(2, "0");
    return base + "-" + date.getFullYear() + "-" + two(date.getMonth() + 1) + "-" + two(date.getDate()) + "." + ext;
  }

  // Sessions changed (ended, or started if never ended) after the last export.
  function unexportedCount(log, lastExportAt) {
    return log.sessions.filter(s => isPlainObject(s) &&
      (lastExportAt === null || (s.endedAt || s.startedAt || "") > lastExportAt)).length;
  }

  // Summary, comparison, trend, merge, import and CSV checks.
  function historySelfTest(check, base, withSet, near) {
    const day = d => "2026-03-" + String(d).padStart(2, "0") + "T10:00:00.000Z";
    const drive = (made, attempted, lost, missed, reps, quality) =>
      withSet({ drill: "drive", made, attempted, lostHandles: lost, missedCalls: missed, reps, quality });
    const shoot = (made, attempted, lost, missed, reps) =>
      withSet({ drill: "shooters", made, attempted, lostHandles: lost, missedCalls: missed, reps, quality: null });

    // 1. Per-drill summary, per-10 rates and session length.
    const sum = [];
    const today = {
      id: "today", startedAt: day(20), endedAt: "2026-03-20T10:32:10.000Z",
      sets: [drive(5, 8, 1, 0, 8, "clean"), shoot(6, 10, 0, 1, 10), drive(7, 8, 0, 0, 8, "rushed")],
    };
    const byDrill = summarizeByDrill(today);
    if (byDrill.map(d => d.drill).join() !== "drive,shooters") sum.push("drill order " + byDrill.map(d => d.drill));
    const d0 = byDrill[0].summary;
    if (d0.sets !== 2 || d0.reps !== 16 || d0.made !== 12 || d0.attempted !== 16 || !near(d0.makePct, 0.75)) sum.push("drive totals");
    if (!near(d0.lostPer10, 10 / 16) || !near(d0.missedPer10, 0) || !near(d0.cleanShare, 0.5)) sum.push("drive per-10 / clean");
    const s0 = byDrill[1].summary;
    if (s0.sets !== 1 || !near(s0.makePct, 0.6) || !near(s0.missedPer10, 1) || s0.cleanShare !== null) sum.push("shooters totals");
    if (sessionLengthMs(today) !== 32 * 60000 + 10000) sum.push("length " + sessionLengthMs(today));
    if (sessionLengthMs({ startedAt: day(1), endedAt: null }) !== null) sum.push("length without end");
    check("history: per-drill totals, per-10-rep rates, clean share and session length", sum);

    // 2. Compare with the mean of the previous 5 sessions of the same drill only.
    const cmpF = [];
    const sessions = [];
    // Days 1-7: drive sessions; made 1..7 of 10, lost handles 1..7 in 10 reps.
    for (let d = 1; d <= 7; d++) sessions.push({ id: "d" + d, startedAt: day(d), endedAt: day(d), sets: [drive(d, 10, d, 0, 10, null)] });
    sessions.push({ id: "sh", startedAt: day(8), endedAt: day(8), sets: [shoot(0, 10, 9, 9, 10)] });
    sessions.push({ id: "later", startedAt: day(25), endedAt: day(25), sets: [drive(0, 10, 9, 9, 10, null)] });
    const now = { id: "now", startedAt: day(20), endedAt: day(20), sets: [drive(62, 100, 12, 0, 100, null)] };
    const log = { version: 1, sessions: sessions.concat(now) };
    const cmp = compareWithPrevious(log, now, "drive", 5);
    // Previous 5 drive sessions: days 3-7, make 0.3..0.7 (avg 0.5), lost 3..7 per 10 (avg 5.0).
    if (cmp.count !== 5 || !near(cmp.avg.makePct, 0.5) || !near(cmp.avg.lostPer10, 5)) {
      cmpF.push("avg " + cmp.count + " " + cmp.avg.makePct + " " + cmp.avg.lostPer10);
    }
    const text = comparisonText(cmp);
    if (text !== "Make % 62 (avg 50). Lost handles 1.2 per 10 reps (avg 5.0)") cmpF.push("text: " + text);
    // Shooters wasn't played today: only the one earlier shooters session counts, today is empty.
    const other = compareWithPrevious(log, now, "shooters", 5);
    if (other.count !== 1 || other.today.makePct !== null || !near(other.avg.makePct, 0)) cmpF.push("shooters not played today");
    if (comparisonText(other) !== "Nothing logged to compare.") cmpF.push("empty today text");
    const alone = compareWithPrevious({ version: 1, sessions: [now] }, now, "drive", 5);
    if (alone.count !== 0 || comparisonText(alone) !== "Make % 62. Lost handles 1.2 per 10 reps. No earlier sessions to compare with yet") {
      cmpF.push("no history: " + comparisonText(alone));
    }
    const fewer = compareWithPrevious(log, { id: "x", startedAt: day(3), sets: [drive(1, 2, 0, 0, 2, null)] }, "drive", 5);
    if (fewer.count !== 2 || !near(fewer.avg.makePct, 0.15)) cmpF.push("fewer than 5 earlier sessions");
    check("history: today vs the mean of the previous 5 sessions of the same drill, and its text", cmpF);

    // 3. Trend series and chart geometry.
    const tr = [];
    const many = { version: 1, sessions: [] };
    for (let d = 1; d <= 25; d++) many.sessions.push({ id: "t" + d, startedAt: "2026-04-01T" + String(d % 24).padStart(2, "0") + ":" + String(d).padStart(2, "0") + ":00.000Z", sets: [drive(d % 10, 10, d % 4, 0, 10, null)] });
    const series = trendSeries(many, "drive", 20);
    if (series.length !== 20) tr.push("series length " + series.length);
    if (series.some((p, i) => i > 0 && series[i - 1].startedAt > p.startedAt)) tr.push("series not oldest first");
    if (trendSeries(many, "shooters", 20).length !== 0) tr.push("other drill counted");
    const box = { width: 320, height: 180, left: 40, right: 40, top: 10, bottom: 30 };
    const g = trendGeometry([
      { makePct: 1, lostPer10: 0 }, { makePct: null, lostPer10: 3.2 }, { makePct: 0, lostPer10: null },
    ], box);
    if (g.make.length !== 2 || g.lost.length !== 2) tr.push("null points not skipped");
    if (g.make[0].x !== 40 || g.make[1].x !== 280 || g.lost[1].x !== 160) tr.push("x positions");
    if (g.make[0].y !== 10 || g.make[1].y !== 150) tr.push("make % y (100% top, 0% bottom)");
    if (g.lostMax !== 4 || !near(g.lost[1].y, 10 + 140 * (1 - 3.2 / 4)) || g.lost[0].y !== 150) tr.push("lost handles axis");
    const single = trendGeometry([{ makePct: 0.5, lostPer10: 0.5 }], box);
    if (single.make[0].x !== 160 || single.lostMax !== 2) tr.push("single point");
    check("history: trend series (last 20, oldest first) and chart geometry", tr);

    // 4. Merge without duplicates.
    const mf = [];
    const s1 = { id: "a", startedAt: day(1), endedAt: day(1), sets: [base] };
    const s2 = { id: "b", startedAt: day(2), endedAt: day(2), sets: [base] };
    const s2b = { id: "b", startedAt: day(2), endedAt: day(3), sets: [base, base] };
    const s3 = { id: "c", startedAt: day(0), endedAt: day(0), sets: [base] };
    const mine = { version: 1, sessions: [s1, s2] };
    const theirs = { version: 1, sessions: [s2b, s3, s1, s3] };
    const before = JSON.stringify(mine);
    const keep = mergeLogs(mine, theirs, false);
    if (JSON.stringify(mine) !== before) mf.push("current log changed");
    if (keep.log.sessions.map(s => s.id).join() !== "c,a,b") mf.push("ids " + keep.log.sessions.map(s => s.id));
    if (keep.added.join() !== "c" || keep.identical.join() !== "a" || keep.conflicts.join() !== "b") mf.push("counts");
    if (keep.log.sessions[2].sets.length !== 1) mf.push("conflict replaced without asking");
    const repl = mergeLogs(mine, theirs, true);
    if (repl.log.sessions.find(s => s.id === "b").sets.length !== 2 || repl.log.sessions.length !== 3) mf.push("replace");
    const twice = mergeLogs(keep.log, theirs, false);
    if (twice.log.sessions.length !== 3 || twice.added.length !== 0) mf.push("second merge added sessions");
    const ids = repl.log.sessions.map(s => s.id);
    if (new Set(ids).size !== ids.length) mf.push("duplicate ids");
    check("history: merge by session id adds new, skips copies, asks before replacing, never duplicates", mf);

    // 5. Import parsing and delete.
    const imp = [];
    const exported = JSON.stringify(mine);
    const ok = parseImport(exported);
    if (!ok.log || ok.log.sessions.length !== 2 || ok.skipped !== 0) imp.push("export not importable");
    const withBad = JSON.stringify({ version: 1, sessions: [s1, { id: "", sets: [] }, { id: "z", startedAt: day(1), sets: [withSet({ made: 9 })] }] });
    const partly = parseImport(withBad);
    if (!partly.log || partly.log.sessions.length !== 1 || partly.skipped !== 2) imp.push("invalid sessions not skipped");
    ["{", "[]", '{"sessions":[]}', '{"version":2,"sessions":[]}', '{"version":"1","sessions":[]}'].forEach(t => {
      const r = parseImport(t);
      if (!r.error || r.log) imp.push("accepted " + t);
    });
    if (parseImport('{"version":3,"sessions":[]}').error.indexOf("newer version") === -1) imp.push("newer version message");
    const del = deleteSession(mine, "a");
    if (del.sessions.length !== 1 || del.sessions[0].id !== "b" || mine.sessions.length !== 2) imp.push("delete");
    check("history: import accepts an export, rejects other files, skips invalid sessions; delete one session", imp);

    // 6. CSV of sets.
    const csvF = [];
    if (csvField('He said "go", I went') !== '"He said ""go"", I went"') csvF.push("comma + quotes");
    if (csvField("line1\nline2") !== '"line1\nline2"') csvF.push("newline");
    if (csvField(" padded") !== '" padded"' || csvField("plain") !== "plain") csvF.push("spaces / plain");
    if (csvField(null) !== "" || csvField(0) !== "0") csvF.push("null / 0");
    const csvLog = { version: 1, sessions: [
      { id: "b", startedAt: day(2), sets: [withSet({ note: 'tired, "heavy" legs', level: 3 })] },
      { id: "a", startedAt: day(1), sets: [base, withSet({ made: null, attempted: null, lostHandles: null, missedCalls: null, quality: null })] },
    ] };
    const lines = setsToCsv(csvLog).split("\r\n");
    if (lines[0] !== CSV_COLUMNS.join(",") || lines.length !== 5 || lines[4] !== "") csvF.push("rows " + lines.length);
    if (lines[1].indexOf("a," + day(1) + ",1,drive,,8,") !== 0) csvF.push("row 1: " + lines[1]);
    if (lines[2].indexOf("a," + day(1) + ",2,drive,,8,") !== 0 || !lines[2].endsWith("Z,,,,,,")) csvF.push("skipped row: " + lines[2]);
    if (!lines[3].endsWith(',5,8,1,0,clean,"tired, ""heavy"" legs"') || lines[3].indexOf(",drive,3,8,") === -1) csvF.push("note row: " + lines[3]);
    check("history: CSV has one row per set and escapes notes with commas and quotes", csvF);

    // 7. File name and unexported count.
    const misc = [];
    if (exportFileName(new Date(2026, 0, 5, 23, 59), "reaction-caller-log", "json") !== "reaction-caller-log-2026-01-05.json") misc.push("file name");
    if (unexportedCount(log, null) !== log.sessions.length) misc.push("never exported");
    if (unexportedCount(log, day(19)) !== 2) misc.push("after export " + unexportedCount(log, day(19)));
    check("history: export file name and count of sessions since the last export", misc);
  }

  Object.assign(L, {
    compareWithPrevious,
    comparisonText,
    trendSeries,
    trendGeometry,
    deleteSession,
    parseImport,
    mergeLogs,
    csvField,
    setsToCsv,
    exportFileName,
    unexportedCount,
    historySelfTest,
  });
})(TrainingLog);
