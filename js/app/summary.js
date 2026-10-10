// Session summary: one card per drill when a session ends.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const summaryLength = document.getElementById("summaryLength");
const summaryDrills = document.getElementById("summaryDrills");

// ---- Session summary ----

const QUALITY_NAMES = { clean: "Clean", rushed: "Rushed", off_balance: "Off-balance" };

function pctText(x) {
  return x === null ? "–" : Math.round(x * 100) + "%";
}

function per10Text(x) {
  return x === null ? "–" : x.toFixed(1);
}

function drillCard(drill, sum, sess) {
  const card = el("div", "panel drill-card");
  card.appendChild(el("h2", "", DRILL_NAMES[drill] || drill));
  const grid = el("dl", "stat-grid");
  const rows = [
    ["Sets", String(sum.sets)],
    ["Reps", String(sum.reps)],
    ["Made", sum.makePct === null ? "not logged" : sum.made + "/" + sum.attempted + " · " + pctText(sum.makePct)],
    ["Lost handles / 10 reps", per10Text(sum.lostPer10)],
    ["Missed calls / 10 reps", per10Text(sum.missedPer10)],
    ["Sets rated Clean", sum.cleanShare === null ? "–" : pctText(sum.cleanShare) + " of " + sum.ratedSets],
  ];
  if (drill === "moveLab") {
    rows.splice(2, 0, ["Clean reps", sum.cleanRepShare === null ? "–"
      : sum.cleanReps + "/" + sum.cleanRepsOf + " · " + pctText(sum.cleanRepShare)]);
  }
  if (drill === "readTheD") {
    rows.splice(2, 0, ["Decisions right", sum.decisionPct === null ? "–"
      : sum.decisionsCorrect + "/" + sum.decisions + " · " + pctText(sum.decisionPct)]);
  }
  rows.forEach(row => {
    const cell = el("div");
    cell.append(el("dt", "", row[0]), el("dd", "", row[1]));
    grid.appendChild(cell);
  });
  card.appendChild(grid);
  // Read the D: right decisions per correct action, and the most common miss.
  const score = sum.decisionScore;
  if (drill === "readTheD" && score && score.total > 0) {
    card.appendChild(el("p", "compare-line", P.RTD_ACTIONS.filter(a => score.byAction[a].total > 0)
      .map(a => REVIEW_LABELS[a] + " " + score.byAction[a].correct + "/" + score.byAction[a].total).join(" · ")));
    card.appendChild(el("p", "compare-line", score.topConfusion
      ? "Most common miss: " + P.confusionText(score.topConfusion) : "No misses."));
  }
  const cmp = TrainingLog.compareWithPrevious(trainingLog.log, sess, drill, P.TRAINING_DEFAULTS.compareSessions);
  card.appendChild(el("p", "compare-line", TrainingLog.comparisonText(cmp)));
  return card;
}

function showSummary(sess) {
  const len = TrainingLog.sessionLengthMs(sess);
  summaryLength.textContent = "Session length " + (len === null ? "unknown" : P.formatElapsed(len));
  summaryDrills.replaceChildren(...TrainingLog.summarizeByDrill(sess).map(d => drillCard(d.drill, d.summary, sess)));
  hideAllScreens();
  summaryScreen.classList.remove("hidden");
  window.scrollTo(0, 0);
}
