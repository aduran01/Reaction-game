# Reaction Caller

**Reaction Caller** is a small, dependency-free web app for basketball reaction drills. A voice calls commands at random times, the same command appears in large color-coded letters, and the player reacts. It has two modes:

- **Defense mode**: after a random wait, the app calls one of **Left**, **Right**, **Up** or **Back**, again and again until you press **Stop**.
- **Offense mode**: simulates a ball-handler driving from the top of the key to the basket. The app calls **READ**, then a drive direction (**LEFT** / **RIGHT**), then zero or more reactions to the defense (**CUT OFF**, **LAY UP**), and finally a **finisher** such as **LAY UP LEFT SIDE**. All of it happens inside a timed drive window shown as a countdown bar. Calls are planned so that every spoken phrase fits inside the drive and no call ever cuts off another.

The app is meant to run on a phone (iPhone Safari is the main target) propped up nearby while you train. The words are big enough to read from a distance, and the voice means you don't have to look at all.

The whole project is two files:

| File | Size | Purpose |
|------|------|---------|
| `index.html` | ~45 KB | The entire app: markup, styles and JavaScript in one page |
| `server.js` | ~1 KB | A tiny Node.js static file server so phones on your network can open the app |

There is no build step, no `package.json`, no framework and no third-party library.

---

## Table of contents

