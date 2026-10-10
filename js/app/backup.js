// Backup: export the log (JSON / CSV), copy it as text, import and merge.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const backupTextNote = document.getElementById("backupTextNote");
const importConfirmText = document.getElementById("importConfirmText");

// ---- Backup: export and import ----

let backupTextIsLog = false;  // the text box holds the JSON log (copying it counts as an export)
let pendingImport = null;     // parsed backup waiting for "Replace them" / "Keep mine"

function markExported() {
  storageSet(STORAGE_LAST_EXPORT, new Date().toISOString());
  renderLastExport();
}

// Start a file download. Returns false if this browser can't.
function downloadText(name, text, type) {
  try {
    const a = document.createElement("a");
    if (!("download" in a) || !window.URL || !URL.createObjectURL || !window.Blob) return false;
    const url = URL.createObjectURL(new Blob([text], { type }));
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch (e) {
    return false;
  }
}

function showBackupText(text, note, isLog) {
  backupTextIsLog = isLog;
  backupText.value = text;
  backupTextNote.textContent = note;
  backupTextBox.classList.remove("hidden");
}

function logJson() {
  return JSON.stringify(trainingLog.log, null, 2);
}

function exportJson() {
  const name = TrainingLog.exportFileName(new Date(), "reaction-caller-log", "json");
  if (downloadText(name, logJson(), "application/json")) {
    markExported();
    backupStatus.textContent = "Downloading " + name + ".";
  } else {
    showBackupText(logJson(), "This browser can't download files. Copy this text and keep it somewhere safe.", true);
    backupStatus.textContent = "";
  }
}

function exportCsv() {
  const name = TrainingLog.exportFileName(new Date(), "reaction-caller-sets", "csv");
  const csv = TrainingLog.setsToCsv(trainingLog.log);
  if (downloadText(name, csv, "text/csv")) {
    backupStatus.textContent = "Downloading " + name + ".";
  } else {
    showBackupText(csv, "This browser can't download files. Copy this CSV text instead.", false);
    backupStatus.textContent = "";
  }
}

function copyBackupText() {
  const done = ok => {
    if (ok && backupTextIsLog) markExported();
    backupStatus.textContent = ok ? "Copied." : "Select the text and copy it.";
  };
  backupText.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(backupText.value).then(() => done(true), () => done(false));
  } else {
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {}
    done(ok);
  }
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

// Merge a backup: new sessions are added; sessions that differ from saved ones
// are only replaced after "Replace them".
function importText(text) {
  importConfirm.classList.add("hidden");
  const parsed = TrainingLog.parseImport(text);
  if (parsed.error) {
    backupStatus.textContent = parsed.error;
    return;
  }
  pendingImport = parsed;
  const preview = TrainingLog.mergeLogs(trainingLog.log, parsed.log, false);
  if (preview.conflicts.length) {
    importConfirmText.textContent = plural(preview.conflicts.length, "session") + " in the backup " +
      (preview.conflicts.length === 1 ? "differs" : "differ") + " from the version saved here. Replace " +
      (preview.conflicts.length === 1 ? "it" : "them") + " with the backup's version?";
    importConfirm.classList.remove("hidden");
    backupStatus.textContent = "";
    return;
  }
  applyImport(false);
}

function applyImport(replace) {
  if (!pendingImport) return;
  const result = TrainingLog.mergeLogs(trainingLog.log, pendingImport.log, replace);
  const skipped = pendingImport.skipped;
  pendingImport = null;
  importConfirm.classList.add("hidden");
  const saved = saveTrainingLog(result.log);
  const parts = ["Imported " + plural(result.added.length, "new session") + "."];
  if (result.identical.length) parts.push(plural(result.identical.length, "session") + " already here.");
  if (result.conflicts.length) {
    parts.push((replace ? "Replaced " : "Kept your version of ") + plural(result.conflicts.length, "session") + ".");
  }
  if (skipped) parts.push(plural(skipped, "invalid session") + " skipped.");
  if (!saved) parts.push("Couldn't save to this device.");
  backupStatus.textContent = parts.join(" ");
  renderTrends();
  renderSessionList();
}

function importChosenFile() {
  const file = importFile.files && importFile.files[0];
  importFile.value = "";
  if (!file) return;
  const read = file.text ? file.text() : new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
  read.then(importText, () => { backupStatus.textContent = "Couldn't read that file."; });
}
