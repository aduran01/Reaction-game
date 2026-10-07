# Task: add "Offense mode" to Reaction Caller, and remove the wake-lock code

You are working in the Reaction Caller repo: `index.html` (the whole app), `server.js` (static server) and `README.md` (documents the current app). **Read `README.md` and `index.html` in full before changing anything.** Work on a new git branch called `offense-mode` and commit after each phase below.

If something is ambiguous, pick the default stated in this document, keep going, and list every assumption in your final summary. Only stop to ask if you are truly blocked.

## Context

Reaction Caller is a phone-based basketball reaction drill. A voice calls commands at random times and the player reacts. Today's behavior (random Left / Right / Up / Back) becomes **Defense mode** and must keep working exactly as it does now. The new **Offense mode** simulates a ball-handler driving from the top of the key to the basket. It uses a small state machine, a drive countdown, and calls timed so that every spoken word fits inside the drive.

## Hard constraints

- Stay dependency-free: no libraries, no build step, no `package.json`. `index.html` stays one self-contained file.
- Do not modify `server.js`.
- Defense mode behavior is unchanged: same words, colors, cancel-before-speak, random delay loop.
- iPhone Safari is the main target. Keep the dark theme and the existing visual language.
- Put the planning and timing logic in **pure functions** (inputs in, plan out, with an injectable `rng` function that defaults to `Math.random`) so they can be self-tested without a browser.
- All tunable numbers live in one clearly commented `OFFENSE_DEFAULTS` object near the top of the script. The owner will be tuning words and timings by hand.

## Phase 0: cleanup

1. **Delete all screen-keep-awake code.** The owner fixed this on the iPhone side. Remove `acquireWakeLock`, `releaseWakeLock`, `startVideoKeepAwake`, `stopVideoKeepAwake`, the `wakeLock` and `keepAwakeVideo` state, the `visibilitychange` handler, and every call to them in `startGame` / `stopGame`. Leave no dead code.
2. **Make the word animation replay reliably.** In `showWord`, force a reflow (`void wordEl.offsetWidth`) between removing and re-adding `show`. Offense mode can call "cut off" several times in a row, and each call must visibly re-animate.

## Phase 1: mode structure

- Add a **Defense | Offense** segmented control at the top of the start screen. Default is Defense. Persist the choice in `localStorage` (wrap every access in try/catch; the app must work if storage is unavailable).
- Refactor so each mode is an object with `start(settings)` and `stop()`. Share `speak`, `primeSpeech`, `showWord` and the min/max validation between modes.
- Defense mode shows its current UI. Offense mode shows the offense UI described below.

## Offense mode: words

Each phrase has an id, display text, spoken text and a rough duration estimate. `spoken` is separate from `display` so the owner can fix TTS pronunciation. For example, the lone word "read" may be spoken as "red" by some voices, and "lay up" may need to be "layup".

| id | display | spoken | est. ms at rate 1.0 |
|---|---|---|---|
| READ | READ | read | 350 |
| LEFT | LEFT | left | 350 |
| RIGHT | RIGHT | right | 350 |
| CUT_OFF | CUT OFF | cut off | 450 |
| LAY_UP | LAY UP | lay up | 450 |
| LEFT_SIDE | LEFT SIDE | left side | 650 |
| RIGHT_SIDE | RIGHT SIDE | right side | 650 |
| CENTER_SIDE | CENTER SIDE | center side | 750 |
| LAY_UP_LEFT_SIDE | LAY UP LEFT SIDE | lay up left side | 1000 |
| LAY_UP_RIGHT_SIDE | LAY UP RIGHT SIDE | lay up right side | 1000 |
| LAY_UP_CENTER_SIDE | LAY UP CENTER SIDE | lay up center side | 1100 |

The estimates are rough guesses; Phase 4 refines them from real measurements.

**Finishers** (they end a drive) are `LEFT_SIDE`, `RIGHT_SIDE`, `CENTER_SIDE` and the three `LAY_UP_*_SIDE` phrases.

## Offense mode: state machine

| From | Allowed next |
|---|---|
| READ | LEFT, RIGHT |
| LEFT, RIGHT, CUT_OFF | CUT_OFF, LAY_UP, LAY_UP_LEFT_SIDE, LAY_UP_RIGHT_SIDE, LAY_UP_CENTER_SIDE |
| LAY_UP | CUT_OFF, LEFT_SIDE, RIGHT_SIDE, CENTER_SIDE |
| any finisher | the drive ends, then READ after the reset pause |

What the player is being told:

- **READ**: you are at the top of the key, reading the court.
- **LEFT / RIGHT**: drive that way. The drive countdown starts here.
- **CUT OFF**: the defender cut off your lane, so counter to the other side.
- **LAY UP**: the lane is clear for now, but stay ready because it can still get cut off.
- **Finishers**: the lane is clear. Finish on the side named.

