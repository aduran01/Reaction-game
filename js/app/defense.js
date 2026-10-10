// Defense mode: random Left / Right / Up / Back until Stop (cancels before every call).
// App code (DOM, speech, timers, storage). The app files share the global
// scope, load in the order of index.html, and only main.js starts anything.

const WORDS = ["Left", "Right", "Up", "Back"];
const WORD_CLASS = { Left: "word-left", Right: "word-right", Up: "word-up", Back: "word-back" };

// Defense's Min/Max delay fields.
function validateRange() {
  const min = parseInt(minMsInput.value, 10);
  const max = parseInt(maxMsInput.value, 10);
  if (isNaN(min) || isNaN(max) || min < 100 || max < 100) {
    rangeError.textContent = "Enter values of at least 100ms.";
    return null;
  }
  if (min > max) {
    rangeError.textContent = "Min delay must not exceed max delay.";
    return null;
  }
  rangeError.textContent = "";
  return { min, max };
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---- Defense mode: random Left / Right / Up / Back ----

const defenseMode = {
  timerId: null,

  start(settings) {
    this.scheduleNext(settings.min, settings.max);
  },

  scheduleNext(min, max) {
    this.timerId = setTimeout(() => {
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];
      showWord(word, WORD_CLASS[word]);
      speak(word);
      this.scheduleNext(min, max);
    }, randomDelay(min, max));
  },

  stop() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  },
};
