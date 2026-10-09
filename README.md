# Reaction Caller

**Reaction Caller** is a small, dependency-free web app for basketball reaction drills. A voice calls commands at random times, the same command appears in large color-coded letters, and the player reacts. It has two modes:

- **Defense mode**: after a random wait, the app calls one of **Left**, **Right**, **Up** or **Back**, again and again until you press **Stop**.
- **Offense mode** is **Call & Execute: move fluency and readiness under unpredictable timing.** The app dictates every move; you execute it cleanly and on time. It is not decision-making or court-reading training: nothing is read from the defense, the call tells you what to do. It has two drills:
  - **Drive** simulates a ball-handler driving from the top of the key to the basket. The app calls **READY** (get in your stance, live dribble, wait for the call), then a drive direction (**LEFT** / **RIGHT**), then zero or more reactions to the defense (**CUT OFF**, **LAY UP**), and finally a **finisher** such as **LAY UP LEFT SIDE**. All of it happens inside a timed drive window shown as a countdown bar.
  - **Shooters only** trains sprinting to a spot, catching and dribbling to create space for a shot. The app calls a start call (**SPRINT FROM PAINT**, **SPRINT FROM LEFT CORNER**, **SPRINT FROM RIGHT CORNER** or **CATCH**), then **LEFT** / **RIGHT**, zero or more **CUT OFF**s and **SHOT**, all inside a timed create-space window. Sometimes a **NOPE** (the shot is contested) follows, and a second window starts.

  In both drills, calls are planned so that every spoken phrase fits inside its window and no call ever cuts off another. An Offense session is organized as **sets of reps**. After each set the app says "set done" and shows a quick big-button form where you log how the set went (shots made and attempted, lost handles, missed calls, how it felt). Every set is saved on the device as soon as you log it, then a rest countdown leads into the next set. Ending a session shows a summary compared with your recent sessions, and a **History** screen shows trends over weeks and lets you export and import the log as a backup. With **Auto difficulty** on, each drill has a level from 1 to 5 that sets its timing and moves up or down after each logged set, so the task stays hard but doable.

The app is meant to run on a phone (iPhone Safari is the main target) propped up nearby while you train. The words are big enough to read from a distance, and the voice means you don't have to look at all.

The whole project is two files:

| File | Size | Purpose |
|------|------|---------|
| `index.html` | ~198 KB | The entire app: markup, styles and JavaScript in one page |
| `server.js` | ~1 KB | A tiny Node.js static file server so phones on your network can open the app |

There is no build step, no `package.json`, no framework and no third-party library.

---

## Table of contents

