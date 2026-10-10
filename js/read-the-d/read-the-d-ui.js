// Read the D in the app: call colors by role, its weight-table fields, and the
// review of each rep on the set log.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const readTheDWeightTablesEl = document.getElementById("readTheDWeightTables");
const reviewList = document.getElementById("reviewList");

// ---- Call colors by role ----
Object.assign(PHRASE_CLASS, {
  D_GO: "word-read",
  D_TIGHT: "word-distance", D_CUSHION: "word-distance", D_SAG: "word-distance",
  D_RETREATING: "word-retreat",
  D_LEFT_FOOT: "word-foot", D_RIGHT_FOOT: "word-foot",
  D_HANDS_UP: "word-hands", D_HANDS_DOWN: "word-hands",
  D_LANE_OPEN: "word-lane",
  D_CUT_OFF: "word-cut",
  D_CROSSED: "word-crossed",
  D_HELP_LEFT: "word-help", D_HELP_RIGHT: "word-help",
  D_LAY_LEFT: "word-read", D_LAY_RIGHT: "word-read", D_LAY_CENTER: "word-read",
});

// ---- Settings: the weight tables under Chances ----
const READ_THE_D_WEIGHT_TABLE_TITLES = {
  entryWeights: "First read after GO",
  tightWeights: "After TIGHT",
  noOpeningWeights: "After NO OPENING",
  handsUpWeights: "After HANDS UP",
  helpSideWeights: "HELP D side",
  laySideWeights: "LAY side (the HELP D side is left out)",
};
// Side weights are keyed by side, not by call.
Object.assign(SHORT_LABELS, { drive: "Drive side", other: "Other side", center: "Center" });

// ---- Review after the set ----
// One item per finished rep: { read: { rep, chain, terminal, driveSide }, wrong, missedCall }.
// A rep counts as read right unless flipped to ✗; picking the misread call is optional.

const READS = P.TRAINING_DEFAULTS.readTheD.reads;
let reviewItems = [];
let lastReadLines = null;  // the rest-screen lines: reads right, most missed

function callText(ids) {
  return ids.map(id => (OFFENSE_DEFAULTS.phrases[id] ? OFFENSE_DEFAULTS.phrases[id].display : id)).join(" · ");
}

// The logged form of each finished rep in repCues (the machine plans one cue per rep).
function readsOf(repCues) {
  const out = [];
  repCues.forEach((cues, i) => {
    const c = cues[0];
    if (c && Array.isArray(c.chain)) out.push({ rep: i + 1, chain: c.chain.slice(), terminal: c.terminal, driveSide: c.driveSide });
  });
  return out;
}

function renderReview() {
  reviewList.replaceChildren(...reviewItems.map(item => {
    const r = item.read;
    const row = el("div", "review-row" + (item.wrong ? " wrong" : ""));
    const seq = el("p", "review-seq");
    seq.append(el("span", "rep", "Rep " + r.rep), callText(r.chain));
    const toggle = el("button", "review-toggle", item.wrong ? "✗ Misread" : "✓ Read it right");
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", String(!item.wrong));
    toggle.addEventListener("click", () => {
      item.wrong = !item.wrong;
      item.missedCall = null;
      renderReview();
    });
    row.append(seq, toggle);
    if (item.wrong) {
      // One chip per distinct call of the rep (not GO): tap the one you misread.
      row.appendChild(el("p", "review-chips-title", "Which call did you misread? (optional)"));
      const chips = el("div", "review-choices");
      chips.setAttribute("role", "group");
      chips.setAttribute("aria-label", "The call you misread on rep " + r.rep);
      r.chain.filter((id, k) => id !== "D_GO" && r.chain.indexOf(id) === k).forEach(id => {
        const b = el("button", null, OFFENSE_DEFAULTS.phrases[id].display);
        b.type = "button";
        b.setAttribute("aria-pressed", String(item.missedCall === id));
        b.addEventListener("click", () => {
          item.missedCall = item.missedCall === id ? null : id;
          renderReview();
        });
        chips.appendChild(b);
      });
      row.appendChild(chips);
    }
    return row;
  }));
}

// The reviewed reps, as stored in extra.reads.
function reviewedReads() {
  return reviewItems.map(item => Object.assign({}, item.read, {
    ok: !item.wrong, missedCall: item.wrong ? item.missedCall : null,
  }));
}

// "All correct": every rep back to ✓.
function markAllReadsRight() {
  reviewItems.forEach(item => { item.wrong = false; item.missedCall = null; });
  renderReview();
}
