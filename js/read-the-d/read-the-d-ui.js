// Read the D in the app: call colors by role, its weight-table fields, and the
// review of each rep on the set log.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const readTheDWeightTablesEl = document.getElementById("readTheDWeightTables");

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