1. [Quick start](#quick-start)
2. [How to use the app](#how-to-use-the-app)
   - [Choosing a mode](#choosing-a-mode)
   - [Defense mode](#defense-mode)
   - [Offense mode](#offense-mode)
   - [Offense: Drive drill](#offense-drive-drill)
   - [Offense: Shooters only drill](#offense-shooters-only-drill)
   - [Offense: sessions, sets and reps](#offense-sessions-sets-and-reps)
   - [Offense: logging a set](#offense-logging-a-set)
   - [Offense: session summary](#offense-session-summary)
   - [History and backup](#history-and-backup)
   - [Offense: adaptive difficulty](#offense-adaptive-difficulty)
   - [Stopping](#stopping)
   - [What is saved between visits](#what-is-saved-between-visits)
3. [Offense mode in depth (Drive drill)](#offense-mode-in-depth-drive-drill)
   - [Phrases](#phrases)
   - [State machine](#state-machine)
   - [Weights](#weights)
   - [Timing rules](#timing-rules)
   - [Planning a drive](#planning-a-drive)
   - [Running a rep](#running-a-rep)
   - [Learned spoken lengths](#learned-spoken-lengths)
   - [Validation](#validation)
4. [Shooters only drill in depth](#shooters-only-drill-in-depth)
   - [Shooters phrases](#shooters-phrases)
   - [Shooters state machine](#shooters-state-machine)
   - [Shooters weights](#shooters-weights)
   - [Shooters timing rules](#shooters-timing-rules)
   - [Planning a Shooters rep](#planning-a-shooters-rep)
   - [Shooters validation](#shooters-validation)
5. [Drill profiles and rep plans](#drill-profiles-and-rep-plans)
   - [The training log](#the-training-log)
6. [Tuning offense mode](#tuning-offense-mode)
7. [Project structure](#project-structure)
8. [Architecture overview](#architecture-overview)
9. [`server.js` in detail](#serverjs-in-detail)
10. [`index.html` in detail](#indexhtml-in-detail)
11. [Browser APIs used](#browser-apis-used)
12. [Known limitations and quirks](#known-limitations-and-quirks)
13. [Troubleshooting](#troubleshooting)
14. [Ideas for future work](#ideas-for-future-work)

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

In Defense, the **Min delay (ms) / Max delay (ms)** fields set the random wait between calls (defaults 1000 and 3000 ms). They are hidden in Offense: the Drive drill has its own read time fields (see [Drive drill](#offense-drive-drill)).

| Condition | Error message shown |
|-----------|---------------------|
| Either field is empty or not a number | "Enter values of at least 100ms." |
| Either value is below 100 | "Enter values of at least 100ms." |
| Min is greater than max | "Min delay must not exceed max delay." |

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

Offense is **Call & Execute: move fluency and readiness under unpredictable timing.** Every call tells you exactly what to do; the training effect is executing the move fast and clean when you can't predict when (or which way) the call comes. It does not train reading the defense or making decisions.

Select **Offense** to see the offense panel. At its top is a **Drive | Shooters only** switch (Drive is the default, and your choice is remembered). Below it is **Auto difficulty** (on by default) with each drill's current level and a **Reset level** button (see [adaptive difficulty](#offense-adaptive-difficulty)), then the settings for the selected drill, then the **Session** group (reps per set, planned sets, session time warning; see [sessions, sets and reps](#offense-sessions-sets-and-reps)), and at the bottom a collapsible **Speech (both drills)** group: base and max speech rate, minimum gap and speech lead. Both drills use the same session and speech settings.

| Drill | When to use it |
|-------|----------------|
| **Drive** | Attacking off the dribble: stay ready, drive on the call, counter, finish on the side called. |
| **Shooters only** | Catch-and-shoot and shot creation: sprint to a spot (or catch), then create space with LEFT / RIGHT until you're open for the shot. |

Each Start runs one drill for the whole session, set after set (see [sessions, sets and reps](#offense-sessions-sets-and-reps)). There is no mixed drill yet (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)).

### Offense: Drive drill

The Drive settings are:

- **Min / Max read time (ms)**: the random wait after READY before the drive call (default 800–3500 ms). The wide range is on purpose, so you can't learn when the call comes. Whole numbers of at least 100 ms, min ≤ max ("Read times must be whole numbers of at least 100 ms." / "Min read time must not exceed max read time.").
- **Min / Max drive window (ms)**: how long each drive lasts (default 1400–2000 ms).
- **Advanced** (collapsed by default): reset pause, finisher buffer, max cut offs and max lay ups per drive, and the three weight tables. Every setting is described in [Timing rules](#timing-rules) and [Weights](#weights).

Press **Start**. The game screen shows the label **OFFENSE · DRIVE**, the set and rep counter, the session clock, the current call and a **countdown bar** with a seconds readout. Within a set, reps loop like this:

```
READY ─(read time: random Min..Max read time)─▶ LEFT or RIGHT ──▶ [CUT OFF / LAY UP …] ──▶ FINISHER
  ▲                                              └──────────── drive window D, countdown runs ───────────┘
  └──────────────────────────── reset pause (1 s) after the countdown hits 0 ◀──────────────────────────┘
```

What each call tells the player:

| Call | Meaning |
|------|---------|
| **READY** | Get in your stance at the top of the key, keep a live dribble, and wait for the call. |
| **LEFT / RIGHT** | Drive that way. The drive countdown starts now. |
| **CUT OFF** | The defender cut off your lane. Counter to the other side. |
| **LAY UP** | The lane is clear for now, but stay ready because it can still get cut off. |
| **Finisher** (e.g. **LAY UP CENTER SIDE**, **LEFT SIDE**) | The lane is clear. Finish on the side named. |

Calls are colored by meaning:

| Calls | Color | Hex |
|-------|-------|-----|
| READY | White | `#f2f3f5` |
| LEFT, LEFT SIDE, LAY UP LEFT SIDE | Blue | `#4f8cff` |
| RIGHT, RIGHT SIDE, LAY UP RIGHT SIDE | Green | `#4fd87c` |
| CENTER SIDE, LAY UP CENTER SIDE | Purple | `#c47bff` |
| CUT OFF | Red | `#ff4f5e` |
| LAY UP | Yellow | `#ffd24f` |

Phrases longer than 7 characters (e.g. "LAY UP CENTER SIDE") use a smaller font and may wrap to two lines, so they stay readable on a 320 px-wide screen. Phrases longer than 18 characters (only the corner sprint calls of the Shooters drill) get one step smaller still. Short calls keep the huge font.

The countdown bar is visible only during the drive, from the LEFT/RIGHT call until the window `D` runs out. It drains from `D` to 0 with a one-decimal seconds readout ("1.6 s"). During the reset pause it sits empty at "0.0 s", and it is hidden while READY is up.

### Offense: Shooters only drill

The Shooters settings are:

- **Min / Max window (ms)**: how long each create-space window lasts (default 1000–1800 ms).
- **Reset pause (ms)**: wait after a rep's last window before the next start call (default 1000 ms; separate from the Drive reset pause).
- **Advanced** (collapsed by default): the get-set time range after each start call, nope gap and after-nope gap ranges, shot buffer, max cut offs per window, max nopes per rep, and the five weight tables. Every setting is described in [Shooters timing rules](#shooters-timing-rules) and [Shooters weights](#shooters-weights).

The Drive read time fields and every other Drive-only control are hidden in this drill.

Press **Start**. The game screen shows **OFFENSE · SHOOTERS**, the set and rep counter and the session clock. Within a set, reps loop like this:

```
start call ──(get-set)──▶ LEFT/RIGHT ▶ [CUT OFF …] ▶ SHOT ──┬─(65%)──────────────────────────────────────────▶ reset pause ─┐
                          └──── window D, countdown ────┘  └─(35%)▶ NOPE ▶ LEFT/RIGHT ▶ [CUT OFF …] ▶ SHOT ──▶ reset pause ─┤
  ▲                                                                         └──── second window D ────┘                     │
  └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

What each call tells the player:

| Call | Meaning |
|------|---------|
| **SPRINT FROM PAINT / LEFT CORNER / RIGHT CORNER** | Get to that spot. |
| **CATCH** | Catch the ball. |
| **LEFT / RIGHT** | Dribble that way to create space. The window countdown starts now. |
| **CUT OFF** | The defender took that away. Counter. |
| **SHOT** | You're open. Shoot. |
| **NOPE** | The shot is contested. Abort and create space again (a new window follows). |

| Calls | Color | Hex |
|-------|-------|-----|
| SPRINT FROM … | Orange | `#ff7a4f` |
| CATCH | White | `#f2f3f5` |
| LEFT | Blue | `#4f8cff` |
| RIGHT | Green | `#4fd87c` |
| CUT OFF | Red | `#ff4f5e` |
| SHOT | Yellow | `#ffd24f` |
| NOPE | Pink | `#ff6bd6` |

The countdown bar drains **once per window**, from the LEFT/RIGHT call until that window's `D` runs out. Between windows (around a NOPE) and during the reset pause it sits empty at "0.0 s". It is hidden during the start call and the get-set time.

### Offense: sessions, sets and reps

Offense is organized like a training session in the gym:

| Term | Meaning |
|------|---------|
| **Rep** | One rep plan from the drill: one READY … finisher drive, or one Shooters rep (start call through the last SHOT) |
| **Set** | A fixed number of reps (**Reps per set**) |
| **Session** | Everything from Start until you end it |

The **Session** group in the offense panel uses big − / + steppers (you can also type a value):

| Setting | Default | Allowed | Meaning |
|---------|---------|---------|---------|
| Reps per set | 8 | whole number 3–30 | Reps before the set ends |
| Planned sets | 4 | whole number 1–20 | Your target. It is shown on the game screen, but it is **not a hard stop**: you can keep going |
| Session time warning (min) | 45 | whole number ≥ 0 (0 = off) | When the session clock reaches it, a calm banner appears at the top of the game screen: "45 min: decision quality and technique drop with fatigue. Consider finishing this set and stopping." The session is never stopped automatically, and the banner stays until the session ends |
| Rest between sets (s) | 60 | whole number 0–600 | The rest countdown after **Save & rest** or **Skip logging** (steps of 15 s) |

An invalid value shows an error under the Session group when you press Start.

During a set, the game screen shows, under the mode label, **SET 2 / 4 · REP 5 / 8 · LVL 3** (the current set and rep, out of the planned sets and reps per set, and the difficulty level when [Auto difficulty](#offense-adaptive-difficulty) is on), and the elapsed session time (mm:ss) in the top-right corner. Past the plan the set number keeps counting (**SET 5 / 4**). The session clock keeps running between sets.

When the **last rep of a set ends** (at the end of its window, without waiting for its reset pause):

1. no more reps are scheduled;
2. the voice says **"set done"**, queued behind the last call so it never cuts it off;
3. the **set log** form appears (see [logging a set](#offense-logging-a-set)).

### Offense: logging a set

You log a set only **after** it ends, never during it. The form is one screen of big controls (− / + steppers at least 56 px tall, three large rating buttons), so it works with sweaty hands. You can also type into the number fields.

The top shows the drill and what you are logging, e.g. **OFFENSE · SHOOTERS** / **Set 2 · 8 reps**, or **Partial set 2 · 5 of 8 reps** after Stop.

| Field | Default | Meaning |
|-------|---------|---------|
| **Shots made** | 0 | Shots or finishes you made. Can't go above attempted: the + button stops there, and lowering attempted pulls made down with it |
| **Shots attempted** | the reps in the set | Each rep ends in exactly one real shot or finish (a SHOT followed by NOPE doesn't count), so this is normally the rep count |
| **Lost handles** | 0 | Lost dribble, travel, or picked up the dribble early |
| **Missed or late calls** | 0 | Calls you didn't react to in time |
| **How did the set feel?** | none | One tap: **Clean**, **Rushed** or **Off-balance**. Optional; tap the selected one again to clear it |
| **Note** | empty | Optional free text (up to 500 characters), under a collapsed "Add a note" |

Buttons:

| Button | What it does |
|--------|--------------|
| **Save & rest** | Saves the set and shows the rest countdown (**Rest between sets**, default 60 s), the level line when Auto difficulty is on (e.g. "Level 3 → 4: nice, timing gets tighter"), and a summary of the session so far, e.g. "This session: 3 sets · 14/24 made (58%) · 0.21 errors per rep · 2 of 3 rated sets clean". When it reaches 00:00 a big **Next set** button appears. **End session** is available throughout |
| **Save & end session** | Saves the set, ends the session and shows the [session summary](#offense-session-summary) |
| **Skip logging** | Saves the set with every outcome field (made, attempted, lost handles, missed calls, rating, note) empty (`null`), then rests like Save & rest |
| **Discard** | Only after Stop mid-set: drops the partial set without saving it and ends the session |

If a value is invalid (e.g. you typed made 9 with attempted 8, or left a field empty), the reason shows above the buttons and nothing is saved until you fix it.

**Next set** starts the next set right away, beginning with its first call (READY or a Shooters start call). The tap unlocks speech again on iPhone. **End session** ends the session and shows the [session summary](#offense-session-summary).

The rest screen says "Set saved." after each save, or "Couldn't save to this device. Storage may be blocked or full." if storage refused it. Training carries on either way. What is stored is described in [The training log](#the-training-log).

### Offense: session summary

When a session that has at least one saved set ends (**End session**, **Save & end session**, **Discard**, or Stop before a set's first rep finishes), the **Session done** screen shows:

- the **session length** (from Start to the end, mm:ss);
- a card **per drill** played, with: sets, reps, made / attempted and make %, lost handles per 10 reps, missed calls per 10 reps, and the share of rated sets marked Clean. Values that weren't logged show "–" (skipped sets don't count toward the rates);
- one plain-language line comparing today with the **mean of your previous 5 sessions of the same drill** (each earlier session's own rate, averaged), e.g. "Make % 62 (avg 55). Lost handles 1.2 per 10 reps (avg 2.0)". With no earlier sessions of that drill it adds "No earlier sessions to compare with yet". With fewer than 5 earlier sessions it averages those it has.

**Done** returns to the start screen. A session with no saved sets goes straight back to the start screen.

### History and backup

Tap **History** on the start screen.

**Trends.** For each drill, a small chart of the last 20 sessions of that drill (oldest on the left). The solid blue line is **make %** (left axis, 0–100%), the dashed orange line is **lost handles per 10 reps** (right axis, 0 up to the highest value rounded up, at least 2). The first and last session dates are under the x-axis. With fewer than 3 sessions of a drill it shows "Not enough data".

**Sessions.** Every saved session, newest first: date and time, drills, sets, make % and errors (lost handles + missed calls) per 10 reps. Tap one to see its sets (drill, reps, made / attempted, lost, missed, rating, note). **Delete session** asks for confirmation first ("Delete" / "Cancel"), then removes it from the log for good.

**Backup.** Saved data lives only in this browser, at this exact address. Safari can clear it after weeks without a visit, and if your computer's LAN IP changes the app opens at a new address with an empty log. So export now and then:

| Button | What it does |
|--------|--------------|
| **Export log (JSON)** | Downloads the whole log as `reaction-caller-log-YYYY-MM-DD.json`. This is the backup you can import later. Records the export date |
| **Export sets (CSV)** | Downloads `reaction-caller-sets-YYYY-MM-DD.csv`: one row per set, for a spreadsheet. Columns: `session_id, session_started, set, drill, level, reps, set_started, set_ended, made, attempted, lost_handles, missed_calls, quality, note`. Empty cells are values that weren't logged; notes with commas, quotes or line breaks are quoted (`"` doubled) |
| **Import JSON file** | Picks a JSON backup and merges it (below) |
| **Backup as text** | Shows the JSON in a text box with **Copy** and **Import this text**. Use it to copy the log by hand, or to paste a backup in |

If the browser can't start a download, the export shows its text in that box instead, ready to copy. Copying the JSON log counts as an export.

**Import** merges by session id and never creates duplicates:

- sessions that aren't here yet are added;
- exact copies of sessions already here are skipped;
- sessions with the same id but different content are **not replaced unless you agree**: the app asks "N sessions in the backup differ from the version saved here. Replace them with the backup's version?" with **Replace them** and **Keep mine**;
- a file that isn't valid JSON, isn't a Reaction Caller log, or comes from a newer log version is rejected with a message, and nothing changes. Sessions inside the file that aren't valid are skipped and counted.

The history screen shows the **last export** date ("Never exported." until the first). The start screen shows a gentle reminder when **more than 10 sessions** haven't been exported (sessions that ended after the last export).

### Offense: adaptive difficulty

Learning is best when a task is hard but doable for your current skill (the "challenge point" idea). Instead of hand-editing windows and weights, **Auto difficulty** (in the offense panel, **on** by default) gives each drill a **level from 1 (easiest) to 5** that sets its timing, and moves the level after every logged set.

**When Auto difficulty is on:**

- Planning uses the current level's values (table below). The manual fields those values replace are shown greyed out and read-only, labelled **"set by Level 3"**. Every other field (reset pause, caps, gaps, get-set times, the other weights, speech settings, session settings) still applies as you set it. Your own values in the replaced fields are kept and saved, and come back when you turn Auto difficulty off.
- Each logged set records its `level` in the training log, and the game screen shows **LVL 3** next to the set counter.
- After you save a set, the rule below picks the level for the **next** set, and the rest screen shows one line: "Level 3 → 4: nice, timing gets tighter", "Level 3 → 2: easing off so you can lock it in", or "Holding at Level 3" (with the reason when a set couldn't count: too few shots, or a skipped set). The level is stored per drill, so it carries over to your next session.
- The start screen shows each drill's current level, with a **Reset level** button per drill (back to Level 3).

**When it is off**, everything works exactly as before: your own field values plan the reps, sets are logged with `level: null`, and levels don't change.

**Levels** (all values provisional, in `TRAINING_DEFAULTS.levels`):

| Level | Drive window (ms) | Drive read time (ms) | Drive CUT OFF / LAY UP weights | Shooters window (ms) | Shooters CUT OFF : SHOT | NOPE : END |
|---|---|---|---|---|---|---|
| 1 | 2200–2800 | 2000–3500 | 10 / 10 | 1600–2200 | 15 : 85 | 15 : 85 |
| 2 | 1900–2500 | 1500–3000 | 15 / 15 | 1400–2000 | 25 : 75 | 25 : 75 |
| 3 | 1600–2200 | 1000–2500 | 20 / 20 | 1200–1800 | 30 : 70 | 35 : 65 |
| 4 | 1500–2000 | 800–2000 | 28 / 25 | 1050–1600 | 40 : 60 | 40 : 60 |
| 5 | 1400–1800 | 600–1500 | 35 / 30 | 950–1400 | 45 : 55 | 45 : 55 |

The Drive CUT OFF / LAY UP weights are the CUT OFF and LAY UP entries of `afterDriveOrCutOffWeights` (the three `LAY UP … SIDE` finishers stay at 20 each), so higher levels make drives busier as well as shorter. Shooters levels set `afterDirectionOrCutOffWeights` and `afterShotWeights`.

Every level passes the drill's normal validation, including the shortest-drive and shortest-window fit checks (a self-test check loops over all ten). From the fit tables, at the defaults (`maxRate` 1.6, `minGapMs` 120):

| Level | Drive: most CUT OFFs that fit at the min / max window | Shooters: most CUT OFFs that fit at the min / max window |
|---|---|---|
| 1 | 3 / 3 | 2 / 2 |
| 2 | 2 / 3 | 2 / 2 |
| 3 | 1 / 3 | 1 / 2 |
| 4 | 1 / 2 | 1 / 2 |
| 5 | 1 / 2 | 0 / 2 |

(Drive counts use the cheapest finisher; longer finishers need a little more room.)

**The adjustment rule** (`nextLevel(level, set, cfg)`), applied after each saved set:

- A set only counts if its outcomes were logged (not skipped) and it has **at least 5 shots attempted**. Otherwise the level holds.
- *success* = made / attempted; *error rate* = (lost handles + missed calls) / reps.
- **Step up** one level if success ≥ **0.80** and error rate ≤ **0.10**.
- **Step down** one level if success < **0.50** or error rate ≥ **0.30**.
- Otherwise **hold**. The level always stays within 1–5.

**These thresholds, the level values and the starting level are starting heuristics to tune, not research-proven values.** The challenge-point idea says to keep practice hard but doable; it doesn't say that 80% or 0.10 errors per rep is the right line for this drill. They are all marked `// provisional` in `TRAINING_DEFAULTS` (`startLevel`, `levelMinAttempts`, `levelUpSuccess`, `levelUpMaxErrorRate`, `levelDownSuccess`, `levelDownErrorRate`, `levels`). Watch your History trends and adjust them.

### Stopping

**Stop in the middle of an Offense set**, once at least one rep of that set has finished, halts the set and opens the log form for the **partial set**:

- every pending call and the countdown are cleared and speech is silenced immediately, as before;
- the form shows "Partial set *n* · *done* of *planned* reps", with attempted defaulting to the reps completed (the rep in progress when you pressed Stop doesn't count);
- it has the same buttons plus **Discard**. Save & rest and Skip logging continue the session (rest, then the next set); Save & end session and Discard end it.

**Stop in Defense**, or in Offense before any rep of the current set has finished, and **End session** (on the rest screen) or **Discard**:

- cancel every pending call (Offense keeps all its timers in one list and clears them all, whatever state the rep is in: start call, get-set, mid-window, NOPE gap or reset pause);
- stop the countdown animation, the session clock and any rest countdown;
- silence speech immediately (`speechSynthesis.cancel()`);
- write the session's end time to the training log, if it has saved sets;
- show the [session summary](#offense-session-summary) if the session has saved sets, otherwise return to the start screen. Your settings stay in the fields. The next Start begins a new session at set 1.

Speech events that arrive late from a stopped run are ignored.

### What is saved between visits

The app uses `localStorage` and saves only:

| Key | Contents | When written |
|-----|----------|--------------|
| `reactionCaller.mode` | `"defense"` or `"offense"` | When you tap the mode switch |
| `reactionCaller.offenseDrill` | `"drive"` or `"shooters"` (missing or unknown means Drive) | When you tap the drill switch |
| `reactionCaller.settings` | The raw text of Defense's Min/Max delay fields and every offense field: Drive read time, window and Advanced values, the shared speech settings, every Shooters field (window, reset pause, get-set ranges, gaps, buffer, caps), every weight and the Session fields (reps per set, planned sets, session time warning), keyed by input id | Whenever you edit any of those fields, by typing or with the − / + steppers |
| `reactionCaller.learnedMs` | Learned spoken length of each offense phrase, Drive and Shooters alike (see [Learned spoken lengths](#learned-spoken-lengths)) | After each measured offense call |
| `reactionCaller.log` | The training log: every Offense session and its logged sets (see [The training log](#the-training-log)) | After every saved set (Save & rest, Save & end session, Skip logging), and when a session with saved sets ends |
| `reactionCaller.log.backup.<time>` | The raw text of a stored log that this version couldn't read (broken, or from a newer version), kept untouched | Once, just before the first new log is saved over it |
| `reactionCaller.lastExportAt` | ISO time of the last JSON export (download, or copying the JSON text) | On export |
| `reactionCaller.levels` | Each drill's current level, e.g. `{"drive":3,"shooters":4}` (missing or invalid means Level 3) | After every logged set with Auto difficulty on, and on Reset level |
| `reactionCaller.autoLevel` | `"on"` or `"off"` (missing means on) | When you tap the Auto difficulty toggle |
| `reactionCaller.migrations` | Ids of one-time migrations already applied, e.g. `["read-to-ready"]` | Once, on the first load after a migration is added |

Settings are saved by input id, and the Drive and speech fields kept their ids. So settings saved before the Shooters drill or the Session group existed still load, and any field without a saved value shows its default.

Nothing else is stored. Every storage access is wrapped in `try/catch`. If storage is blocked (private mode, disabled site data), the app works normally with the built-in defaults and just doesn't remember anything; the rest screen then says the set couldn't be saved.

To reset everything to defaults, clear the site's data in your browser, or run `localStorage.clear()` in the browser console on the app's page.

---

## Offense mode in depth (Drive drill)

This section describes the Drive drill. The phrase table, speech settings, runner and learned lengths are shared with the Shooters drill, which is covered in [Shooters only drill in depth](#shooters-only-drill-in-depth).

### Phrases

Each phrase has an id, the text shown on screen, the text sent to the voice and a rough spoken length at speech rate 1.0. `spoken` is separate from `display` so pronunciation can be fixed without changing the screen. For example, "lay up" may sound better as "layup".

The first Drive call has the internal id `READ` but is shown as **READY** and spoken "ready". It used to be READ, but nothing is read from the court: the app then dictates the direction. The id was kept so saved settings and code keep working. Because the spoken text changed, the learned spoken length for `READ` is discarded once, on the first load after the change (the marker `read-to-ready` is stored in `reactionCaller.migrations` so it never happens again); it is then re-learned from the 350 ms estimate.

| id | display | spoken | est. ms at rate 1.0 | finisher? |
|---|---|---|---|---|
| READ | READY | ready | 350 | |
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

The estimates are only a starting point. The app measures the real lengths on your device and uses those once it has them. The Shooters phrases live in the same table (see [Shooters phrases](#shooters-phrases)).

### State machine

| From | Allowed next |
|---|---|
| READ (READY) | LEFT, RIGHT |
| LEFT, RIGHT, CUT_OFF | CUT_OFF, LAY_UP, LAY_UP_LEFT_SIDE, LAY_UP_RIGHT_SIDE, LAY_UP_CENTER_SIDE |
| LAY_UP | CUT_OFF, LEFT_SIDE, RIGHT_SIDE, CENTER_SIDE |
| any finisher | the drive ends; READY follows after the reset pause |

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
| `startWeights` | READY | LEFT 50, RIGHT 50 |
| `afterDriveOrCutOffWeights` | LEFT, RIGHT, CUT OFF | CUT OFF 20, LAY UP 20, LAY UP LEFT SIDE 20, LAY UP RIGHT SIDE 20, LAY UP CENTER SIDE 20 |
| `afterLayUpWeights` | LAY UP | CUT OFF 25, LEFT SIDE 25, RIGHT SIDE 25, CENTER SIDE 25 |

If every remaining choice has weight 0, the app picks the **cheapest fitting finisher** (shortest spoken length). When choosing LEFT/RIGHT it picks the cheapest fitting direction.

Raising CUT OFF and LAY UP makes drives longer and busier, and raising the finisher weights makes drives shorter.

### Timing rules

| Setting | Default | Meaning |
|---|---|---|
| `readMinMs` / `readMaxMs` (read time) | 800 / 3500 | Wait after READY before the drive starts, picked uniformly (whole ms). Wide on purpose, so the drive call can't be anticipated |
| `driveMinMs` / `driveMaxMs` | 1400 / 2000 | Drive window `D`, picked uniformly (whole ms) in this range when LEFT/RIGHT is called |
| `resetPauseMs` | 1000 | Wait after the drive ends before READY is called again |
| `baseRate` | 1.25 | Normal speech rate (shared with Shooters) |
| `maxRate` | 1.6 | Speech rate ceiling (shared with Shooters) |
| `minGapMs` | 120 | Minimum silence between calls in a drive (shared with Shooters, per window) |
| `finisherBufferMs` | 0 | The finisher must finish being spoken this long before `D` ends |
| `speechLeadMs` | 0 | Speak each call this much early to offset voice start-up delay (shared with Shooters) |
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

The planned drive is then wrapped into a **rep plan** (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)): READY at 0 (at `baseRate`), the drive calls shifted by the random read time, one countdown window `{ startMs: readMs, durMs: D }`, `endMs = readMs + D` and `restMs = resetPauseMs`.

### Running a rep

The same runner executes every drill's rep plan:

1. When a rep starts, the app records the rep clock origin with `performance.now()` (plus `speechLeadMs`, so t = 0 is when the first call should be *heard*). The first call (READY, or a Shooters start call) is spoken right away.
2. Every later call gets its own `setTimeout`, computed from that origin rather than chained from the previous timer, so drift doesn't accumulate. Each fires `speechLeadMs` early. The word appears at the same moment it is sent to the voice, at the call's planned rate.
3. The countdown bar is drawn **only from `plan.windows`**. At each window's start it drains on `requestAnimationFrame` from the same clock, then sits empty at "0.0 s". It is hidden from the start of the rep until the first window.
4. When `endMs + restMs` has passed, the runner plans and starts the next rep. If the rep was the **last of its set**, the runner instead ends the set at `endMs` (the rest is not waited for): it says "set done" with `cancel: false` and shows the set log form. **Next set** starts the next set's first rep inside that tap (see [sessions, sets and reps](#offense-sessions-sets-and-reps)).
5. On **Start** (and on **Next set**), Offense speaks the first call immediately, right after unlocking speech inside the click. That unlock is required on iPhone.

Every timer goes into one list, so Stop clears all of them in any state. The session clock runs on its own interval, which Stop also clears. A run id makes late `onend` events from a stopped run be ignored. In Offense the runner never calls `speechSynthesis.cancel()` between calls; only Stop does.

### Learned spoken lengths

Real spoken lengths depend on the voice and device. For every offense call the app listens to the utterance's `onstart` and `onend` events, measures the time between them and normalizes it to rate 1.0 (`measured × rate`). Then:

This covers every offense phrase, Drive and Shooters alike. Shared phrases (LEFT, RIGHT, CUT OFF) share one learned value.

- the measurement is ignored if it is more than 2.5× or less than 0.4× the current value (outliers), if an event is missing, if the utterance errors, or if Stop interrupted it;
- otherwise the stored value moves 30% of the way toward it (an exponential moving average);
- values are saved in `localStorage` under `reactionCaller.learnedMs`.

The planner uses a learned value when there is one, and the table estimate otherwise. Lengths are **fixed for a whole run** (the ones validated at Start), and anything learned during a run takes effect at the next Start. If a device never fires these events, nothing changes and the estimates are used.

### Validation

Pressing Start in the Drive drill checks:

| Rule | Where the error shows |
|------|-----------------------|
| Min and max read time are whole numbers ≥ 100 ms, and min ≤ max | Under the drive window fields |
| Min drive window is a whole number ≥ 600 ms and not greater than max | Under the drive window fields |
| Reset pause and finisher buffer are numbers ≥ 0 | Advanced |
| Min gap and speech lead are numbers ≥ 0 | Speech |
| Base and max speech rate are between 0.5 and 2.0, and base ≤ max | Speech |
| Max cut offs per drive is a whole number 0–3 | Advanced |
| Max lay ups per drive is a whole number 0–5 | Advanced |
| Every weight is a number ≥ 0, and each weight table adds up to more than 0 | Advanced |
| **The shortest possible drive fits at `maxRate` in the min drive window** (cheapest LEFT/RIGHT plus cheapest finisher). The message includes the window it needs, e.g. "The shortest drive (LEFT + LAY UP LEFT SIDE) needs a window of at least 964 ms at max speech rate 1.6." | Under the drive window fields |

If the error is in Advanced or Speech, that section opens automatically.

---

## Shooters only drill in depth

### Shooters phrases

The Shooters drill adds six phrases to the shared phrase table and reuses LEFT (350), RIGHT (350) and CUT_OFF (450).

| id | display | spoken | est. ms at rate 1.0 | role |
|---|---|---|---|---|
| SPRINT_FROM_PAINT | SPRINT FROM PAINT | sprint from paint | 900 | start call |
| SPRINT_FROM_LEFT_CORNER | SPRINT FROM LEFT CORNER | sprint from left corner | 1100 | start call |
| SPRINT_FROM_RIGHT_CORNER | SPRINT FROM RIGHT CORNER | sprint from right corner | 1150 | start call |
| CATCH | CATCH | catch | 400 | start call |
| SHOT | SHOT | shot | 350 | closes a window |
| NOPE | NOPE | nope | 350 | after SHOT: start another window |

### Shooters state machine

| From | Allowed next |
|---|---|
| (rep start) | exactly one of the four start calls |
| any start call | LEFT, RIGHT |
| LEFT, RIGHT, CUT_OFF | CUT_OFF, SHOT |
| SHOT | NOPE, or the rep ends |
| NOPE | LEFT, RIGHT |

A **window** is LEFT or RIGHT, then 0 or more CUT OFFs, then SHOT. A **rep** is one start call followed by one or two windows (a NOPE after SHOT starts the next window).

**Caps:** at most `maxCutOffsPerWindow` (2) CUT OFFs per window, counted per window (they reset after a NOPE), and at most `maxNopesPerRep` (1) NOPEs per rep. A choice that would break a cap is never offered.

Example reps:

```
SPRINT FROM PAINT > LEFT > SHOT
CATCH > RIGHT > CUT OFF > SHOT
SPRINT FROM LEFT CORNER > LEFT > CUT OFF > CUT OFF > SHOT > NOPE > RIGHT > SHOT
```

### Shooters weights

All in `OFFENSE_DEFAULTS.shooters`. Weights are normalized at pick time, after illegal and non-fitting choices are removed.

| Table | Used | Defaults |
|-------|------|----------|
| `startWeights` | picking the rep's start call | SPRINT FROM PAINT 25, LEFT CORNER 25, RIGHT CORNER 25, CATCH 25 |
| `afterStartWeights` | start call → first direction | LEFT 50, RIGHT 50 |
| `afterDirectionOrCutOffWeights` | after LEFT, RIGHT or CUT OFF | CUT OFF 30, SHOT 70 |
| `afterShotWeights` | after SHOT | END 65, NOPE 35 (END = the rep ends) |
| `afterNopeWeights` | after NOPE | LEFT 50, RIGHT 50 |

The direction after a NOPE is random by default (no bias to the opposite side). Change `afterNopeWeights` to bias it.

If every remaining choice has weight 0, the fallbacks are: after a direction or CUT OFF, SHOT; after SHOT, END; after a start call or NOPE, a random fitting direction. (Validation requires every table to add up to more than 0, so these only matter when caps or fit remove the weighted choices.)

### Shooters timing rules

| Setting | Default | Meaning |
|---|---|---|
| `windowMinMs` / `windowMaxMs` | 1000 / 1800 | Create-space window `D`, picked uniformly (whole ms) per window when LEFT/RIGHT is called |
| `getSetMs` per start call | paint 1200–2500, left corner 1000–2300, right corner 1040–2300, catch 440–1100 | Time from the start of the start call to the first LEFT/RIGHT. Wide on purpose (about 300 ms wider on each side than before), so the first call can't be anticipated. Each minimum is at least the start call's estimated length at `baseRate` + `minGapMs` (paint 840, left corner 1000, right corner 1040, catch 440 ms), which is why the right corner and catch minimums are slightly higher |
| `shotBufferMs` | 0 | SHOT must finish being spoken this long before `D` ends |
| `nopeGapMinMs` / `nopeGapMaxMs` | 150 / 400 | Silence from the end of SHOT to the start of NOPE |
| `afterNopeGapMinMs` / `afterNopeGapMaxMs` | 200 / 400 | Silence from the end of NOPE to the next LEFT/RIGHT |
| `resetPauseMs` | 1000 | Pause after the last window ends before the next start call (separate from the Drive reset pause) |
| `maxCutOffsPerWindow` | 2 | Cap on CUT OFFs per window (0–5) |
| `maxNopesPerRep` | 1 | Cap on NOPEs per rep (0–3) |
| speech settings | shared | `baseRate`, `maxRate`, `minGapMs` and `speechLeadMs` are the same settings as Drive |

**Get-set clamp.** The planner uses `max(sampled get-set, start call length at baseRate + minGapMs)`, so the first LEFT/RIGHT can never overlap the start call. The default minimums already respect it (e.g. CATCH 440 ms = 400 / 1.25 + 120), so it only acts when you lower a minimum, slow the base rate, raise the min gap, or the voice turns out slower than estimated (learned lengths). This is a silent clamp, not a validation error.

The start call and NOPE are spoken at `baseRate`. Within a window, every call uses the window's one rate, computed exactly like a drive's: with `avail = D - shotBufferMs`, `gaps = (n - 1) * minGapMs` and `S` the sum of the lengths at rate 1.0, `rate = max(baseRate, S / (avail - gaps))`, and the window fits only if that is ≤ `maxRate`.

### Planning a Shooters rep

`planShootersRep` builds a rep plan:

1. Pick a start call by `startWeights` and place it at 0.
2. Sample the get-set time, apply the clamp, and start window 1 there.
3. **Plan the window** (feasibility-aware, no retries): pick `D`; pick LEFT/RIGHT by `afterStartWeights` (or `afterNopeWeights` after a NOPE) among the directions where direction + SHOT fits; then add CUT OFFs one at a time. A CUT OFF is offered only if the cap allows it and the path so far plus the CUT OFF plus the closing SHOT still fits at `maxRate`. Then close with SHOT.
4. **Schedule the window** like a drive: LEFT/RIGHT at the window start, SHOT anchored to end at `D - shotBufferMs`, and any CUT OFFs spaced evenly between them (every gap ≥ `minGapMs`, guaranteed by the fit check).
5. After the window's SHOT, pick END or NOPE by `afterShotWeights` (NOPE is removed once `maxNopesPerRep` is reached).
   - **END**: `endMs` is the end of this window, `restMs` is the Shooters reset pause.
   - **NOPE**: it starts a random nope gap after SHOT's end (`windowStart + D - shotBufferMs`), so it can never overlap or cut off SHOT. The next window starts a random after-nope gap after NOPE ends, with a fresh `D`. Go back to step 3.

```
0            get-set                  window 1 (D₁)                     nope gap       after-nope gap      window 2 (D₂)
│ SPRINT FROM … │ … │ LEFT │ gap │ CUT OFF │ gap │ SHOT ││ 150–400 │ NOPE │ 200–400 │ RIGHT │ gap │ SHOT ││ reset pause
```

`windows` has one entry per window (`startMs` = the LEFT/RIGHT call, `durMs` = `D`).

### Shooters validation

Pressing Start in the Shooters drill checks:

| Rule | Where the error shows |
|------|-----------------------|
| Base and max speech rate are between 0.5 and 2.0, base ≤ max; min gap and speech lead ≥ 0 | Speech |
| Min window is a whole number ≥ 600 ms and not greater than max | Under the window fields |
| Reset pause is a whole number ≥ 0 | Under the window fields |
| Each get-set min/max is a whole number ≥ 0 and min ≤ max | Advanced |
| Shot buffer, nope gap and after-nope gap values are whole numbers ≥ 0, and each min ≤ its max | Advanced |
| Max cut offs per window is a whole number 0–5; max nopes per rep is a whole number 0–3 | Advanced |
| Every weight is a number ≥ 0 and each of the five tables (including END + NOPE) adds up to more than 0 | Advanced |
| **The shortest window fits at `maxRate` in the min window** (cheapest LEFT/RIGHT + SHOT). The message names what it needs, e.g. with min gap 200: "The shortest window (LEFT + SHOT) needs at least 638 ms at max speech rate 1.6." With the defaults the shortest window needs 558 ms, so this can only fail after you change the speech settings or the voice turns out slow. | Under the window fields |

The Drive read time fields are not used or checked in this drill.

---

## Drill profiles and rep plans

Offense is built around two ideas, so that a future **mixed** drill (a random drill per rep) is a small addition:

**A drill profile** (`OffensePlanner.PROFILES.drive`, `PROFILES.shooters`) bundles one drill:

| Field | Drive | Shooters |
|-------|-------|----------|
| `phraseIds` | READ (shown READY), LEFT, RIGHT, CUT_OFF, LAY_UP, finishers | start calls, LEFT, RIGHT, CUT_OFF, SHOT, NOPE |
| `next` (state table) | `NEXT` | `SHOOTERS_NEXT` |
| `weightTables` | `WEIGHT_TABLES` | `SHOOTERS_WEIGHT_TABLES` (under `settings.shooters`) |
| `planRep(settings, durations, rng)` | `planDriveRep` | `planShootersRep` |
| `validate(settings, durations)` | `validateOffense` | `validateShooters` |
| `fitTable` / `selfTest` | `fitTable` / Drive checks | `shootersFitTable` / Shooters checks |

Phrases stay in one shared table keyed by id, so LEFT, RIGHT and CUT_OFF are shared, and so are their learned lengths.

**A rep plan** is the one shape the runner executes, whatever the drill:

```js
{
  calls:   [{ id, atMs, durMs, rate }],  // every spoken call, ms from the rep start
  windows: [{ startMs, durMs }],         // countdown windows the bar draws
  endMs,                                 // when the rep's last window ends
  restMs                                 // pause after endMs before the next rep
}
```

The runner ([Running a rep](#running-a-rep)) knows nothing about drills: it speaks `calls`, draws `windows` and starts the next rep after `endMs + restMs`. The countdown bar covers each window. A single bar over the whole rep would be a change to what the planner puts in `windows`, not a runner change.

A mixer is **not built yet**. It would be a third profile (e.g. `mixed`) whose `planRep` picks Drive or Shooters per rep and calls that profile's `planRep`, plus a third button in the drill switch. Its settings would need both drills' validations, and the Drive read time.

### The training log

Every logged Offense set is stored in `localStorage` under `reactionCaller.log`. The log is saved after **every** set, not only at the end of the session, so nothing is lost if Safari closes the tab mid-session.

```js
{
  version: 1,
  sessions: [{
    id,          // e.g. "slx8k2a3f9q1", made at Start
    startedAt,   // ISO time of Start
    endedAt,     // ISO time of the last saved set, then of End session
    sets: [{
      drill,             // "drive" | "shooters"
      level,             // 1-5 with Auto difficulty on, null with it off
      reps,              // reps completed (fewer than reps per set for a partial set)
      startedAt, endedAt,// ISO times: the set's first rep starts / the set ends
      made, attempted,   // whole numbers, made <= attempted; both null when skipped
      lostHandles,       // whole number or null
      missedCalls,       // whole number or null
      quality,           // "clean" | "rushed" | "off_balance" | null
      note,              // string (max 500) or null
      settingsSnapshot,  // copy of the timing settings this set ran with
      extra: {}          // for later drills to add their own fields
    }]
  }]
}
```

A session only appears in the log once its first set is saved. Partial sets are kept as normal sets with fewer `reps`; compare with `settingsSnapshot.repsPerSet` to spot them.

**`settingsSnapshot`** keeps old sets interpretable after you change settings. It holds, for both drills, the speech settings (`baseRate`, `maxRate`, `minGapMs`, `speechLeadMs`) and `repsPerSet`, plus:

- **Drive**: read time (`readMinMs` / `readMaxMs`), drive window, reset pause, finisher buffer, both caps and the three weight tables;
- **Shooters**: the whole `shooters` settings object (window, get-set times, shot buffer, nope gaps, reset pause, caps and the five weight tables).

**Summaries** (pure helpers in `TrainingLog`):

| Helper | Returns |
|--------|---------|
| `setSuccess(set)` | `made / attempted`, or `null` when skipped or nothing was attempted |
| `setErrorRate(set)` | `(lostHandles + missedCalls) / reps`, or `null` when skipped |
| `summarizeSession(session)` | Totals (`sets`, `reps`, `made`, `attempted`, `lostHandles`, `missedCalls`), `makePct` (made / attempted over sets with shots logged), `errorsPerRep` (errors over the reps of sets with errors logged), and `cleanShare` (sets rated Clean / sets with any rating). Each rate is `null` when there is nothing to count |

**Versioning and safety.** The log carries a schema `version`. On load:

| Stored text | What happens |
|-------------|--------------|
| nothing | A new log is started |
| a version 1 log | It is used and appended to |
| broken JSON, not a log, or an unknown version | A new empty log is started **alongside** it. The stored text is not touched until the first set is saved; then it is first copied, unchanged, to `reactionCaller.log.backup.<time>` and read back. Only if that copy succeeded is the new log written to `reactionCaller.log` |
| a newer version (e.g. 2) | The same: kept as a backup, never deleted or overwritten |

If the backup can't be written (storage full), the log is not saved at all, so the old data is never lost; the rest screen then says the set couldn't be saved.

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
  readMinMs: 800, readMaxMs: 3500,   // provisional
  phrases: { READ: { display: "READY", spoken: "ready", estMs: 350 }, …, SHOT: { … }, NOPE: { … } },

  // Shooters only drill (speech settings above are shared)
  shooters: {
    windowMinMs: 1000, windowMaxMs: 1800,
    getSetMs: { SPRINT_FROM_PAINT: { minMs: 1500, maxMs: 2200 }, …, CATCH: { minMs: 400, maxMs: 800 } },
    shotBufferMs: 0,
    nopeGapMinMs: 150, nopeGapMaxMs: 400,
    afterNopeGapMinMs: 200, afterNopeGapMaxMs: 400,
    resetPauseMs: 1000,
    maxCutOffsPerWindow: 2, maxNopesPerRep: 1,
    startWeights: { … }, afterStartWeights: { … }, afterDirectionOrCutOffWeights: { … },
    afterShotWeights: { END: 65, NOPE: 35 }, afterNopeWeights: { … },
  },
};
```

- Values here are the **defaults** the start screen shows. Values you type into the start screen are saved and **override** these on that device. After changing a default in the file, clear the saved settings (`localStorage.removeItem("reactionCaller.settings")`) to see the new default in the form.
- The **phrase table** (`phrases`) is where you fix pronunciation (`spoken`), change on-screen text (`display`) or adjust the length estimates (`estMs`). Learned lengths (`reactionCaller.learnedMs`) override `estMs` per phrase. Delete that key to start learning from scratch after changing the voice or the spoken text.
- The Drive read time is `readMinMs` / `readMaxMs` (800 / 3500). Defense's Min/Max delay fields are separate (HTML defaults 1000 / 3000).
- The state tables (`NEXT` for Drive, `SHOOTERS_NEXT` for Shooters) and the finisher and start-call lists sit in the planner script. They are structure, not tuning.
- `OFFENSE_DEFAULTS.shooters` holds every Shooters-only number. The Shooters phrases (`SPRINT_FROM_…`, `CATCH`, `SHOT`, `NOPE`) are in the shared `phrases` table, where you also fix their pronunciation or estimates.

### `TRAINING_DEFAULTS`

Session structure lives in a second commented object in the same script (logging and progression settings will go here too):

```js
const TRAINING_DEFAULTS = {
  repsPerSet: 8,              // whole number 3-30
  plannedSets: 4,             // whole number 1-20; a target, not a hard stop
  sessionWarningMin: 45,      // provisional; 0 = off
  restSec: 60,                // provisional; rest countdown after a logged set, 0-600
  compareSessions: 5,         // session summary compares with this many earlier sessions
  trendSessions: 20,          // trend charts cover this many latest sessions per drill
  trendMinSessions: 3,        // fewer than this shows "Not enough data"
  backupReminderSessions: 10, // provisional; start-screen export reminder above this
  setDoneSpoken: "set done",  // spoken when a set ends

  // Adaptive difficulty: every value provisional
  startLevel: 3,
  levelMinAttempts: 5,
  levelUpSuccess: 0.80, levelUpMaxErrorRate: 0.10,
  levelDownSuccess: 0.50, levelDownErrorRate: 0.30,
  levels: {
    drive:    [{ driveMinMs: 2200, driveMaxMs: 2800, readMinMs: 2000, readMaxMs: 3500,
                 "afterDriveOrCutOffWeights.CUT_OFF": 10, "afterDriveOrCutOffWeights.LAY_UP": 10 }, …],
    shooters: [{ "shooters.windowMinMs": 1600, …, "shooters.afterShotWeights.END": 85 }, …],
  },
};
```

Like `OFFENSE_DEFAULTS`, these are the defaults the Session group shows, and saved values override them. Thresholds marked `// provisional` are heuristics that still need real-world tuning.

Rules of thumb:

- **Drives feel rushed or words sound sped up**: raise `driveMaxMs`/`driveMinMs`, lower `minGapMs`, or lower `baseRate`.
- **Long drives (several CUT OFFs) never happen**: they don't fit. Check the fit table below and raise `driveMaxMs` or `maxRate`.
- **Calls lag behind the countdown on a phone**: the voice starts late. Set `speechLeadMs` (e.g. 100–200), or add a `finisherBufferMs` (Drive) / `shotBufferMs` (Shooters).
- **A word is mispronounced**: change its `spoken` text.
- **Shooters: not enough time to get to the spot**: raise that start call's `getSetMs` range.
- **Shooters: too many / too few NOPEs or CUT OFFs**: change `afterShotWeights` (END vs NOPE) or `afterDirectionOrCutOffWeights` (CUT OFF vs SHOT), or the caps.
- **Shooters: NOPE comes too soon after SHOT**: raise `nopeGapMinMs` / `nopeGapMaxMs`.

### Self-test (`?selftest=1`)

Open:

```
http://localhost:8080/index.html?selftest=1
```

Use `/index.html?selftest=1`, not `/?selftest=1`. The bundled `server.js` only maps a bare `/` to `index.html`, so `/?selftest=1` returns "Not found".

Instead of the app, the page runs a simulation of both offense planners (every drill profile's self-test) plus checks of the session helpers and the training log, and prints **PASS** / **FAIL** for each check to the console and to an on-page banner (green when everything passes, red otherwise). There are 63 checks in total: 18 Drive, 21 Shooters, 5 Session, 2 Defaults, 3 Levels, 7 Training log and 7 History.

**Drive.** It runs 10,000 drives at the **default** settings and 10,000 at **tight** settings (`D` fixed at 1400 ms, `maxRate` 2.0, `minGapMs` 40), and checks:

1. every drive starts with LEFT or RIGHT, chosen after READY;
2. every transition is in the state table, and nothing comes after a finisher;
3. every drive ends with exactly one finisher, legal for the previous call (long after LEFT/RIGHT/CUT OFF, short after LAY UP);
4. cut-offs and lay-ups per drive are within their caps;
5. `D` is within the drive window, and the speech rate is between `baseRate` and `maxRate`;
6. every call lies within `[0, D - finisherBufferMs]`, calls never overlap, and gaps are at least `minGapMs`;
7. with loose timing (a 30-second window, 40,000 drives), the observed pick frequencies match the weights within 2 percentage points (counting only picks where every legal choice was available);
8. (rep wrapper) READY is at 0 at `baseRate`, the read time is within the default 800–3500 ms and spreads over the whole range (the shortest and longest of 10,000 read times are within 2% of the ends), and every drive call lies inside the rep's window.

**Shooters.** It runs 10,000 reps at the default settings and 10,000 at tight settings (`windowMinMs = windowMaxMs = 1000`, `maxRate` 2.0, `minGapMs` 40), and checks:

1. every rep starts with one of the four start calls, and the next call is LEFT or RIGHT;
2. every transition is in the shooters state table, and NOPE appears only directly after SHOT;
3. every window contains exactly one SHOT, as its last call, and the rep ends right after a window's SHOT (`endMs` = end of the last window);
4. CUT OFFs per window ≤ `maxCutOffsPerWindow`, NOPEs per rep ≤ `maxNopesPerRep`;
5. each window's `D` is in range and its one rate is between `baseRate` and `maxRate`; every call in a window lies within `[window start, window start + D - shotBufferMs]`, gaps are ≥ `minGapMs`, and SHOT ends exactly at `D - shotBufferMs`;
6. NOPE starts `nopeGapMinMs`–`nopeGapMaxMs` after SHOT ends (never before), and the next LEFT/RIGHT starts `afterNopeGapMinMs`–`afterNopeGapMaxMs` after NOPE ends;
7. the first LEFT/RIGHT starts at least start call length + `minGapMs` after the start call, and within the (clamped) get-set range;
8. the start call and NOPE are at `baseRate`, no two calls in the rep overlap, and `restMs` is the Shooters reset pause;
9. with loose timing (a 30-second window, `maxRate` 2.0, 40,000 reps), observed pick frequencies match all five weight tables within 2 percentage points (counting only picks where every legal choice was available).

**Session.** It checks the pure session helpers:

1. `TRAINING_DEFAULTS` passes `validateSession`;
2. `validateSession` rejects out-of-range, fractional and missing values (reps per set 2 / 31 / 8.5, planned sets 0 / 21 / 1.5, warning −1 / 2.5, rest −1 / 601 / 2.5, and NaN for each) and accepts the bounds (3, 30, 1, 20, warning 0, rest 0 and 600);
3. walking 6 sets (past the 4 planned) with 3, 8 and 30 reps per set, every set ends after exactly that many reps, and the label reads "SET s / 4 · REP r / n" at every rep;
4. `formatElapsed` gives mm:ss (e.g. 754000 ms → "12:34", 4503000 ms → "75:03", negative → "00:00");
5. the fatigue warning is due at and after 45 min but not 1 ms before, never when set to 0, and its text starts with "45 min: decision quality".

**Defaults.** It checks:

1. the `READ` phrase is shown as READY and spoken "ready"; `migrateLearned` drops a stored `READ` length on the first load but keeps other phrases, records `read-to-ready`, sets the marker even when nothing was stored, and doesn't drop a re-learned value on later loads;
2. every default Shooters get-set minimum is at least the start call's estimated length at `baseRate` + `minGapMs`, every get-set range is at least 600 ms wide, and the Drive read time range is at least 2000 ms wide.

**Levels.** It checks:

1. both drills have exactly 5 levels that set the same settings, every path exists in `OFFENSE_DEFAULTS`, every level passes the drill's validation (including the shortest-drive / shortest-window fit), plans 500 reps without error, and no level has a longer window than the one below it;
2. `levelDecision` / `nextLevel`: up at 8/10 with 0.1 errors per rep and exactly at both thresholds (4/5, 1 error in 10 reps); hold at 79% success, at error rate 0.11, and at 50% with 0.29; down at 49% and at error rate 0.30; clamped at 5 and 1; hold with only 4 attempts, for a skipped set and when errors weren't logged; a partial set with 5 attempts counts;
3. `applyLevel` sets only the level's settings without changing its input (e.g. Shooters Level 4: window 1050, NOPE 40, SHOT 60; Drive Level 1: read 2000, CUT OFF 10, finishers still 20); `normalizeLevels` replaces missing, fractional or out-of-range levels with the start level; `progressLabel` adds " · LVL 3" only when a level is given; `levelMessage` reads "Level 3 → 4: nice, timing gets tighter" and "Holding at Level 3".

**Training log.** It checks `TrainingLog`:

1. valid sets pass `validateSet`: a full set, a skipped set (all outcomes `null`), a note, made = attempted, 0 of 0, every rating, both drills;
2. `validateSet` rejects made > attempted, negative, fractional, NaN and string counts, made without attempted, unknown or wrongly cased ratings ("great", "Clean"), an unknown drill, 0 reps, a note over 500 characters, a missing `extra`, snapshot or end time;
3. the math: `setSuccess` (5/8, and `null` when skipped or 0 attempted), `setErrorRate` (3 errors in 6 reps = 0.5, `null` when skipped), and `summarizeSession` on a 4-set session with a skipped and a partial set (28 reps, 10/20 made = 50%, 4 errors over 20 logged reps = 0.2 per rep, 2 of 3 rated sets clean), plus an empty session (all rates `null`);
4. `snapshotSettings` holds the drill's own windows, read or get-set times, weights, caps and speech settings (and nothing from the other drill), as a deep copy that later setting changes don't affect;
5. `upsertSession` appends a new session, replaces one with the same id, and doesn't change the log it was given;
6. `parseLog` reads a version 1 log; treats missing or empty text as a new log; and for a newer version (2, 99), a missing or string version, a non-array `sessions`, invalid JSON, `null`, an array, a number or a string returns a new empty log plus the original text to keep, without throwing;
7. with a fake store: opening a version 2 log doesn't change it; the first save copies it byte-for-byte to `reactionCaller.log.backup.<time>` and then writes the new log; a second save makes no new backup; when the backup can't be written, the broken log is left untouched and the save reports failure; a valid log keeps its sessions across reopen and save.

**History.** It checks the summary, trend, merge and backup helpers in `TrainingLog`:

1. `summarizeByDrill` splits a mixed session by drill (in play order), with correct totals, lost and missed per 10 reps and clean share; `sessionLengthMs` gives 32:10 for a 32 min 10 s session and `null` without an end time;
2. `compareWithPrevious` averages only the **previous 5** sessions of the **same** drill (not later sessions, the other drill or the session itself), and `comparisonText` reads exactly "Make % 62 (avg 50). Lost handles 1.2 per 10 reps (avg 5.0)"; with no history it says "No earlier sessions to compare with yet"; with fewer than 5 earlier sessions it averages those; a drill not played today gives "Nothing logged to compare.";
3. `trendSeries` returns the last 20 sessions of a drill, oldest first, ignoring the other drill; `trendGeometry` places the first and last points at the plot edges (a single point in the middle), 100% at the top and 0% at the bottom, scales lost handles to a rounded-up axis maximum (at least 2), and leaves out missing values;
4. `mergeLogs` adds new sessions, skips exact copies, keeps conflicting sessions unless asked to replace them, never duplicates an id (even when the file repeats one), doesn't change its input, and a second identical merge adds nothing;
5. `parseImport` accepts an exported log, skips invalid sessions (and counts them), rejects broken JSON, arrays, logs without a version, newer versions (with a "newer version" message) and string versions; `deleteSession` removes only that session without changing its input;
6. `csvField` / `setsToCsv`: commas, quotes (doubled), line breaks and leading spaces are quoted; `null` becomes an empty cell and 0 stays "0"; one row per set, oldest session first, with the header and a CRLF after every row;
7. `exportFileName` gives `reaction-caller-log-2026-01-05.json` for that local date; `unexportedCount` counts every session when never exported, and only sessions that ended after the last export otherwise.

It also prints a **Drive fit table**: for 0–3 cut-offs and each finisher, the minimum drive window needed at `maxRate`, and whether it fits at `driveMaxMs`. With the defaults (`maxRate` 1.6, `minGapMs` 120, buffer 0, `driveMaxMs` 2000):

| Cut-offs | LAY UP LEFT/RIGHT SIDE | LAY UP CENTER SIDE | LEFT/RIGHT SIDE (after LAY UP) | CENTER SIDE (after LAY UP) |
|---|---|---|---|---|
| 0 | 964 ms ✓ | 1027 ms ✓ | 1147 ms ✓ | 1209 ms ✓ |
| 1 | 1365 ms ✓ | 1428 ms ✓ | 1548 ms ✓ | 1610 ms ✓ |
| 2 | 1767 ms ✓ | 1829 ms ✓ | 1949 ms ✓ | 2012 ms ✗ |
| 3 | 2168 ms ✗ | 2230 ms ✗ | 2350 ms ✗ | 2413 ms ✗ |

So with the defaults, **a drive can contain at most 2 CUT OFFs**, and the 3-cut-off cap never comes into play. Raise `driveMaxMs` to about 2420 ms, or raise `maxRate`, to make 3-cut-off drives possible.

And a **Shooters fit table**: for 0 up to `maxCutOffsPerWindow` cut offs, the minimum window needed at `maxRate` and whether it fits at `windowMaxMs`. With the defaults (`maxRate` 1.6, `minGapMs` 120, shot buffer 0, `windowMaxMs` 1800):

| Cut offs | Sequence | Min window | Fits at 1800? |
|---|---|---|---|
| 0 | LEFT > SHOT | 558 ms | ✓ |
| 1 | LEFT > CUT OFF > SHOT | 959 ms | ✓ |
| 2 | LEFT > CUT OFF > CUT OFF > SHOT | 1360 ms | ✓ |

So every window size in the default 1000–1800 range can take 0 or 1 CUT OFF, and windows of 1360 ms or more can take 2.

Both fit tables depend only on the windows, the speech settings and the phrase lengths, so widening the read time and the get-set ranges didn't change them (re-run and confirmed).

The self-test uses `OFFENSE_DEFAULTS`, `TRAINING_DEFAULTS` and the seed estimates only. It ignores saved settings and learned lengths, and in self-test mode the normal app never starts.

You can run the same checks without a browser: the planner script has no DOM access, so it can be pulled out of `index.html` and run under Node with `OffensePlanner.runSelfTest(console.log, 10000, [TrainingLog.selfTest])` (the third argument adds the training log checks).

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
                     │   ├─ Game screen: mode label, set/rep, clock,      │
                     │   │    word, countdown, Stop                       │
                     │   ├─ Set log screen: steppers, rating, note, save  │
                     │   ├─ Rest screen: countdown, summary, Next set     │
                     │   ├─ Script 1: OffensePlanner (pure functions)     │
                     │   │    OFFENSE_DEFAULTS, TRAINING_DEFAULTS, state  │
                     │   │    tables, fit/plan, validation, learning      │
                     │   │    math, session helpers, drill profiles,      │
                     │   │    self-test                                   │
                     │   │  + TrainingLog (pure): set validation,         │
                     │   │    snapshots, summaries, versioned load/save   │
                     │   ├─ Script 2: the app                             │
                     │   │    speech, Defense mode, Offense rep and set   │
                     │   │    runner, set log form, rest, settings form,  │
                     │   │    localStorage                                │
                     │   └─ Script 3: ?selftest=1 page (inactive normally)│
                     └────────────────────────────────────────────────────┘
```

All logic runs **in the browser**. The server only delivers files and has no game state, API or database.

The planner is kept pure on purpose: its functions take settings, spoken lengths and an injectable `rng` (default `Math.random`) and return plain data. They never touch the DOM, timers or speech. That is what lets the self-test simulate tens of thousands of drives and reps in under a second, using exactly the code the game uses. Each drill is a profile whose `planRep` returns a rep plan, and the runner in Script 2 only executes rep plans (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)). `TrainingLog` follows the same rule: it never touches `localStorage` itself, but reads and writes through a store object (`{ get, set }`) that the app passes in and the self-test fakes.

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
| `--text` | `#f2f3f5` | Main text, READY |
| `--muted` | `#9aa1ab` | Subtitle, labels, mode label, countdown readout |

The app is dark-themed only. Global rules remove the tap highlight, disable pull-to-refresh (`overscroll-behavior: none`) and stop long-press text selection. Sizes use `clamp()` so the layout scales from 320 px phones to desktops without media queries.

Notable pieces:

- **`.segmented`**: the Defense | Offense switch and the Drive | Shooters only switch. The selected button has `aria-pressed="true"` and a lighter background. Inside a panel (the drill switch) the track uses the page background and tighter padding.
- **`.panel`**: rounded settings panels. `.panel-section` groups one drill's settings, `.range-row` puts two fields side by side, and `.field-grid` lays out Advanced fields and weights in two columns.
- **`details.advanced`**: the collapsible Advanced and Speech sections (native `<details>` / `<summary>`).
- **`#word`**: the called word, `clamp(3rem, 16vw, 6rem)`, weight 800, uppercase. It is invisible by default (opacity 0, scale 0.85). Adding `.show` fades and grows it in over 120 ms. **`#word.long`** (over 7 characters) drops to `clamp(2rem, 10vw, 3.75rem)`, centers and allows wrapping. **`#word.xlong`** (over 18 characters, i.e. "SPRINT FROM LEFT/RIGHT CORNER") drops further to `clamp(1.6rem, 8vw, 3rem)`, which puts it on two lines at 320 px.
- **`.stepper`**: a number input between − and + buttons, each at least 48 px tall, for fields filled in by hand (the Session group).
- **`.game-header`**, **`.session-progress`**, **`.session-clock`**, **`.session-banner`**: the game screen header (mode label, the muted "SET · REP" line and the mm:ss clock in its top-right corner) and the fatigue banner above it (panel background with a yellow left border).
- **Set log**: `.log-row` puts a label (with a muted `.hint`) and a 56 px stepper on one row, wrapping to two lines on narrow screens; `.segmented.choice` is the 52 px rating row; the note is a `textarea` (16 px text so iPhone doesn't zoom). `#saveRestBtn` is the big blue primary button, `#saveEndBtn` grey, and `.log-minor` holds the outlined **Skip logging** and red **Discard** buttons. Inputs and the textarea re-enable text selection, which the page otherwise turns off.
- **Rest**: `.rest-count` is the huge mm:ss countdown. **`#nextSetBtn`** / **`#endSessionBtn`**: its big blue button (at least 80 px tall, shown when the rest is over) and grey secondary button.
- **Adaptive difficulty**: `.toggle-row` / `.toggle-btn` (the 88 × 48 px On/Off button, blue when on), `.level-row` with a `.small-btn` (Reset level), `.level-locked` (a field set by a level, dimmed) with its `.level-note`, and `.level-line` (the rest-screen level message).
- **Summary and history**: `.stack` stacks cards; `.drill-card` with a `.stat-grid` (a two-column `<dl>`) and `.compare-line`; `.chart` styles the inline SVG (`.axis`, `.tick`, solid `.line-make` in the accent blue, dashed `.line-lost` in orange, dots and axis titles in the same colors) and `.legend`; `.history-item` is a session row (a full-width button plus its `.history-detail` of `.set-line`s); `.confirm` is the red-bordered confirmation box; `.secondary-btn` (grey, 52 px), `.danger-btn` (red) and `.button-row` (side-by-side buttons); `.reminder` is the start-screen export reminder (yellow left border, like the fatigue banner).
- **`.countdown`**: the track and fill bar plus a tabular-number readout. The fill shrinks via `transform: scaleX(remaining / D)`. `.idle` hides it without changing the layout.
- Word color classes: `.word-left`, `.word-right`, `.word-up`, `.word-back` (Defense), `.word-read`, `.word-center`, `.word-cut`, `.word-layup` (Drive; LEFT/RIGHT variants reuse the Defense blue and green) and `.word-sprint`, `.word-catch`, `.word-shot`, `.word-nope` (Shooters).

### Markup

- **Start screen**: mode switch, title, subtitle (changes with the mode and drill), Defense's Min/Max delay panel (`#rangePanel`, hidden in Offense), the offense panel and **Start**. The offense panel holds the drill switch, `#levelSettings` (the Auto difficulty toggle `#autoLevelBtn`, each drill's level with a Reset level button, and `#levelStatus`), `#driveSettings` (read time and drive window fields plus Advanced), `#shootersSettings` (window fields, reset pause, Advanced), the shared `#sessionSettings` group (stepper inputs with `data-training` keys into `TRAINING_DEFAULTS`) and the shared `#speech` group. The weight inputs and the Shooters get-set inputs are generated from `OFFENSE_DEFAULTS` at load, so the form always matches the tables in code.
- **Game screen**: fatigue banner (Offense, hidden until due), mode label (`DEFENSE`, `OFFENSE · DRIVE` or `OFFENSE · SHOOTERS`), set/rep line and session clock (Offense only), word stage, countdown (Offense only) and **Stop**.
- **Set log screen** (`#logScreen`, Offense only): drill label, set title, the four stepper rows, the rating buttons, the collapsed note, an error line and the save / skip / discard buttons.
- **Rest screen** (`#restScreen`, Offense only): drill label, countdown, session summary, save status, the level line (`#restLevel`, Auto difficulty only), **Next set** (hidden until the rest is over) and **End session**.
- **Summary screen** (`#summaryScreen`): session length, one card per drill (`#summaryDrills`) and **Done**.
- **History screen** (`#historyScreen`): trend cards (`#historyTrends`), the session list (`#historyList`), the backup panel (last export, export / import buttons, a hidden file input, the backup text box and the import confirmation) and **Back**. The start screen also has the **History** button and the `#backupReminder` line.

All six screens are always in the DOM, and the `.hidden` class switches between them.

### Script 1: `OffensePlanner`

A pure module (an IIFE assigned to `const OffensePlanner`). It contains:

| Export | Purpose |
|--------|---------|
| `OFFENSE_DEFAULTS` | All tunable offense numbers (with the `shooters` section) and the shared phrase table |
| `NEXT`, `FINISHERS`, `LONG_FINISHERS`, `SHORT_FINISHERS`, `WEIGHT_TABLES` | The Drive state machine |
| `START_CALLS`, `SHOOTERS_NEXT`, `SHOOTERS_WEIGHT_TABLES` | The Shooters state machine |
| `PROFILES` | The drill profiles `drive` and `shooters` (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)) |
| `cloneSettings(s)` | Deep copy of a settings object |
| `durationsFor(s, learned)` | Per-phrase length at rate 1.0: learned value if present, else `estMs` |
| `fitRate(ids, D, s, dur)` | The one speech rate a drive sequence needs in window `D`, or `null` if it can't fit |
| `minWindowFor(ids, s, dur)` | Smallest drive window a sequence fits in at `maxRate` |
| `planDrive(s, dur, rng, onPick)` | Builds one drive plan `{ D, rate, calls }` |
| `planDriveRep(s, dur, rng, onPick)` | Wraps READY, the read time and a drive into a rep plan |
| `migrateLearned(learned, done)` | Applies one-time learned-length migrations not yet in `done` (currently `read-to-ready`, which drops `READ`); returns `{ learned, done, changed }` |
| `planShootersRep(s, dur, rng, onPick)` | Builds one Shooters rep plan |
| `validateOffense(s, dur)` / `validateShooters(s, dur)` | Setting checks per drill; return `null` or `{ field, message }` |
| `learnDuration(current, measured, rate, s)` | One learning step, or `null` for an outlier |
| `fitTable(s, dur)` / `shootersFitTable(s, dur)` | Rows for the fit tables |
| `TRAINING_DEFAULTS` | Session structure: reps per set, planned sets, session time warning, rest between sets, the "set done" phrase |
| `validateSession(t)` | Session settings check; returns `null` or `{ field: "session", message }` |
| `newSession()` / `beginRep(p)` / `isSetComplete(p, t)` / `beginSet(p)` | The set and rep counter. Progress is `{ set, rep }` (current set from 1, reps started in it) |
| `progressLabel(p, t, level)` | "SET 2 / 4 · REP 5 / 8", plus " · LVL 3" when `level` is given |
| `LEVEL_COUNT`, `levelPaths(drill, t)`, `applyLevel(s, drill, level, t)` | 5; the settings paths a drill's levels set; a copy of the settings with a level applied |
| `normalizeLevels(stored, t)` | Stored levels → `{ drive, shooters }`, each 1–5 (else `startLevel`) |
| `levelDecision(level, set, cfg)` / `nextLevel(level, set, cfg)` | The adjustment rule: `{ level, change }` (`up`, `down`, `hold`, `atTop`, `atBottom`, `tooFew`, `skipped`) / just the level |
| `levelMessage(from, decision, cfg)` | The rest-screen line |
| `formatElapsed(ms)` | Session clock text, mm:ss |
| `sessionWarningDue(elapsedMs, t)` / `sessionWarningText(t)` | When the fatigue banner is due, and its text |
| `runSelfTest(log, reps)` | The simulation (every profile's self-test, then the session checks); returns `{ passed, results, fitTable, fitTables: { drive, shooters } }` |

`runSelfTest(log, reps, extraSuites)` also runs each function in `extraSuites` as `suite(check)`; the self-test page passes `[TrainingLog.selfTest]`.

The same script also defines **`TrainingLog`**, a second pure module (an IIFE assigned to `const TrainingLog`):

| Export | Purpose |
|--------|---------|
| `LOG_VERSION`, `LOG_KEY`, `BACKUP_PREFIX` | Schema version 1, `reactionCaller.log`, `reactionCaller.log.backup.` |
| `QUALITIES`, `NOTE_MAX` | `["clean", "rushed", "off_balance"]`, 500 |
| `emptyLog()` | `{ version: 1, sessions: [] }` |
| `validateSet(set)` | `null` or `{ field, message }` |
| `snapshotSettings(s)` | The drill's timing settings, deep-copied |
| `upsertSession(log, session)` | A new log with the session added or replaced by id |
| `setSuccess`, `setErrorRate`, `summarizeSession` | Summaries (see [The training log](#the-training-log)) |
| `summarizeSets(sets)` | The same totals for any list of sets, plus `lostPer10` and `missedPer10` |
| `setsOfDrill`, `sessionDrills`, `summarizeByDrill`, `sessionLengthMs` | Per-drill views of a session, and its length in ms |
| `compareWithPrevious(log, session, drill, n)` / `comparisonText(cmp)` | Today vs the mean of the previous `n` sessions of the drill, and its one-line text |
| `trendSeries(log, drill, n)` / `trendGeometry(series, box)` | The last `n` sessions' make % and lost handles per 10 reps, and their chart coordinates |
| `deleteSession(log, id)` | A new log without that session |
| `parseImport(text)` / `mergeLogs(current, incoming, replaceConflicts)` | Read a backup; merge by session id (`{ log, added, identical, conflicts }`) |
| `csvField(v)` / `setsToCsv(log)` | CSV export of every set |
| `exportFileName(date, base, ext)` / `unexportedCount(log, lastExportAt)` | Backup file names; sessions not yet exported |
| `parseLog(raw)` | `{ status: "empty" \| "ok" \| "newer" \| "corrupt", log, keepRaw }`; never throws |
| `openLog(store)` / `saveLog(state, store, nowMs)` | Load from, and save to, an injected `{ get, set }` store, backing up unreadable text first; `saveLog` returns `{ state, saved }` |
| `selfTest(check)` | The training log checks |

Internally, `fitRateIn` / `minWindowIn` / `scheduleCalls` take the end buffer as a parameter, so a drive window (finisher buffer) and a Shooters window (shot buffer) use the same math.

### Script 2: the app

Wrapped in an IIFE, so nothing leaks into the global scope. If `?selftest=1` is present it returns immediately.

- **Shared helpers**: `storageGet` / `storageSet` (try/catch around `localStorage`), voice loading and `pickVoice()` (first English voice, else the first voice, else the browser default), `speak(text, { rate, cancel })`, `primeSpeech()`, `validateRange()`, `randomDelay()` and `showWord(text, className)`.
  - `speak` cancels before speaking unless `cancel: false` is passed. Defense uses the default (cancel, rate 1), and Offense passes `cancel: false` and the drive's rate.
  - `primeSpeech` speaks a silent blank utterance inside the Start tap. iPhone Safari only allows speech that starts from a user gesture, and this unlocks it for the timer-driven calls that follow.
  - `showWord` sets the text and classes, removes `.show`, forces a reflow (`void wordEl.offsetWidth`) and adds `.show` back. The reflow makes the fade-in replay reliably even when the same call (e.g. CUT OFF) repeats.
- **Modes**: each mode is an object with `start(settings)` and `stop()`. `MODES` maps `defense` / `offense` to the mode object plus its labels. `DRILLS` maps `drive` / `shooters` to the offense game label and subtitle.
  - `defenseMode` chains `setTimeout` calls with a fresh random delay each time: pick a word, show it, speak it, schedule the next.
  - `offenseMode` runs rep plans from the selected profile, as in [Running a rep](#running-a-rep), grouped into sets. `startRep()` counts the rep, plans and schedules it, and schedules either the next rep (counting `repsCompleted` at each rep's `endMs`) or `finishSet()` (says "set done", opens the set log). `haltSet()` clears the timers and countdown for Stop mid-set but keeps the session clock; `stop()` also stops the clock. `nextSet()` starts the next set from the **Next set** tap and records the set's start time. `startClock()` updates the session clock and shows the fatigue banner once. `runCountdown()` drains the bar for one window. `later(fn, ms)` wraps every timer and records its id so `stop()` can clear them all. `say(id, rate)` shows and speaks a phrase and attaches the measuring handlers. `runId` lets late `onend` events from a stopped run be ignored.
- **Settings form**: inputs carry `data-setting` paths into `OFFENSE_DEFAULTS` (e.g. `shooters.windowMinMs`, `shooters.getSetMs.CATCH.minMs`), read and written with `getPath` / `setPath`. Session inputs carry `data-training` keys into `TRAINING_DEFAULTS`, read by `readTrainingSettings()` into `settings.training`. `wireSteppers(root)` makes each − / + button inside `root` (the offense panel and the set log) step its input by the input's `step`, clamped to its `min` / `max`, and fires `input` so the value is handled like typing. `buildWeightTables()` (once per drill), `buildGetSetFields()`, `fillOffenseDefaults()`, `readOffenseSettings()` (empty fields become `NaN` so validation catches them), `saveSettings()` / `loadSettings()`.
- **`updateView`, `selectMode`, `selectDrill`**: show the right panels, labels and subtitle for the mode and drill.
- **`startGame` / `stopGame`**: validate (the Min/Max fields only for Defense and Drive, then the drill's `validate`, then `validateSession`; `showError` puts the message in the right place via `ERROR_TARGETS`), prime speech, switch screens, show the session clock and set/rep line only in Offense, start a new session record (Offense), start or stop the active mode, and cancel speech. `stopGame` ends the session and writes its end time to the log if it has saved sets. `stopPressed` (the Stop button) halts the set and opens the partial-set log instead when an Offense set has at least one finished rep.
- **Adaptive difficulty**: `levels` (from `reactionCaller.levels` via `normalizeLevels`) and `autoLevel` hold the state. `updateLevelView()` shows the levels and toggle, and with Auto on calls `lockInput()` on every setting or weight input whose path a level sets (it keeps the manual value in `data-manual-value`, makes the input read-only and adds the "set by Level N" note); `unlockInput()` restores it. `manualValue(input)` is what `saveSettings()` and `readOffenseSettings()` use, so level values are never saved as your own. `startGame` keeps the manual settings in `runBaseSettings` and applies the level on top (`settings.level`, or `null` with Auto off). After a set is committed, `adjustLevel(set)` runs `levelDecision`, stores the new level and prepares the rest-screen line; `applyCurrentLevel()` (in the **Next set** tap) re-applies the level to `runBaseSettings` for the next set, keeping the spoken lengths validated at Start (if those settings don't validate, the previous ones are kept).
- **Summary, history and backup**: `showSummary(session)` builds one `drillCard` per drill from `summarizeByDrill` and `compareWithPrevious`. `openHistory()` renders `renderTrends()` (one `trendChart(series)` inline SVG per drill, from `trendGeometry`), `renderSessionList()` (rows that expand into `sessionDetail` with the delete confirmation) and `renderLastExport()`. `exportJson()` / `exportCsv()` use `downloadText()` (a `Blob` and an `<a download>` click), falling back to `showBackupText()`. `importText()` parses with `parseImport`, previews with `mergeLogs` and asks via the confirmation box when sessions conflict; `applyImport(replace)` merges and saves. `saveTrainingLog(log)` saves any changed log; `updateBackupReminder()` runs on load and on every return to the start screen (`showStart()`).
- **Set log and rest**: `trainingLog` is the state from `TrainingLog.openLog(logStore)` (`logStore` wraps `storageGet` / `storageSet`). `openSetLog(partial)` fills the form for the set that just ended, with its settings snapshot. `commitSet()` validates with `TrainingLog.validateSet`, adds the set to the session and saves the whole log (`persistSession` → `upsertSession` + `saveTrainingLog` → `saveLog`). `showRest()` runs the rest countdown and shows `summarizeSession`; `startNextSet()` primes speech and starts the next set.

### Script 3: self-test page

Runs only with `?selftest=1`. It hides the app, calls `OffensePlanner.runSelfTest`, logs the results and both fit tables (`console.table`) and renders them in a `<pre>` banner.

---

## Browser APIs used

| API | Used for | Notes |
|-----|----------|-------|
| **Web Speech API** (`speechSynthesis`, `SpeechSynthesisUtterance`) | Speaking calls, measuring spoken length (`onstart` / `onend`) | Voices depend on the OS. iPhone needs a user gesture first, which is why the app primes speech in the Start tap. If speech is unavailable, the app still runs with visual calls only. |
| `performance.now()` | Drive clock for scheduling and the countdown | |
| `requestAnimationFrame` | Countdown bar animation | |
| `localStorage` | Mode, settings, learned lengths, the training log and the last export date | Optional. Every access is guarded. |
| `URLSearchParams` | Detecting `?selftest=1` | |
| `Blob`, `URL.createObjectURL`, `<a download>` | Exporting the log (JSON) and sets (CSV) as files | If unavailable, the export is shown as text to copy |
| `File.text()` / `FileReader`, `<input type="file">` | Importing a JSON backup | Read locally; nothing is uploaded |
| `navigator.clipboard.writeText` | **Copy** in the backup text box | Falls back to `document.execCommand("copy")`, then to selecting the text |
| Inline SVG | Trend charts on the history screen | Drawn by hand, no chart library |
| CSS `env(safe-area-inset-*)`, `dvh`, `clamp()`, `<details>` | Notch-safe, responsive layout | Older browsers fall back to `vh`. |

---

## Known limitations and quirks

### Gameplay

- **Defense: the first call isn't immediate**, repeats are possible, and short delays clip speech (Defense always cancels before speaking, by design).
- **Offense: queued speech can lag.** Calls never clip, so if the voice is slower than planned (before it has learned real lengths, or with voice start-up delay), later calls queue behind earlier ones and are heard late. Learned lengths and `speechLeadMs` / `finisherBufferMs` reduce this.
- **Offense: 3-cut-off drives don't fit at the default timings.** See the fit table above.
- **Shooters: the countdown bar covers each create-space window, not the whole rep.** It is hidden during the start call and get-set time, and empty around a NOPE and during the reset pause.
- **No mixed drill yet.** Each Start runs either Drive or Shooters only. The code is structured for a mixer (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)), but it isn't built.
- **Shooters: the get-set time is not checked against how long the sprint really takes you.** Tune the `getSetMs` ranges to your court and speed.
- **Results are self-reported.** You count shots, lost handles and missed calls yourself and enter them after the set; there is no automatic scoring or reaction-time measurement.
- **The log lives in one browser, at one address.** Clearing site data (or Safari clearing it after weeks without a visit) deletes it, and `file://`, `http://localhost:8080` and `http://<LAN IP>:8080` each keep a separate log. Export regularly from **History**; importing a backup at a new address merges it in.
- **Trends are per drill and per session.** Make % and lost handles are drawn on two axes in one small chart; missed calls and clean share are only in the session summary and the session list.
- **Import can't undo.** Replacing conflicting sessions or deleting a session is permanent, unless you have an exported backup.
- **Next set waits for the rest to finish.** There is no way to cut the rest short except setting **Rest between sets** lower (0 = none).
- **Levels move one step per logged set**, based on that set alone (no averaging over several sets), and only in Offense with Auto difficulty on. Sets logged with it off have `level: null` and don't move the level.
- **Levels are validated with the estimated spoken lengths.** If your voice is much slower than estimated, a level's shortest window could fail at Start (the error says what it needs); mid-session, a level that doesn't fit is skipped and the previous settings are kept. Turning Auto difficulty off lets you set the windows by hand.
- **Planned sets is a target, not a limit.** After the last planned set the app still offers **Next set**; only you end the session. The fatigue warning likewise never stops the session.
- **Defense has no sets, reps or session clock.** It still runs until you press Stop.
- **No pause or resume.** Ending a session keeps its saved sets in the log, but the next Start begins a new session at set 1. A partial set you **Discard** is not saved.
- **A rep that was in progress when you pressed Stop isn't counted** in the partial set's reps.
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
| Window, read time or some weight fields are greyed out and won't change | Auto difficulty is on, so the level sets them ("set by Level N") | Turn **Auto difficulty** off to use your own values (they were kept) |
| The level never changes | Auto difficulty is off, sets are skipped, or sets have fewer than 5 shots attempted | Log made/attempted with at least 5 attempts (the rest screen says why it held) |
| Changed a default in code but the form still shows the old value | A saved value overrides it | Run `localStorage.removeItem("reactionCaller.settings")` on the app's page |
| Defense words sound cut off | Delay shorter than the spoken word | Raise the **Min delay** |
| "The shortest window (LEFT + SHOT) needs at least N ms…" | Shooters min window too small for LEFT/RIGHT + SHOT at the max rate (possibly because learned lengths grew) | Raise the **Min window** to N, raise the max speech rate, or lower the min gap |
| Offense: the Min/Max delay fields disappeared | They are Defense only. Drive has its own **Min / Max read time** fields | Expected. Drive read time defaults to 800–3500 ms; a value you saved in the old shared fields stays with Defense |
| Shooters: two CUT OFFs in one window never happen | Two CUT OFFs need a 1360 ms window at the defaults, and short windows can't take them | Raise the **Min / Max window** or the max speech rate (check the Shooters fit table) |
| Shooters: a LEFT/RIGHT comes later than its get-set min | The get-set time is clamped to at least the start call's length + min gap (the defaults already respect this; it acts if you lower a min or the voice is slow) | Expected. Lower the min gap or raise the base rate if you want it sooner |
| Shooters: no NOPE ever | `afterShotWeights` NOPE is 0, or **Max nopes per rep** is 0 | Raise them in the Shooters Advanced section |
| Shooters: the bar shows "0.0 s" while NOPE is called | Between windows the bar sits empty by design | Expected. It drains again when the next LEFT/RIGHT is called |
| Settings saved before the Shooters drill or the Session group | They load as before. The new fields start at their defaults | Nothing to do |
| "Reps per set must be a whole number from 3 to 30." (or planned sets / session time warning) | A Session value is out of range or empty | Use the − / + steppers, which stay within range |
| Offense stopped calling after a few reps and shows the set log | The set has ended (Reps per set reached) | Log it and tap **Save & rest**, then **Next set** when the rest is over |
| "Couldn't save to this device. Storage may be blocked or full." | Private browsing, blocked site data or full storage | Training continues, but this set isn't kept. Allow site data for the app's address |
| Pressing Stop went straight to the start screen instead of the log | No rep of that set had finished yet, so there was nothing to log | Expected |
| History is empty on the phone, but sessions were logged | The app was opened at a different address (e.g. the computer's LAN IP changed), or Safari cleared site data | Open the old address if it still works, or import your latest JSON backup from **History** |
| Export does nothing / no file appears | The browser blocked or doesn't support downloads | Use **Backup as text** → **Copy**, and paste it into a note or a file |
| "This backup is from a newer version of the app" | The backup was made by a newer app version | Update `index.html`, then import |
| A `reactionCaller.log.backup.…` key appeared | The stored log couldn't be read (broken, or written by a newer version), so it was kept aside before a new log was started | Nothing is lost. The raw text is in that key |

---

## Ideas for future work

- A **mixed** offense drill that picks Drive or Shooters at random per rep (a third profile; see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)).
- An option for one countdown bar over the whole Shooters rep (a change to what the planner puts in `windows`).
- A "Reset to defaults" button and a way to view or clear learned lengths from the UI.
- Charts for missed calls and clean share, and a per-week view.
- Tune the level thresholds from real logs, e.g. adjust over the last two or three sets instead of one, and chart the level in History.
- An option to prevent the same Defense word twice in a row.
- Voice picker and a mute toggle (visual-only mode).
- Harden the server: serve only `index.html`, map `/?…` to `index.html`, use a `ROOT + path.sep` prefix check, and make the port configurable.
- Make it a PWA (manifest + service worker) so it can be installed to the home screen and work offline.
