// Move Lab in the app: the move picker, its get-set fields, its colors and labels.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const getSetFieldsEl = document.getElementById("getSetFields");
const movePicker = document.getElementById("movePicker");
const moveStatus = document.getElementById("moveStatus");
const STORAGE_MOVE_LAB = "reactionCaller.moveLab";

P.TRAINING_DEFAULTS.moves.forEach(m => { PHRASE_CLASS[m.id] = "word-move"; });

// Short labels for the Move Lab form (the full phrases are too wide for two columns).
const SHORT_LABELS = {
  SPRINT_FROM_LEFT_CORNER: "From left corner",
  SPRINT_FROM_RIGHT_CORNER: "From right corner",
  CATCH: "Catch",
  MOVE: "Another move",
};

const MOVE_LAB_WEIGHT_TABLE_TITLES = { afterMoveWeights: "Weights after a move" };
// Move Lab get-set min/max inputs, one pair per start call. The "sh-" ids date
// from the removed Shooters only drill, so values saved there still load.
function buildGetSetFields() {
  const fields = [];
  P.MOVE_LAB_START_CALLS.forEach(id => {
    ["min", "max"].forEach(end => {
      fields.push(makeNumberField("sh-getSet-" + id + "-" + end, SHORT_LABELS[id] + " " + end + " (ms)", {
        min: "0", step: "100", data: { setting: "moveLab.getSetMs." + id + "." + end + "Ms" },
      }));
    });
  });
  getSetFieldsEl.appendChild(makeSection("Get-set time after the start call", fields));
}

// ---- Move Lab: move picker ----

// Sides of sets logged before the redesign (one move on one side), for History.
const SIDE_NAMES = { left: "Left hand", right: "Right hand", alternate: "Alternate" };

function moveById(id) {
  return TD.moves.find(m => m.id === id);
}

// Known move ids, once each, in move-list order.
function cleanMoveIds(ids) {
  return TD.moves.filter(m => ids.indexOf(m.id) !== -1).map(m => m.id);
}

// The picked moves, kept in reactionCaller.moveLab as { moveIds: [...] }. A choice
// saved by the first Move Lab ({ moveId, side }) becomes that one move.
function loadMoveLabChoice() {
  let stored = null;
  try {
    stored = JSON.parse(storageGet(STORAGE_MOVE_LAB));
  } catch (e) {}
  const ok = stored !== null && typeof stored === "object";
  if (ok && Array.isArray(stored.moveIds)) return { moveIds: cleanMoveIds(stored.moveIds) };
  if (ok && moveById(stored.moveId)) return { moveIds: [stored.moveId] };
  return { moveIds: OFFENSE_DEFAULTS.moveLab.moveIds.slice() };
}

let moveLabChoice = loadMoveLabChoice();

function saveMoveLabChoice() {
  storageSet(STORAGE_MOVE_LAB, JSON.stringify(moveLabChoice));
}

// One toggle button per move; renderMoveLab() keeps them current.
function buildMovePicker() {
  TD.moves.forEach(m => {
    const btn = el("button", null, m.display);
    btn.type = "button";
    btn.dataset.move = m.id;
    btn.addEventListener("click", () => {
      const ids = moveLabChoice.moveIds;
      moveLabChoice.moveIds = ids.indexOf(m.id) !== -1
        ? ids.filter(id => id !== m.id)
        : cleanMoveIds(ids.concat(m.id));
      saveMoveLabChoice();
      moveLabError.textContent = "";
      renderMoveLab();
    });
    movePicker.appendChild(btn);
  });
}

function renderMoveLab() {
  const ids = moveLabChoice.moveIds;
  movePicker.querySelectorAll("button[data-move]").forEach(btn => {
    btn.setAttribute("aria-pressed", String(ids.indexOf(btn.dataset.move) !== -1));
  });
  moveStatus.textContent = ids.length === 0
    ? "No moves picked yet. Pick at least one."
    : ids.length + (ids.length === 1 ? " move" : " moves") + " picked. Each move call is one of them, at random.";
}
