// History screen: trend charts, the session list and the export reminder.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const backupReminder = document.getElementById("backupReminder");
const historyTrends = document.getElementById("historyTrends");
const historyList = document.getElementById("historyList");
const lastExportText = document.getElementById("lastExportText");

// ---- History ----

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) +
    ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function shortDate(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs).forEach(k => node.setAttribute(k, attrs[k]));
  if (text !== undefined) node.textContent = text;
  return node;
}

// Make % (solid, left axis), lost handles per 10 reps (dashed, right axis) and,
// for Read the D, decisions right (dotted green, left axis).
function trendChart(series) {
  const box = { width: 320, height: 200, left: 38, right: 34, top: 24, bottom: 40 };
  const g = TrainingLog.trendGeometry(series, box);
  const p = g.plot;
  const root = svg("svg", {
    viewBox: "0 0 " + box.width + " " + box.height, role: "img",
    "aria-label": "Make percent" + (g.decision.length ? ", decisions right" : "") +
      " and lost handles per 10 reps over the last " + series.length + " sessions",
  });
  [0, 0.5, 1].forEach(f => {
    const y = p.y1 - (p.y1 - p.y0) * f;
    root.appendChild(svg("line", { class: "axis", x1: p.x0, x2: p.x1, y1: y, y2: y }));
    root.appendChild(svg("text", { class: "tick", x: p.x0 - 5, y: y + 3, "text-anchor": "end" }, Math.round(f * 100) + "%"));
    root.appendChild(svg("text", { class: "tick", x: p.x1 + 5, y: y + 3, "text-anchor": "start" }, String(+(g.lostMax * f).toFixed(1))));
  });
  root.appendChild(svg("line", { class: "axis", x1: p.x0, x2: p.x0, y1: p.y0, y2: p.y1 }));
  root.appendChild(svg("line", { class: "axis", x1: p.x1, x2: p.x1, y1: p.y0, y2: p.y1 }));
  // Axis titles.
  root.appendChild(svg("text", { class: "tick title-make", x: 2, y: 12, "text-anchor": "start" }, "Make %"));
  root.appendChild(svg("text", { class: "tick title-lost", x: box.width - 2, y: 12, "text-anchor": "end" }, "Lost handles / 10 reps"));
  root.appendChild(svg("text", { class: "tick", x: p.x0, y: p.y1 + 14, "text-anchor": "start" }, shortDate(series[0].startedAt)));
  root.appendChild(svg("text", { class: "tick", x: p.x1, y: p.y1 + 14, "text-anchor": "end" }, shortDate(series[series.length - 1].startedAt)));
  root.appendChild(svg("text", { class: "tick", x: (p.x0 + p.x1) / 2, y: box.height - 6, "text-anchor": "middle" },
    "Last " + series.length + " sessions, oldest → newest"));
  const pts = list => list.map(q => q.x.toFixed(1) + "," + q.y.toFixed(1)).join(" ");
  if (g.make.length > 1) root.appendChild(svg("polyline", { class: "line-make", points: pts(g.make) }));
  if (g.lost.length > 1) root.appendChild(svg("polyline", { class: "line-lost", points: pts(g.lost) }));
  if (g.decision.length > 1) root.appendChild(svg("polyline", { class: "line-decision", points: pts(g.decision) }));
  g.decision.forEach(q => root.appendChild(svg("circle", { class: "dot-decision", cx: q.x, cy: q.y, r: 3 })));
  g.make.forEach(q => root.appendChild(svg("circle", { class: "dot-make", cx: q.x, cy: q.y, r: 3 })));
  g.lost.forEach(q => root.appendChild(svg("circle", { class: "dot-lost", cx: q.x, cy: q.y, r: 3 })));
  return root;
}

function renderTrends() {
  const t = P.TRAINING_DEFAULTS;
  // Shooters only was removed; its trend is still shown while the log holds its sessions.
  const drills = Object.keys(DRILLS);
  if (TrainingLog.trendSeries(trainingLog.log, "shooters", 1).length) drills.push("shooters");
  historyTrends.replaceChildren(...drills.map(drill => {
    const card = el("div", "panel drill-card");
    card.appendChild(el("h2", "", DRILL_NAMES[drill] + " trend"));
    const series = TrainingLog.trendSeries(trainingLog.log, drill, t.trendSessions);
    if (series.length < t.trendMinSessions) {
      card.appendChild(el("p", "muted-text", "Not enough data (" + series.length + " of " + t.trendMinSessions + " sessions)."));
      return card;
    }
    const chart = el("div", "chart");
    chart.appendChild(trendChart(series));
    const legend = el("p", "legend");
    const items = [["#4f8cff", "Make % (left)"], ["#ff7a4f", "Lost handles per 10 reps (right, dashed)"]];
    if (series.some(pt => pt.decisionPct !== null)) items.push(["#4fd87c", "Decisions right % (left, dotted)"]);
    items.forEach(item => {
      const span = el("span");
      const sw = el("span", "swatch");
      sw.style.background = item[0];
      span.append(sw, item[1]);
      legend.appendChild(span);
    });
    card.append(chart, legend);
    return card;
  }));
}