1. [Quick start](#quick-start)
2. [How to use the app](#how-to-use-the-app)
   - [Choosing a mode](#choosing-a-mode)
   - [Defense mode](#defense-mode)
   - [Offense mode](#offense-mode)
   - [Stopping](#stopping)
   - [What is saved between visits](#what-is-saved-between-visits)
3. [Offense mode in depth](#offense-mode-in-depth)
   - [Phrases](#phrases)
   - [State machine](#state-machine)
   - [Weights](#weights)
   - [Timing rules](#timing-rules)
   - [Planning a drive](#planning-a-drive)
   - [Running a drive](#running-a-drive)
   - [Learned spoken lengths](#learned-spoken-lengths)
   - [Validation](#validation)
4. [Tuning offense mode](#tuning-offense-mode)
5. [Project structure](#project-structure)
6. [Architecture overview](#architecture-overview)
7. [`server.js` in detail](#serverjs-in-detail)
8. [`index.html` in detail](#indexhtml-in-detail)
9. [Browser APIs used](#browser-apis-used)
10. [Known limitations and quirks](#known-limitations-and-quirks)
11. [Troubleshooting](#troubleshooting)
12. [Ideas for future work](#ideas-for-future-work)

---

## Quick start

### Requirements

- **Node.js**, any reasonably recent version. The server only uses the built-in `http`, `fs` and `path` modules.
- A modern browser. iPhone Safari is the main target; Chrome on Android and desktop browsers also work.

### Run it

From the project folder:

```bash
node server.js
```

You should see:

```
Serving C:\Users\...\Reaction game at http://0.0.0.0:8080
```

Then open:

- **On the same computer:** <http://localhost:8080>
- **On a phone on the same Wi-Fi:** `http://<your-computer's-LAN-IP>:8080`, for example `http://192.168.1.42:8080`.
  - On Windows, run `ipconfig` and look for the "IPv4 Address" of your Wi-Fi adapter.
  - On macOS/Linux, run `ipconfig getifaddr en0` or `hostname -I`.
  - The first time you run it, Windows Firewall may ask whether Node.js can accept connections on private networks. Allow it, or the phone won't be able to connect.

### Without the server

`index.html` is fully self-contained, so you can also open it straight from disk (`file://`). The server mainly exists so that **another device** (your phone) can load the page from your computer. Settings are saved per address, so `file://` and `http://…:8080` keep separate saved settings.

To stop the server, press `Ctrl+C` in its terminal.

---

## How to use the app

### Choosing a mode

The top of the start screen has a **Defense | Offense** switch. Defense is the default. Your choice is remembered (see [What is saved](#what-is-saved-between-visits)).

The two **Min / Max** number fields are shared by both modes:

| Mode | Field labels | Meaning |
|------|--------------|---------|
| Defense | Min delay (ms) / Max delay (ms) | Random wait between calls |
| Offense | Min read time (ms) / Max read time (ms) | Random wait after **READ** before the drive starts |

Defaults are 1000 and 3000 ms. The rules are the same in both modes:

| Condition | Error message shown |
|-----------|---------------------|
| Either field is empty or not a number | "Enter values of at least 100ms." |
| Either value is below 100 | "Enter values of at least 100ms." |
| Min is greater than max | "Min delay must not exceed max delay." (Offense: "Min read time must not exceed max read time.") |

### Defense mode

This mode behaves exactly as it always has:

1. Press **Start**. The game screen shows the label **DEFENSE**, a large empty stage and a red **Stop** button.
2. After a random delay between min and max (nothing happens immediately), one of four words appears and is spoken.
3. After another random delay, a new word replaces it, and so on.

| Word | Color | Hex |
|------|-------|-----|
| LEFT | Blue | `#4f8cff` |
| RIGHT | Green | `#4fd87c` |
| UP | Yellow | `#ffd24f` |
| BACK | Orange | `#ff7a4f` |

Each word has a 25% chance on every call, and the same word can repeat. Speech is at rate 1.0. **Every call cancels any speech still playing**, so with very short delays you hear the newest word and the previous one is cut off. That is intended in Defense mode.

### Offense mode

Select **Offense** to see the extra settings:

- **Min / Max drive window (ms)**: how long each drive lasts (default 1400–2000 ms).
- **Advanced** (collapsed by default): reset pause, minimum gap, base and max speech rate, finisher buffer, speech lead, max cut offs and max lay ups per drive, and the three weight tables. Every setting is described in [Timing rules](#timing-rules) and [Weights](#weights).

Press **Start**. The game screen shows the label **OFFENSE**, the current call and a **countdown bar** with a seconds readout. A session loops like this:

```
READ ──(read time: random Min..Max read time)──▶ LEFT or RIGHT ──▶ [CUT OFF / LAY UP …] ──▶ FINISHER
  ▲                                              └──────────── drive window D, countdown runs ───────────┘
  └──────────────────────────── reset pause (1 s) after the countdown hits 0 ◀──────────────────────────┘
```

What each call tells the player:

| Call | Meaning |
|------|---------|
| **READ** | You are at the top of the key, reading the court. |
| **LEFT / RIGHT** | Drive that way. The drive countdown starts now. |
| **CUT OFF** | The defender cut off your lane. Counter to the other side. |
| **LAY UP** | The lane is clear for now, but stay ready because it can still get cut off. |
| **Finisher** (e.g. **LAY UP CENTER SIDE**, **LEFT SIDE**) | The lane is clear. Finish on the side named. |

Calls are colored by meaning:

| Calls | Color | Hex |
|-------|-------|-----|
| READ | White | `#f2f3f5` |
| LEFT, LEFT SIDE, LAY UP LEFT SIDE | Blue | `#4f8cff` |
| RIGHT, RIGHT SIDE, LAY UP RIGHT SIDE | Green | `#4fd87c` |
| CENTER SIDE, LAY UP CENTER SIDE | Purple | `#c47bff` |
| CUT OFF | Red | `#ff4f5e` |
| LAY UP | Yellow | `#ffd24f` |

Phrases longer than 7 characters (e.g. "LAY UP CENTER SIDE") use a smaller font and may wrap to two lines, so they stay readable on a 320 px-wide screen. Short calls keep the huge font.

The countdown bar is visible only during the drive, from the LEFT/RIGHT call until the window `D` runs out. It drains from `D` to 0 with a one-decimal seconds readout ("1.6 s"). During the reset pause it sits empty at "0.0 s", and it is hidden while READ is up.

### Stopping

Press **Stop** in either mode to:

- cancel every pending call (Offense keeps all its timers in one list and clears them all);
- stop the countdown animation;
- silence speech immediately (`speechSynthesis.cancel()`);
- return to the start screen. Your settings stay in the fields.

### What is saved between visits

The app uses `localStorage` and saves only:

| Key | Contents | When written |
|-----|----------|--------------|
| `reactionCaller.mode` | `"defense"` or `"offense"` | When you tap the mode switch |
| `reactionCaller.settings` | The raw text of the shared Min/Max fields and every offense field (drive window, Advanced values, weights) | Whenever you edit any of those fields |
| `reactionCaller.learnedMs` | Learned spoken length of each offense phrase (see [Learned spoken lengths](#learned-spoken-lengths)) | After each measured offense call |

Nothing else is stored. Every storage access is wrapped in `try/catch`. If storage is blocked (private mode, disabled site data), the app works normally with the built-in defaults and just doesn't remember anything.

To reset everything to defaults, clear the site's data in your browser, or run `localStorage.clear()` in the browser console on the app's page.

---

## Offense mode in depth

### Phrases

Each phrase has an id, the text shown on screen, the text sent to the voice and a rough spoken length at speech rate 1.0. `spoken` is separate from `display` so pronunciation can be fixed without changing the screen. For example, some voices say the lone word "read" as "red", and "lay up" may sound better as "layup".

| id | display | spoken | est. ms at rate 1.0 | finisher? |
|---|---|---|---|---|
| READ | READ | read | 350 | |
| LEFT | LEFT | left | 350 | |
| RIGHT | RIGHT | right | 350 | |
| CUT_OFF | CUT OFF | cut off | 450 | |
| LAY_UP | LAY UP | lay up | 450 | |
| LEFT_SIDE | LEFT SIDE | left side | 650 | short |
| RIGHT_SIDE | RIGHT SIDE | right side | 650 | short |
| CENTER_SIDE | CENTER SIDE | center side | 750 | short |
| LAY_UP_LEFT_SIDE | LAY UP LEFT SIDE | lay up left side | 1000 | long |
| LAY_UP_RIGHT_SIDE | LAY UP RIGHT SIDE | lay up right side | 1000 | long |
| LAY_UP_CENTER_SIDE | LAY UP CENTER SIDE | lay up center side | 1100 | long |

The estimates are only a starting point. The app measures the real lengths on your device and uses those once it has them.

### State machine

| From | Allowed next |
|---|---|
| READ | LEFT, RIGHT |
| LEFT, RIGHT, CUT_OFF | CUT_OFF, LAY_UP, LAY_UP_LEFT_SIDE, LAY_UP_RIGHT_SIDE, LAY_UP_CENTER_SIDE |
| LAY_UP | CUT_OFF, LEFT_SIDE, RIGHT_SIDE, CENTER_SIDE |
| any finisher | the drive ends; READ follows after the reset pause |

So a **long finisher** (`LAY UP … SIDE`) always follows LEFT, RIGHT or CUT OFF, and a **short finisher** (`… SIDE`) always follows LAY UP.

**Caps per drive:** at most `maxCutOffsPerDrive` (3) CUT OFFs and `maxLayUpsPerDrive` (2) LAY UPs, counted across the whole drive. A choice that would break a cap is never offered.

Example drives:

```
LEFT  > LAY UP RIGHT SIDE
RIGHT > CUT OFF > LAY UP > CENTER SIDE
LEFT  > LAY UP > CUT OFF > LAY UP LEFT SIDE
```

### Weights

At each step the next call is picked at random, in proportion to its weight. Weights are any non-negative numbers. They are normalized at pick time, **after** illegal and non-fitting choices are removed.

| Table | Used after | Defaults |
|-------|-----------|----------|
| `startWeights` | READ | LEFT 50, RIGHT 50 |
| `afterDriveOrCutOffWeights` | LEFT, RIGHT, CUT OFF | CUT OFF 20, LAY UP 20, LAY UP LEFT SIDE 20, LAY UP RIGHT SIDE 20, LAY UP CENTER SIDE 20 |
| `afterLayUpWeights` | LAY UP | CUT OFF 25, LEFT SIDE 25, RIGHT SIDE 25, CENTER SIDE 25 |

If every remaining choice has weight 0, the app picks the **cheapest fitting finisher** (shortest spoken length). When choosing LEFT/RIGHT it picks the cheapest fitting direction.

Raising CUT OFF and LAY UP makes drives longer and busier, and raising the finisher weights makes drives shorter.

### Timing rules

| Setting | Default | Meaning |
|---|---|---|
| Read time (shared Min/Max fields) | 1000–3000 | Wait after READ before the drive starts |
| `driveMinMs` / `driveMaxMs` | 1400 / 2000 | Drive window `D`, picked uniformly (whole ms) in this range when LEFT/RIGHT is called |
| `resetPauseMs` | 1000 | Wait after the drive ends before READ is called again |
| `baseRate` | 1.25 | Normal speech rate |
| `maxRate` | 1.6 | Speech rate ceiling |
| `minGapMs` | 120 | Minimum silence between calls in a drive |
| `finisherBufferMs` | 0 | The finisher must finish being spoken this long before `D` ends |
| `speechLeadMs` | 0 | Speak each call this much early to offset voice start-up delay |
| `maxCutOffsPerDrive` | 3 | Cap on CUT OFFs per drive (0–3) |
| `maxLayUpsPerDrive` | 2 | Cap on LAY UPs per drive (0–5) |

**Calls are never cut off.** In Offense mode the app never calls `speechSynthesis.cancel()` between calls. It cancels only on Stop. Instead, each drive is planned so that calls cannot overlap.

**One speech rate per drive.** For a sequence of `n` calls:

- `avail = D - finisherBufferMs`
- `gaps = (n - 1) * minGapMs`
- `S` = sum of the phrases' lengths at rate 1.0
- `rate_req = S / (avail - gaps)`. If `avail <= gaps`, the sequence can't fit at all.
- The drive's rate is `max(baseRate, rate_req)`. The sequence **fits** only if that rate is `<= maxRate`.

Every call in the drive is spoken at that one rate, and each call's planned length is `est / rate`. A busy drive is spoken faster, up to `maxRate`.

### Planning a drive

The planner builds each drive one call at a time, starting from LEFT or RIGHT. A candidate next call is kept only if:

1. the transition is in the state table;
2. no cap would be exceeded;
3. the drive still fits: the path so far, plus the candidate, plus the **cheapest finisher that could follow it**, fits at `maxRate`. (If the candidate is itself a finisher, just the path plus the candidate must fit.)

The cheapest finisher after LEFT, RIGHT or CUT OFF is the cheapest `LAY UP … SIDE`. After LAY UP it is the cheapest of `LEFT SIDE`, `RIGHT SIDE` and `CENTER SIDE`. The next call is picked by weight among the survivors.

Because Start checks that the shortest possible drive fits in the minimum window, a cheap finisher is always still available, so every drive can be completed without retries.

The plan is `{ D, rate, calls: [{ id, startMs, durMs }] }`, with times relative to the LEFT/RIGHT call:

- Call 0 (LEFT/RIGHT) starts at 0.
- The finisher is anchored to end exactly at `avail`, so it starts at `avail - durMs`.
- Any CUT OFF / LAY UP calls are spaced evenly in the free time between the end of call 0 and the start of the finisher. The fit check guarantees every gap is at least `minGapMs`.

```
0 ms                                                                 avail      D
│ LEFT │   gap   │ CUT OFF │   gap   │ LAY UP │   gap   │ CENTER SIDE │ buffer │
```

### Running a drive

1. When LEFT/RIGHT is spoken, the app records the drive clock origin with `performance.now()` (plus `speechLeadMs`, so t = 0 is when the call should be *heard*).
2. Every later call gets its own `setTimeout`, computed from that origin rather than chained from the previous timer, so drift doesn't accumulate. Each fires `speechLeadMs` early. The word appears at the same moment it is sent to the voice.
3. The countdown bar runs on `requestAnimationFrame` from the same clock.
4. At `D` the drive is over and the bar reads 0. After `resetPauseMs`, READ is shown and spoken (at `baseRate`). After a random read time between the shared Min/Max fields, the next drive starts.
5. On **Start**, Offense calls READ immediately, right after unlocking speech inside the click. That unlock is required on iPhone.

### Learned spoken lengths

Real spoken lengths depend on the voice and device. For every offense call the app listens to the utterance's `onstart` and `onend` events, measures the time between them and normalizes it to rate 1.0 (`measured × rate`). Then:

- the measurement is ignored if it is more than 2.5× or less than 0.4× the current value (outliers), if an event is missing, if the utterance errors, or if Stop interrupted it;
- otherwise the stored value moves 30% of the way toward it (an exponential moving average);
- values are saved in `localStorage` under `reactionCaller.learnedMs`.

The planner uses a learned value when there is one, and the table estimate otherwise. Lengths are **fixed for a whole run** (the ones validated at Start), and anything learned during a run takes effect at the next Start. If a device never fires these events, nothing changes and the estimates are used.

### Validation

Pressing Start in Offense mode checks (besides the shared Min/Max rules):

| Rule | Where the error shows |
|------|-----------------------|
| Min drive window is a whole number ≥ 600 ms and not greater than max | Under the drive window fields |
| Reset pause, min gap, finisher buffer and speech lead are numbers ≥ 0 | Advanced |
| Base and max speech rate are between 0.5 and 2.0, and base ≤ max | Advanced |
| Max cut offs per drive is a whole number 0–3 | Advanced |
| Max lay ups per drive is a whole number 0–5 | Advanced |
| Every weight is a number ≥ 0, and each weight table adds up to more than 0 | Advanced |
| **The shortest possible drive fits at `maxRate` in the min drive window** (cheapest LEFT/RIGHT plus cheapest finisher). The message includes the window it needs, e.g. "The shortest drive (LEFT + LAY UP LEFT SIDE) needs a window of at least 964 ms at max speech rate 1.6." | Under the drive window fields |

If the error is in Advanced, that section opens automatically.

---

## Tuning offense mode

### `OFFENSE_DEFAULTS`

Every tunable offense number lives in one commented object, `OFFENSE_DEFAULTS`, at the top of the first `<script>` block in `index.html`:

```js
const OFFENSE_DEFAULTS = {
  driveMinMs: 1400, driveMaxMs: 2000,
  resetPauseMs: 1000,
  baseRate: 1.25, maxRate: 1.6,
  minGapMs: 120,
  finisherBufferMs: 0,
  speechLeadMs: 0,
  maxCutOffsPerDrive: 3, maxLayUpsPerDrive: 2,
  startWeights: { … }, afterDriveOrCutOffWeights: { … }, afterLayUpWeights: { … },
  learnAlpha: 0.3, learnOutlierLow: 0.4, learnOutlierHigh: 2.5,
  phrases: { READ: { display: "READ", spoken: "read", estMs: 350 }, … },
};
```

- Values here are the **defaults** the start screen shows. Values you type into the start screen are saved and **override** these on that device. After changing a default in the file, clear the saved settings (`localStorage.removeItem("reactionCaller.settings")`) to see the new default in the form.
- The **phrase table** (`phrases`) is where you fix pronunciation (`spoken`), change on-screen text (`display`) or adjust the length estimates (`estMs`). Learned lengths (`reactionCaller.learnedMs`) override `estMs` per phrase. Delete that key to start learning from scratch after changing the voice or the spoken text.
- The read time is not in `OFFENSE_DEFAULTS`. It is the shared Min/Max fields (HTML defaults 1000 / 3000).
- The state table (`NEXT`) and finisher lists sit right below `OFFENSE_DEFAULTS`. They are structure, not tuning.

Rules of thumb:

- **Drives feel rushed or words sound sped up**: raise `driveMaxMs`/`driveMinMs`, lower `minGapMs`, or lower `baseRate`.
- **Long drives (several CUT OFFs) never happen**: they don't fit. Check the fit table below and raise `driveMaxMs` or `maxRate`.
- **Calls lag behind the countdown on a phone**: the voice starts late. Set `speechLeadMs` (e.g. 100–200), or add a `finisherBufferMs`.
- **A word is mispronounced**: change its `spoken` text.

### Self-test (`?selftest=1`)

Open:

```
http://localhost:8080/index.html?selftest=1
```

Use `/index.html?selftest=1`, not `/?selftest=1`. The bundled `server.js` only maps a bare `/` to `index.html`, so `/?selftest=1` returns "Not found".

Instead of the app, the page runs a simulation of the offense planner and prints **PASS** / **FAIL** for each check to the console and to an on-page banner (green when everything passes, red otherwise). It runs 10,000 drives at the **default** settings and 10,000 at **tight** settings (`D` fixed at 1400 ms, `maxRate` 2.0, `minGapMs` 40), and checks:

1. every drive starts with LEFT or RIGHT, chosen after READ;
2. every transition is in the state table, and nothing comes after a finisher;
3. every drive ends with exactly one finisher, legal for the previous call (long after LEFT/RIGHT/CUT OFF, short after LAY UP);
4. cut-offs and lay-ups per drive are within their caps;
5. `D` is within the drive window, and the speech rate is between `baseRate` and `maxRate`;
6. every call lies within `[0, D - finisherBufferMs]`, calls never overlap, and gaps are at least `minGapMs`;
7. with loose timing (a 30-second window, 40,000 drives), the observed pick frequencies match the weights within 2 percentage points (counting only picks where every legal choice was available).

It also prints a **fit table**: for 0–3 cut-offs and each finisher, the minimum drive window needed at `maxRate`, and whether it fits at `driveMaxMs`. With the defaults (`maxRate` 1.6, `minGapMs` 120, buffer 0, `driveMaxMs` 2000):

| Cut-offs | LAY UP LEFT/RIGHT SIDE | LAY UP CENTER SIDE | LEFT/RIGHT SIDE (after LAY UP) | CENTER SIDE (after LAY UP) |
|---|---|---|---|---|
| 0 | 964 ms ✓ | 1027 ms ✓ | 1147 ms ✓ | 1209 ms ✓ |
| 1 | 1365 ms ✓ | 1428 ms ✓ | 1548 ms ✓ | 1610 ms ✓ |
| 2 | 1767 ms ✓ | 1829 ms ✓ | 1949 ms ✓ | 2012 ms ✗ |
| 3 | 2168 ms ✗ | 2230 ms ✗ | 2350 ms ✗ | 2413 ms ✗ |

So with the defaults, **a drive can contain at most 2 CUT OFFs**, and the 3-cut-off cap never comes into play. Raise `driveMaxMs` to about 2420 ms, or raise `maxRate`, to make 3-cut-off drives possible.

The self-test uses `OFFENSE_DEFAULTS` and the seed estimates only. It ignores saved settings and learned lengths, and in self-test mode the normal app never starts.

You can run the same checks without a browser: the planner script has no DOM access, so it can be pulled out of `index.html` and run under Node with `OffensePlanner.runSelfTest(console.log)`.

---

## Project structure

```
Reaction game/
├── index.html   ← the whole app (HTML + CSS + three <script> blocks)
├── server.js    ← minimal static file server (Node.js, port 8080)
└── README.md    ← this document
```

---

## Architecture overview

```
┌────────────────────────── Your computer ──────────────────────────┐
│   node server.js  ──listens on 0.0.0.0:8080──┐                     │
│        └── reads files from its own folder   │                     │
└──────────────────────────────────────────────┼─────────────────────┘
                                               │  HTTP (LAN)
                     ┌─────────────────────────┴──────────────────────────┐
                     │               Phone / any browser                  │
                     │  index.html                                        │
                     │   ├─ Start screen: mode switch, settings, Start    │
                     │   ├─ Game screen: mode label, word, countdown, Stop│
                     │   ├─ Script 1: OffensePlanner (pure functions)     │
                     │   │    OFFENSE_DEFAULTS, state table, fit/plan,    │
                     │   │    validation, learning math, self-test        │
                     │   ├─ Script 2: the app                             │
                     │   │    speech, Defense mode, Offense runner,       │
                     │   │    settings form, localStorage                 │
                     │   └─ Script 3: ?selftest=1 page (inactive normally)│
                     └────────────────────────────────────────────────────┘
```

All logic runs **in the browser**. The server only delivers files and has no game state, API or database.

The planner is kept pure on purpose: its functions take settings, spoken lengths and an injectable `rng` (default `Math.random`) and return plain data. They never touch the DOM, timers or speech. That is what lets the self-test simulate tens of thousands of drives in well under a second, using exactly the code the game uses.

---

## `server.js` in detail

`server.js` is a 38-line static file server built on Node's standard library.

```js
const PORT = 8080;
const ROOT = __dirname;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
```

For each request it:

1. maps exactly `/` to `/index.html`;
2. strips the query string and URL-decodes the path;
3. joins it onto `ROOT` (normalizing `..`) and returns **403** if the result doesn't start with `ROOT`;
4. reads the file and returns **200** with the matching content type (`application/octet-stream` for unknown extensions), or **404** on any error.

It listens on `0.0.0.0` (all interfaces), which is what lets a phone on the same network connect. It has no HTTPS, no caching headers, no request logging and no configuration. The port and folder are fixed in code.

---

## `index.html` in detail

### Head and viewport

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
```

Mobile-responsive viewport. The page extends under iPhone notches (`viewport-fit=cover`) and pads itself back with `env(safe-area-inset-*)`. Zoom is disabled so stray taps mid-drill don't zoom the page.

### Styling

Colors are CSS custom properties on `:root`:

| Variable | Value | Used for |
|----------|-------|----------|
| `--bg` | `#0f1115` | Page background |
| `--panel` | `#171a21` | Settings panels and the mode switch |
| `--accent` | `#4f8cff` | Start button, focused input border, countdown fill |
| `--accent-down` | `#3a6fd6` | Start button while pressed |
| `--danger` | `#ff4f5e` | Stop button, error text |
| `--danger-down` | `#d93d4a` | Stop button while pressed |
| `--text` | `#f2f3f5` | Main text, READ |
| `--muted` | `#9aa1ab` | Subtitle, labels, mode label, countdown readout |

The app is dark-themed only. Global rules remove the tap highlight, disable pull-to-refresh (`overscroll-behavior: none`) and stop long-press text selection. Sizes use `clamp()` so the layout scales from 320 px phones to desktops without media queries.

Notable pieces:

- **`.segmented`**: the Defense | Offense switch. The selected button has `aria-pressed="true"` and a lighter background.
- **`.panel`**: rounded settings panels. `.range-row` puts two fields side by side, and `.field-grid` lays out Advanced fields and weights in two columns.
- **`details.advanced`**: the collapsible Advanced section (native `<details>` / `<summary>`).
- **`#word`**: the called word, `clamp(3rem, 16vw, 6rem)`, weight 800, uppercase. It is invisible by default (opacity 0, scale 0.85). Adding `.show` fades and grows it in over 120 ms. **`#word.long`** drops to `clamp(2rem, 10vw, 3.75rem)`, centers and allows wrapping.
- **`.countdown`**: the track and fill bar plus a tabular-number readout. The fill shrinks via `transform: scaleX(remaining / D)`. `.idle` hides it without changing the layout.
- Word color classes: `.word-left`, `.word-right`, `.word-up`, `.word-back` (Defense) and `.word-read`, `.word-center`, `.word-cut`, `.word-layup` (Offense; LEFT/RIGHT variants reuse the Defense blue and green).

### Markup

- **Start screen**: mode switch, title, subtitle (changes with the mode), the shared Min/Max panel, the offense panel (drive window fields plus Advanced, shown only in Offense) and **Start**. The weight inputs are generated from `OFFENSE_DEFAULTS` at load, so the form always matches the tables in code.
- **Game screen**: mode label, word stage, countdown (Offense only) and **Stop**.

Both screens are always in the DOM, and the `.hidden` class switches between them.

### Script 1: `OffensePlanner`

A pure module (an IIFE assigned to `const OffensePlanner`). It contains:

| Export | Purpose |
|--------|---------|
| `OFFENSE_DEFAULTS` | All tunable offense numbers and the phrase table |
| `NEXT`, `FINISHERS`, `LONG_FINISHERS`, `SHORT_FINISHERS`, `WEIGHT_TABLES` | The state machine |
| `cloneSettings(s)` | Deep copy of a settings object |
| `durationsFor(s, learned)` | Per-phrase length at rate 1.0: learned value if present, else `estMs` |
| `fitRate(ids, D, s, dur)` | The one speech rate a sequence needs in window `D`, or `null` if it can't fit |
| `minWindowFor(ids, s, dur)` | Smallest window a sequence fits in at `maxRate` |
| `planDrive(s, dur, rng, onPick)` | Builds one drive plan `{ D, rate, calls }` |
| `validateOffense(s, dur)` | Offense setting checks; returns `null` or `{ field, message }` |
| `learnDuration(current, measured, rate, s)` | One learning step, or `null` for an outlier |
| `fitTable(s, dur)` | Rows for the fit table |
| `runSelfTest(log, drives)` | The simulation; returns `{ passed, results, fitTable }` |

### Script 2: the app

Wrapped in an IIFE, so nothing leaks into the global scope. If `?selftest=1` is present it returns immediately.

- **Shared helpers**: `storageGet` / `storageSet` (try/catch around `localStorage`), voice loading and `pickVoice()` (first English voice, else the first voice, else the browser default), `speak(text, { rate, cancel })`, `primeSpeech()`, `validateRange()`, `randomDelay()` and `showWord(text, className)`.
  - `speak` cancels before speaking unless `cancel: false` is passed. Defense uses the default (cancel, rate 1), and Offense passes `cancel: false` and the drive's rate.
  - `primeSpeech` speaks a silent blank utterance inside the Start tap. iPhone Safari only allows speech that starts from a user gesture, and this unlocks it for the timer-driven calls that follow.
  - `showWord` sets the text and classes, removes `.show`, forces a reflow (`void wordEl.offsetWidth`) and adds `.show` back. The reflow makes the fade-in replay reliably even when the same call (e.g. CUT OFF) repeats.
- **Modes**: each mode is an object with `start(settings)` and `stop()`. `MODES` maps `defense` / `offense` to the mode object plus its labels and subtitle.
  - `defenseMode` chains `setTimeout` calls with a fresh random delay each time: pick a word, show it, speak it, schedule the next.
  - `offenseMode` runs the loop from [Running a drive](#running-a-drive). `later(fn, ms)` wraps every timer and records its id so `stop()` can clear them all. `say(id, rate)` shows and speaks a phrase and attaches the measuring handlers. `runId` lets late `onend` events from a stopped run be ignored.
- **Settings form**: `buildWeightTables()`, `fillOffenseDefaults()`, `readOffenseSettings()` (empty fields become `NaN` so validation catches them), `saveSettings()` / `loadSettings()`.
- **`startGame` / `stopGame`**: validate, prime speech, switch screens, start or stop the active mode, and cancel speech on Stop.

### Script 3: self-test page

Runs only with `?selftest=1`. It hides the app, calls `OffensePlanner.runSelfTest`, logs the results and fit table (`console.table`) and renders them in a `<pre>` banner.

---

## Browser APIs used

| API | Used for | Notes |
|-----|----------|-------|
| **Web Speech API** (`speechSynthesis`, `SpeechSynthesisUtterance`) | Speaking calls, measuring spoken length (`onstart` / `onend`) | Voices depend on the OS. iPhone needs a user gesture first, which is why the app primes speech in the Start tap. If speech is unavailable, the app still runs with visual calls only. |
| `performance.now()` | Drive clock for scheduling and the countdown | |
| `requestAnimationFrame` | Countdown bar animation | |
| `localStorage` | Mode, settings and learned lengths | Optional. Every access is guarded. |
| `URLSearchParams` | Detecting `?selftest=1` | |
| CSS `env(safe-area-inset-*)`, `dvh`, `clamp()`, `<details>` | Notch-safe, responsive layout | Older browsers fall back to `vh`. |

---

## Known limitations and quirks

### Gameplay

- **Defense: the first call isn't immediate**, repeats are possible, and short delays clip speech (Defense always cancels before speaking, by design).
- **Offense: queued speech can lag.** Calls never clip, so if the voice is slower than planned (before it has learned real lengths, or with voice start-up delay), later calls queue behind earlier ones and are heard late. Learned lengths and `speechLeadMs` / `finisherBufferMs` reduce this.
- **Offense: 3-cut-off drives don't fit at the default timings.** See the fit table above.
- **No scoring or reaction-time measurement**, and no session length or rep count. It runs until you press Stop.
- **No upper bound on read time or delay.** Large values are accepted.
- **Saved settings override code defaults.** Editing `OFFENSE_DEFAULTS` doesn't change a field that already has a saved value on that device.

### Technical

- **The screen may dim or lock during a session** unless the phone's auto-lock is set long enough. The app doesn't manage this itself.
- **Speech events vary by browser.** Some devices never fire `onstart` / `onend`, or fire them at odd times. Learning then simply doesn't happen, or outliers are discarded.
- **The word appears when it is sent to the voice.** With `speechLeadMs` > 0, the word shows that much before it is heard.
- **Zoom is disabled** (`user-scalable=no`), which is an accessibility drawback for users who need zoom.
- **Visual changes aren't announced to screen readers** (no `aria-live` region). The speech covers this in practice.

### Server

- **`/?anything` returns 404.** Only a bare `/` maps to `index.html`, so use `/index.html?selftest=1` for the self-test.
- **It serves every file in the folder, including `.git/`.** Anyone on your network can request them while the server runs. Fine on a home LAN, but don't expose it to the internet.
- **The traversal check is prefix-based.** `startsWith(ROOT)` would also accept a sibling folder whose name starts with the same text (e.g. `…/Reaction game2/`).
- **Limited MIME table, fixed port** (crashes with `EADDRINUSE` if 8080 is taken), **no HTTPS**, **no request logging**.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Phone can't open the page | Wrong IP, different network, or firewall | Use the computer's LAN IPv4 address, put both devices on the same Wi-Fi, and allow Node.js through Windows Firewall for private networks |
| `Error: listen EADDRINUSE :::8080` | Something else is using port 8080 | Close the other program, or change `PORT` in `server.js` |
| Words show but there's no sound | Phone on silent, volume low, or no voices installed | Turn off silent mode and raise media volume. On Android, check a text-to-speech engine is installed |
| No sound on iPhone at all | Speech wasn't unlocked by a gesture | Stop and tap Start again. The unlock only works inside a real tap |
| Self-test page says "Not found" | Opened `/?selftest=1` | Open `/index.html?selftest=1` |
| "The shortest drive (…) needs a window of at least N ms…" | Min drive window too small for the shortest drive at the max rate (possibly because learned lengths grew) | Raise the min drive window to N, or raise the max speech rate |
| Offense calls are heard later than the countdown suggests | Voice slower than planned, or slow to start | Let it learn for a few drives, set **Speech lead** to 100–200 ms, or add a **Finisher buffer** |
| Long drives with several CUT OFFs never happen | They don't fit in the drive window | Raise the max drive window or max speech rate (check the fit table) |
| A phrase is mispronounced | The voice's reading of the `spoken` text | Change `spoken` for that phrase in `OFFENSE_DEFAULTS.phrases` |
| Changed a default in code but the form still shows the old value | A saved value overrides it | Run `localStorage.removeItem("reactionCaller.settings")` on the app's page |
| Defense words sound cut off | Delay shorter than the spoken word | Raise the **Min delay** |

---

## Ideas for future work

- A "Reset to defaults" button and a way to view or clear learned lengths from the UI.
- Session timer or rep counter with auto-stop.
- An option to prevent the same Defense word twice in a row.
- Voice picker and a mute toggle (visual-only mode).
- Harden the server: serve only `index.html`, map `/?…` to `index.html`, use a `ROOT + path.sep` prefix check, and make the port configurable.
- Make it a PWA (manifest + service worker) so it can be installed to the home screen and work offline.
