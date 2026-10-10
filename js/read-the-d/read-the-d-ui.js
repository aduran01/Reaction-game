// Read the D in the app: cue colors by role and the decision review on the set log.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const reviewList = document.getElementById("reviewList");

const RTD_ROLE_CLASS = { momentum: "word-momentum", distance: "word-distance", leadFoot: "word-foot", hands: "word-hands" };
Object.keys(P.RTD_PHRASE).forEach(key => Object.keys(P.RTD_PHRASE[key]).forEach(value => {
  PHRASE_CLASS[P.RTD_PHRASE[key][value]] = RTD_ROLE_CLASS[key];
}));

// ---- Read the D decision review (set log) ----
// One item per decision of the set's finished reps: { decision, wrong, choice }.
// A decision counts as right unless flipped to "something else" and a choice picked.

const RTD_RULES = P.TRAINING_DEFAULTS.readTheD.rules;
const REVIEW_LABELS = { DRIVE_LEFT: "Drive L", DRIVE_RIGHT: "Drive R", PULL_UP: "Pull up", CREATE_SPACE: "Create space", FROZE: "Froze" };
let reviewItems = [];
let lastDecisionLines = null;  // rest-screen accuracy and most-common-miss lines

function callText(ids) {
  return ids.map(id => OFFENSE_DEFAULTS.phrases[id].display).join(" · ");
}

// The logged form of each decision in repCues (actual still null).
function decisionsOf(repCues) {
  const out = [];
  repCues.forEach((cues, i) => cues.forEach((cue, k) => {
    const c = P.correctAction(cue.state, RTD_RULES);
    out.push({ rep: i + 1, read: k + 1, ids: cue.ids.slice(), state: Object.assign({}, cue.state),
      correct: cue.correct, ruleId: cue.ruleId, situation: c ? c.situation : "" });
  }));
  return out;
}

function renderReview() {
  const reads = {};
  reviewItems.forEach(item => { reads[item.decision.rep] = (reads[item.decision.rep] || 0) + 1; });
  reviewList.replaceChildren(...reviewItems.map(item => {
    const d = item.decision;
    const row = el("div", "review-row" + (item.wrong ? " wrong" : ""));
    const seq = el("p", "review-seq");
    seq.append(el("span", "rep", "Rep " + d.rep + (reads[d.rep] > 1 ? " · read " + d.read : "")), callText(d.ids));
    const rule = RTD_RULES.find(r => r.id === d.ruleId);
    const answer = el("p", "review-answer", P.RTD_ACTION_NAMES[d.correct] + (rule ? " — " + rule.why : ""));
    const toggle = el("button", "review-toggle", item.wrong ? "✗ I did something else" : "✓ I did that");
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", String(!item.wrong));
    toggle.addEventListener("click", () => {
      item.wrong = !item.wrong;
      item.choice = null;
      logError.textContent = "";
      renderReview();
    });
    row.append(seq, answer, toggle);
    if (item.wrong) {
      const choices = el("div", "review-choices");
      choices.setAttribute("role", "group");
      choices.setAttribute("aria-label", "What you did on rep " + d.rep);
      P.RTD_REVIEW_ACTIONS.forEach(a => {
        const b = el("button", null, REVIEW_LABELS[a]);
        b.type = "button";
        b.setAttribute("aria-pressed", String(item.choice === a));
        b.addEventListener("click", () => {
          item.choice = a;
          logError.textContent = "";
          renderReview();
        });
        choices.appendChild(b);
      });
      row.appendChild(choices);
    }
    return row;
  }));
}

// The reviewed decisions, or null (with the reason shown) if a flipped one has no pick.
function reviewedDecisions() {
  const missing = reviewItems.find(item => item.wrong && item.choice === null);
  if (missing) {
    logError.textContent = "Pick what you did for rep " + missing.decision.rep + ", or tap ✗ to set it back to ✓.";
    return null;
  }
  return reviewItems.map(item => Object.assign({}, item.decision, { actual: item.wrong ? item.choice : item.decision.correct }));
}