function setLine(set, i) {
  const parts = ["Set " + (i + 1), DRILL_NAMES[set.drill] || set.drill];
  if (set.drill === "moveLab") {
    const name = id => { const move = moveById(id); return move ? move.display : id; };
    if (Array.isArray(set.extra.moveIds)) parts.push(set.extra.moveIds.map(name).join(", "));
    else parts.push(name(set.extra.moveId) + " " + (SIDE_NAMES[set.extra.side] || "").toLowerCase());
  }
  if (set.level !== null) parts.push("L" + set.level);
  parts.push(set.reps + (set.reps === 1 ? " rep" : " reps"));
  if (set.drill === "moveLab" && set.extra.cleanReps !== null) parts.push(set.extra.cleanReps + "/" + set.reps + " clean");
  if (set.drill === "readTheD") {
    const score = P.scoreDecisions(set.extra.decisions);
    parts.push(score.total ? score.correct + "/" + score.total + " decisions right" : "decisions not reviewed");
  }
  if (set.made === null) parts.push("not logged");
  else parts.push(set.made + "/" + set.attempted + " made");
  if (set.lostHandles !== null) parts.push(set.lostHandles + " lost");
  if (set.missedCalls !== null) parts.push(set.missedCalls + " missed");
  if (set.quality !== null) parts.push(QUALITY_NAMES[set.quality]);
  const line = el("p", "set-line", parts.join(" · "));
  if (set.note) line.appendChild(el("span", "note", set.note));
  return line;
}

function sessionDetail(s, item) {
  const detail = el("div", "history-detail");
  s.sets.forEach((set, i) => detail.appendChild(setLine(set, i)));
  const del = el("button", "danger-btn", "Delete session");
  del.type = "button";
  const confirm = el("div", "confirm hidden");
  confirm.appendChild(el("p", "", "Delete this session (" + s.sets.length + (s.sets.length === 1 ? " set" : " sets") +
    ")? This can't be undone, unless it is in an exported backup."));
  const row = el("div", "button-row");
  const yes = el("button", "danger-btn", "Delete");
  const no = el("button", "secondary-btn", "Cancel");
  yes.type = no.type = "button";
  row.append(yes, no);
  confirm.appendChild(row);
  del.addEventListener("click", () => { del.classList.add("hidden"); confirm.classList.remove("hidden"); });
  no.addEventListener("click", () => { confirm.classList.add("hidden"); del.classList.remove("hidden"); });
  yes.addEventListener("click", () => {
    const saved = saveTrainingLog(TrainingLog.deleteSession(trainingLog.log, s.id));
    item.remove();
    renderTrends();
    if (!historyList.children.length) renderSessionList();
    backupStatus.textContent = saved ? "Session deleted." : "Deleted here, but couldn't save to this device.";
  });
  detail.append(del, confirm);
  return detail;
}

function renderSessionList() {
  const sessions = trainingLog.log.sessions.filter(s => s && Array.isArray(s.sets)).slice().reverse()
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  if (!sessions.length) {
    historyList.replaceChildren(el("p", "muted-text", "No sessions yet. Log an Offense set to start your history."));
    return;
  }
  historyList.replaceChildren(...sessions.map(s => {
    const sum = TrainingLog.summarizeSession(s);
    const item = el("div", "history-item");
    const btn = el("button");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    const meta = [
      TrainingLog.sessionDrills(s).map(d => DRILL_NAMES[d] || d).join(" + "),
      sum.sets + (sum.sets === 1 ? " set" : " sets"),
      sum.makePct === null ? "make % not logged" : pctText(sum.makePct) + " made",
      sum.errorsPerRep === null ? "errors not logged" : (sum.errorsPerRep * 10).toFixed(1) + " errors / 10 reps",
    ];
    btn.append(el("span", "item-date", formatDate(s.startedAt)), el("span", "item-meta", meta.join(" · ")));
    let detail = null;
    btn.addEventListener("click", () => {
      if (!detail) {
        detail = sessionDetail(s, item);
        item.appendChild(detail);
      } else {
        detail.classList.toggle("hidden");
      }
      btn.setAttribute("aria-expanded", String(!detail.classList.contains("hidden")));
    });
    item.appendChild(btn);
    return item;
  }));
}

function lastExportAt() {
  return storageGet(STORAGE_LAST_EXPORT);
}

function renderLastExport() {
  const at = lastExportAt();
  lastExportText.textContent = at ? "Last export: " + formatDate(at) : "Never exported.";
}

function updateBackupReminder() {
  const n = TrainingLog.unexportedCount(trainingLog.log, lastExportAt());
  const show = n > P.TRAINING_DEFAULTS.backupReminderSessions;
  backupReminder.textContent = show
    ? n + " sessions aren't backed up yet. Open History and tap Export log to keep a copy." : "";
  backupReminder.classList.toggle("hidden", !show);
}

function openHistory() {
  renderTrends();
  renderSessionList();
  renderLastExport();
  backupStatus.textContent = "";
  backupTextBox.classList.add("hidden");
  importConfirm.classList.add("hidden");
  hideAllScreens();
  historyScreen.classList.remove("hidden");
  window.scrollTo(0, 0);
}