**Caps per drive:** `maxCutOffsPerDrive = 3` (the owner's requirement, counted across the whole drive) and `maxLayUpsPerDrive = 2` (my assumption, tunable). A choice that would break a cap is not allowed.

## Offense mode: tunable weights

Weights are non-negative numbers, normalized at pick time after illegal or non-fitting choices are filtered out. Defaults are roughly even.

- `startWeights`: `{ LEFT: 50, RIGHT: 50 }`
- `afterDriveOrCutOffWeights`: `{ CUT_OFF: 20, LAY_UP: 20, LAY_UP_LEFT_SIDE: 20, LAY_UP_RIGHT_SIDE: 20, LAY_UP_CENTER_SIDE: 20 }`
- `afterLayUpWeights`: `{ CUT_OFF: 25, LEFT_SIDE: 25, RIGHT_SIDE: 25, CENTER_SIDE: 25 }`

If every legal, fitting choice has weight 0, fall back to the cheapest fitting finisher.

## Offense mode: timing rules

Defaults (all in `OFFENSE_DEFAULTS`, all editable in the UI under Advanced):

| Setting | Default | Meaning |
|---|---|---|
| `readDwell` | the existing Min/Max delay fields (1000 to 3000) | wait after READ before the drive starts |
| `driveMinMs` / `driveMaxMs` | 1400 / 2000 | the drive window `D` is picked uniformly in this range when LEFT/RIGHT is called |
| `resetPauseMs` | 1000 | wait after the drive ends before READ is called again |
| `baseRate` | 1.25 | normal speech rate |
| `maxRate` | 1.6 | speech rate ceiling |
| `minGapMs` | 120 | minimum silence between calls |
| `finisherBufferMs` | 0 | the finisher must finish being spoken this long before `D` ends |
| `speechLeadMs` | 0 | call `speak()` this much early to offset TTS startup latency |

### Never clip a call
In Offense mode **never call `speechSynthesis.cancel()` between calls.** Cancel only on Stop. Instead, plan each drive so calls cannot overlap.

### Drive-level adaptive speech rate (this is how speech gets faster when a drive is crowded)
For a candidate call sequence of `n` calls, let `avail = D - finisherBufferMs`, `gaps = (n - 1) * minGapMs` and `S = sum of est ms (at rate 1.0)`.

- The required rate is `rate_req = S / (avail - gaps)`. If `avail <= gaps`, the sequence is infeasible.
- The drive's speech rate is `max(baseRate, rate_req)`.
- The sequence **fits** only if that rate is `<= maxRate`.
- Every call in the drive is spoken at that one rate, and each call's planned duration is `est / rate`.

### Feasibility-aware sampling (the "do the words fit" check)
Build each drive one call at a time, starting from LEFT or RIGHT (weighted). For each candidate next call, keep it only if all of these hold:

1. The transition is legal.
2. The caps are not exceeded.
3. The path so far plus the candidate, plus the cheapest legal finisher that could follow it, still fits at `maxRate`. If the candidate is itself a finisher, the path plus the candidate must fit.

The cheapest finisher after LEFT, RIGHT or CUT_OFF is the cheapest `LAY_UP_*_SIDE`. After LAY_UP it is the cheapest of `LEFT_SIDE`, `RIGHT_SIDE` and `CENTER_SIDE`. Pick among the survivors by weight. Because the shortest path (LEFT/RIGHT plus one finisher) is validated at Start (see Validation), a valid drive can always be completed. No retry loop is needed.

### Scheduling a planned drive
Return a plan `{ D, rate, calls: [{ id, startMs, durMs }] }` with times relative to the LEFT/RIGHT call.

- Call 0 (LEFT/RIGHT) starts at 0.
- The finisher is anchored to end at `avail`, so it starts at `avail - durMs`.
- Intermediate calls (CUT OFF, LAY UP) are spaced evenly in the free interval between the end of call 0 and the start of the finisher. Every gap is at least `minGapMs`; this is guaranteed by the fit check.

### Running a drive
1. Take `driveStart = performance.now()` at the moment LEFT/RIGHT is spoken.
2. Schedule each later call with its own `setTimeout`, computed from `driveStart` (not chained from the previous timeout, so drift doesn't accumulate). Subtract `speechLeadMs`.
3. At `D` the drive is over and the countdown reads 0. Wait `resetPauseMs`, then show and speak READ, then wait the read dwell (random between the Min and Max fields), then start the next drive.
4. Keep every timer id in one array so Stop clears all of them.

### Run lifecycle
- On Start in Offense mode, enter READ immediately (call `primeSpeech` first, inside the click), then wait the read dwell and begin the first drive.
- On Stop, clear all timers and the countdown animation frame, cancel speech, hide the countdown, and return to the start screen.

## Offense mode: UI

- **Countdown bar.** A visible bar plus a small seconds readout (one decimal) that drains from `D` to 0, driven by `requestAnimationFrame` from the same `performance.now()` clock as the scheduler. It is shown only during the drive (LEFT/RIGHT call through the end of `D`), and hidden or empty during READ and the reset pause.
- **A small mode label** ("OFFENSE" or "DEFENSE") on the game screen.
- **Long phrases must fit.** "LAY UP CENTER SIDE" must stay readable at 320px width: allow wrapping to two lines and scale the font down for long phrases (for example a `.long` class). Keep the huge font for one-word calls.
- **Color-code by meaning.** Suggested: READ white, LEFT / LEFT SIDE / LAY UP LEFT SIDE blue (`#4f8cff`), RIGHT variants green (`#4fd87c`), CENTER SIDE variants purple (`#c47bff`), CUT OFF red (`#ff4f5e`), LAY UP yellow (`#ffd24f`).
- **Start screen in Offense mode:**
  - the existing Min/Max delay fields, relabeled "Min/Max read time (ms)", shared with Defense;
  - editable fields for the drive window min and max;
  - a collapsible `<details>` "Advanced" section with: reset pause, base speech rate, max speech rate, min gap, finisher buffer, max cut offs per drive, and the three weight tables.
- **Persistence.** Save mode, all offense settings and the shared min/max fields to `localStorage` (try/catch everywhere). Do not persist anything else.

## Validation (on Start, Offense mode)

Keep the existing rules for the Min/Max fields (at least 100 ms, min must not exceed max). Add these, each with a clear inline error message:

- the drive window min is at least 600 ms and does not exceed the max;
- `baseRate <= maxRate`, with sane bounds (0.5 to 2.0);
- `maxCutOffsPerDrive` is an integer from 0 to 3;
- every weight is a number `>= 0` and each weight table has a sum `> 0`;
- **the shortest possible drive fits at `maxRate` inside the minimum drive window.** Check the cheapest LEFT/RIGHT plus the cheapest legal finisher, and show the required window in the error if it fails.

## Phase 4: measured durations (optional, do last)

Spoken durations drift with voice and device. Measure each utterance with `onstart` / `onend`, and keep a per-phrase exponential moving average in `localStorage`, normalized to rate 1.0 (`measuredMs * rate`). Ignore outliers and missing events. The planner uses the learned value when present and the seed estimate otherwise. If the events don't fire on a device, nothing may break.

## Self-test

Add a `?selftest=1` query flag that runs a simulation instead of the UI and prints PASS or FAIL per check to the console, plus a short banner on the page. Run at least 10,000 drives at default settings and again at tight settings (`D = 1400`, high `maxRate`, small `minGapMs`). Check that:

1. Every drive starts with LEFT or RIGHT, chosen after READ.
2. Every transition is in the table, and no phrase appears after a finisher.
3. Every drive ends with exactly one finisher, and that finisher is legal for the previous state (long `LAY_UP_*_SIDE` after LEFT / RIGHT / CUT_OFF, short `*_SIDE` after LAY_UP).
4. Cut-offs per drive `<= maxCutOffsPerDrive` and lay-ups per drive `<= maxLayUpsPerDrive`.
5. `D` is within the drive window, and the speech rate is between `baseRate` and `maxRate`.
6. Every call lies within `[0, D - finisherBufferMs]`, calls never overlap, and gaps are at least `minGapMs`.
7. With loose timing, the observed pick frequencies roughly match the weights.

Also print a **fit table**: for 0 to 3 cut-offs and each finisher type, the minimum drive window needed at `maxRate`, with a yes/no for whether it fits at `driveMaxMs`. This lets the owner tune `maxRate`, gaps and estimates. Remove nothing from the normal UI path, and make sure the self-test code cannot affect normal use.

## README

Update `README.md` to match:

- describe the two modes, the offense words, the state table, the timing rules, the weights, and the new settings;
- remove everything about keeping the screen awake (the Wake Lock API, the hidden-video fallback, the related troubleshooting rows, the related limitations, the "screen stays awake" line in the intro);
- remove the "settings aren't saved" limitation and document what is now persisted;
- update the file-size table and the architecture notes;
- add a "Tuning offense mode" section that explains `OFFENSE_DEFAULTS`, the phrase table and how to run `?selftest=1`.

## Acceptance checklist

Verify these and report results in your final summary:

1. Defense mode behaves exactly as before.
2. `grep -i "wake"` finds nothing in `index.html` or `README.md`.
3. Offense runs READ, then LEFT/RIGHT, then 0 or more CUT OFF / LAY UP calls, then a finisher, then 1 s later READ, in a loop.
4. The countdown bar runs only during the drive and matches `D`.
5. No call is ever clipped in Offense mode, and Stop silences speech immediately with no stray timers firing afterwards.
6. The longest phrase is readable at 320px width.
7. Mode toggle, offense settings and the shared delay fields persist across reloads, and the app still works with storage blocked.
8. `?selftest=1` passes every check.
9. `server.js` is untouched.

In your final summary, list the files changed, the phase commits, every assumption you made, and the fit-table results.
