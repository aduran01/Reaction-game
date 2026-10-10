// Shared app helpers: storage, speech, the word on screen, small DOM helpers,
// the drill names and the element references used by several features.
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const gameScreen = document.getElementById("gameScreen");
const minMsInput = document.getElementById("minMs");
const maxMsInput = document.getElementById("maxMs");
const rangeError = document.getElementById("rangeError");
const wordEl = document.getElementById("word");
const offensePanel = document.getElementById("offensePanel");
const sessionBanner = document.getElementById("sessionBanner");
const sessionClock = document.getElementById("sessionClock");
const sessionProgress = document.getElementById("sessionProgress");
const logScreen = document.getElementById("logScreen");
const logDrill = document.getElementById("logDrill");
const logMade = document.getElementById("logMade");
const logAttempted = document.getElementById("logAttempted");
const qualityButtons = document.querySelectorAll("button[data-quality]");
const logError = document.getElementById("logError");
const discardBtn = document.getElementById("discardBtn");
const restScreen = document.getElementById("restScreen");
const nextSetBtn = document.getElementById("nextSetBtn");
const summaryScreen = document.getElementById("summaryScreen");
const historyScreen = document.getElementById("historyScreen");
const importFile = document.getElementById("importFile");
const backupTextBox = document.getElementById("backupTextBox");
const backupText = document.getElementById("backupText");
const importConfirm = document.getElementById("importConfirm");
const backupStatus = document.getElementById("backupStatus");
const autoLevelBtn = document.getElementById("autoLevelBtn");
const moveLabError = document.getElementById("moveLabError");
const STORAGE_LAST_EXPORT = "reactionCaller.lastExportAt";
const STORAGE_AUTO_LEVEL = "reactionCaller.autoLevel";

const P = OffensePlanner;
const OFFENSE_DEFAULTS = P.OFFENSE_DEFAULTS;
const TD = P.TRAINING_DEFAULTS;

// Offense drills (OffensePlanner.PROFILES ids). A future "mixed" drill goes here too.
const DRILLS = {
  drive: {
    label: "OFFENSE · DRIVE",
    subtitle: "Call & Execute: move fluency and readiness under unpredictable timing. " +
      "Stay ready, then drive, counter and finish on the calls.",
  },
  readTheD: {
    label: "OFFENSE · READ THE D",
    subtitle: "Read the D: decide your move from what the defender does next. No move is named for you.",
  },
  moveLab: {
    label: "OFFENSE · MOVE LAB",
    subtitle: "Call & Execute with your own moves: sprint or catch, go LEFT or RIGHT, " +
      "then hit the moves called until SHOT.",
  },
};

const DRILL_NAMES = { drive: "Drive", shooters: "Shooters only", moveLab: "Move Lab", readTheD: "Read the D" };

let voices = [];

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {}
}

// The store TrainingLog reads and writes through (reactionCaller.log and its backups).
const logStore = { get: storageGet, set: storageSet };

function loadVoices() {
  voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}
if (window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice() {
  return voices.find(v => v.lang && v.lang.startsWith("en")) || voices[0] || null;
}

// Defense cancels before every call (newest call always wins). Offense passes
// cancel: false so calls queue instead of clipping; it only cancels on Stop.
function speak(text, options) {
  const opts = options || {};
  if (!window.speechSynthesis) return null;
  if (opts.cancel !== false) window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.rate = opts.rate || 1;
  utter.pitch = 1;
  window.speechSynthesis.speak(utter);
  return utter;
}

function showWord(text, className) {
  wordEl.textContent = text;
  wordEl.className = className || "";
  wordEl.classList.remove("show");
  void wordEl.offsetWidth;
  wordEl.classList.add("show");
}

function primeSpeech() {
  if (!window.speechSynthesis) return;
  const primer = new SpeechSynthesisUtterance(" ");
  primer.volume = 0;
  window.speechSynthesis.speak(primer);
}

function parseNumber(value) {
  return String(value).trim() === "" ? NaN : Number(value);
}

function has(obj, key) {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
