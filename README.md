# Reaction Caller

**Reaction Caller** is a small, dependency-free web app for basketball reaction drills. A voice calls commands at random times, the same command appears in large color-coded letters, and the player reacts. It has two modes:

- **Defense mode**: after a random wait, the app calls one of **Left**, **Right**, **Up** or **Back**, again and again until you press **Stop**.
- **Offense mode** is **Call & Execute: move fluency and readiness under unpredictable timing.** The app dictates every move; you execute it cleanly and on time. Drive and Move Lab are not decision-making training: the call tells you what to do. **Read the D** is the exception: it trains the decision. It has three drills:
  - **Drive** simulates a ball-handler driving from the top of the key to the basket. The app calls **READY** (get in your stance, live dribble, wait for the call), then a drive direction (**LEFT** / **RIGHT**), then zero or more reactions to the defense (**CUT OFF**, **LAY UP**), and finally a **finisher** such as **LAY UP LEFT SIDE**. All of it happens inside a timed drive window shown as a countdown bar.
  - **Read the D** describes the defender instead of naming a move. Each rep calls his momentum (**CLOSING** / **SET** / **RETREATING**), his distance (**TIGHT** / **NO OPENING** / **SAGGING**) and his lead foot (**LEFT FOOT** / **RIGHT FOOT**), then **NOW**: you decide whether to drive (and which way), pull up or create space, and do it inside the decision window. See [Read the D](#offense-read-the-d-drill).
  - **Move Lab** trains your own moves: pick the moves you want to work on, and each rep calls **SPRINT FROM LEFT CORNER**, **SPRINT FROM RIGHT CORNER** or **CATCH**, then **LEFT** / **RIGHT**, then one or more of your moves (up to a max you set) and finally **SHOT**. You also log how many reps were clean. See [Move Lab](#offense-move-lab-drill).

  In every drill, calls are planned so that every spoken phrase fits inside its window and no call ever cuts off another. An Offense session is organized as **sets of reps**. After each set the app says "set done" and shows a quick big-button form where you log how the set went (shots made and attempted, lost handles, missed calls, how it felt). Every set is saved on the device as soon as you log it, then a rest countdown leads into the next set. Ending a session shows a summary compared with your recent sessions, and a **History** screen shows trends over weeks and lets you export and import the log as a backup. With **Auto difficulty** on, each drill has a level from 1 to 5 that sets its timing and moves up or down after each logged set, so the task stays hard but doable.

The app is meant to run on a phone (iPhone Safari is the main target) propped up nearby while you train. The words are big enough to read from a distance, and the voice means you don't have to look at all.

The app is plain HTML, CSS and JavaScript, split into files by feature (about 330 KB in all):

| Path | Purpose |
|------|---------|
| `index.html` | The markup of every screen, and the `<script>` tags in load order |
| `styles.css` | All styles (dark theme, CSS variables on `:root`) |
| `js/core/`, `js/log/` | Pure logic shared by every drill: timing math, levels, sessions, the training log and history |
| `js/drive/`, `js/move-lab/`, `js/read-the-d/` | One folder per drill: its pure logic, and (`*-ui.js`) its part of the app |
| `js/app/` | The app: speech, Defense mode, the runner, the forms and screens, and `main.js`, which starts everything |
| `js/selftest-page.js` | The `?selftest=1` page |
| `selftest-node.js` | Runs the self-test under Node (`node selftest-node.js`) |
| `server.js` | A tiny Node.js static file server so phones on your network can open the app |

There is no build step, no `package.json`, no framework and no third-party library. See [Project structure](#project-structure) for every file.

---

## Table of contents

1. [Quick start](#quick-start)
2. [How to use the app](#how-to-use-the-app)
   - [Choosing a mode](#choosing-a-mode)
   - [Defense mode](#defense-mode)
   - [Offense mode](#offense-mode)
   - [Offense: Drive drill](#offense-drive-drill)
   - [Offense: Read the D drill](#offense-read-the-d-drill)
   - [Offense: Move Lab drill](#offense-move-lab-drill)
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
4. [Read the D drill in depth](#read-the-d-drill-in-depth)
   - [Read the D vocabulary](#read-the-d-vocabulary)
   - [The rules (correctAction)](#the-rules-correctaction)
   - [Call order and the rep plan](#call-order-and-the-rep-plan)
   - [Sampling states](#sampling-states)
   - [Read the D levels](#read-the-d-levels)
   - [Read the D validation](#read-the-d-validation)
   - [Second read (Levels 4–5)](#second-read-levels-45)
   - [What three words can't capture](#what-three-words-cant-capture)
5. [Drill profiles and rep plans](#drill-profiles-and-rep-plans)
   - [The training log](#the-training-log)
6. [Tuning offense mode](#tuning-offense-mode)
7. [Project structure](#project-structure)
8. [Architecture overview](#architecture-overview)
9. [`server.js` in detail](#serverjs-in-detail)
10. [The code in detail](#the-code-in-detail)
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

The app uses plain scripts (no ES modules), so you can also open `index.html` straight from disk (`file://`), as long as the `js/` folder and `styles.css` sit next to it. The server mainly exists so that **another device** (your phone) can load the page from your computer. Settings are saved per address, so `file://` and `http://…:8080` keep separate saved settings.

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

Select **Offense** to see the offense panel. At its top is a **Drive | Read the D | Move Lab** switch (Drive is the default, and your choice is remembered). Below it is **Auto difficulty** (on by default) with each drill's current level and a **Reset level** button (see [adaptive difficulty](#offense-adaptive-difficulty)), then the settings for the selected drill, then the **Session** group (reps per set, planned sets, session time warning; see [sessions, sets and reps](#offense-sessions-sets-and-reps)), and at the bottom a collapsible **Speech (every drill)** group: base and max speech rate, minimum gap and speech lead. Every drill uses the same session and speech settings (Move Lab has its own reps per set).

| Drill | When to use it |
|-------|----------------|
| **Drive** | Attacking off the dribble: stay ready, drive on the call, counter, finish on the side called. |
| **Read the D** | Decision-making: read the defender from three calls and pick the right move yourself (drive left / right, pull up, create space). |
| **Move Lab** | Your own moves into a shot: sprint from a corner (or catch), go LEFT / RIGHT, then hit the moves you picked as they are called, until SHOT. |

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

Phrases longer than 7 characters (e.g. "LAY UP CENTER SIDE") use a smaller font and may wrap to two lines, so they stay readable on a 320 px-wide screen. Phrases longer than 18 characters (only the corner sprint calls of Move Lab) get one step smaller still. Short calls keep the huge font.

The countdown bar is visible only during the drive, from the LEFT/RIGHT call until the window `D` runs out. It drains from `D` to 0 with a one-decimal seconds readout ("1.6 s"). During the reset pause it sits empty at "0.0 s", and it is hidden while READY is up.

### Offense: Read the D drill

Read the D trains the **decision**, not the move. The voice describes what the defender is doing, in a fixed order, and nothing names the move: you combine the calls and decide whether to drive (to which side), pull up or create space. The rules behind the right answer, the call order, the levels and the caveats are in [Read the D drill in depth](#read-the-d-drill-in-depth).

**A rep** (Levels 1–3): **READY** (stance, live dribble) → a random read time → momentum → distance → lead foot → **NOW** → the decision window (countdown bar) to make the move and shoot → reset pause. From Level 3 a **HANDS UP / HANDS DOWN** call is mixed in at a random place; it never changes the answer. At Levels 4–5 the rep starts with **LIVE** (start dribbling) and the calls come 600–1500 ms later, mid-dribble, and in about half the reps the defender **reacts to your move**: 700–1200 ms after the first window, a second sequence (momentum, distance, lead foot, NOW) asks you to read again, with its own full decision window. See [Second read](#second-read-levels-45).

| Calls say | Calls | Color |
|---|---|---|
| His momentum | CLOSING, SET, RETREATING | Orange `#ff7a4f` |
| His distance | TIGHT, NO OPENING, SAGGING | Purple `#c47bff` |
| His lead foot | LEFT FOOT, RIGHT FOOT | Cyan `#45d6e0` |
| His hands (distractor) | HANDS UP, HANDS DOWN | Pink `#ff6bd6` |
| Go | NOW | A short yellow flash (yellow block fading to yellow text) |
| Lead-in | READY, LIVE | White |

The cue calls are spoken at the level's cue speech rate with the level's gap between them, and planned so they never overlap or clip.

**Settings** (shown when Read the D is selected):

- **Practice mode** (off by default; not set by levels): after each decision window, a short pause (Practice pause, 600 ms), then the voice says the correct action (shown big, e.g. **DRIVE LEFT** in blue, **DRIVE RIGHT** green, **PULL UP** yellow, **CREATE SPACE** white) and its why (spoken and shown as the line under it, e.g. "attack the closeout past his front foot"). Use it to learn the rules; the rep then rests as usual.
- **Cue speech rate** and **Decision window (ms)**, and under **Advanced** the **Hands call**, **Mid-dribble** and **Second read** toggles and the **Gap between cue calls**: with Auto difficulty on these six are set by the level (shown "set by Level N", the toggles greyed out); with it off your own values apply (defaults are the Level 3 values).
- **Advanced** also has the read time (800–3500 ms), the LIVE delay (600–1500 ms), the second read gap (700–1200 ms), the reset pause (1000 ms) and the practice pause.
- **Auto difficulty** shows **Read the D: Level 3** with its own **Reset level**, like Drive.

The on / off settings are toggle buttons (48 px tall) backed by hidden 0 / 1 inputs, so they are saved, validated and level-locked like any other field.

The game screen shows **OFFENSE · READ THE D**, the set, rep and level, and the session clock.

**Decision review.** The app knows every state it called and the right answer for it, so you only have to say which reps you got wrong, after the set. The set log form for Read the D starts with a **Decisions** list, above the shot counts: one row per decision of the set's finished reps, e.g.

> **Rep 3** CLOSING · TIGHT · LEFT FOOT
> DRIVE LEFT — attack the closeout past his front foot
> **✓ I did that**

Every row starts at ✓. Tap it (52 px button) to flip it to **✗ I did something else** and pick what you actually did: **Drive L**, **Drive R**, **Pull up**, **Create space** or **Froze** (52 px buttons, three per row). Picking the right action there counts as right. Tap ✗ again to set the row back to ✓, or **All correct** to reset every row. A flipped row without a pick stops the save ("Pick what you did for rep 3, or tap ✗ to set it back to ✓."). The rest of the form (shots made / attempted, lost handles, missed calls, rating, note) is as for every drill; **Skip logging** saves the decisions as not reviewed.

**Scoring** (pure, in `OffensePlanner`): `scoreDecisions(decisions)` gives the decision accuracy (right / reviewed), the right count per correct action, and the **most common miss**: the same situation with the same kind of wrong action (e.g. "sagging defender → you drove anyway", "closing defender → you drove the wrong way", "… → you froze"); ties go to the one that happened first.

**Rest screen.** After a reviewed set, one line for accuracy and one for the most common miss with its rule, phrased about the defender and the shot:

> **7/8 correct.**
> Missed: sagging defender → pull up, he gave you the shot.

With no misses only the first line shows.

**Summary and History.** The session card adds **Decisions right** (e.g. 22/26 · 85%), the per-action line (e.g. "Drive L 5/6 · Drive R 6/6 · Pull up 7/9 · Create space 4/5") and "Most common miss: …"; the comparison line starts with "Decisions 85% right (avg 78)". The trend chart adds a third line, **decisions right %** (dotted green, left axis), and each History set line shows "x/y decisions right".

**Auto difficulty** for Read the D uses decision accuracy and shot success (see [adaptive difficulty](#offense-adaptive-difficulty)).

### Offense: Move Lab drill

Move Lab is Call & Execute with your own moves. You pick the moves you want to work on, and every rep is a start call, a direction, then those moves until SHOT.

**Settings.** A **Moves** grid of the eight moves in `TRAINING_DEFAULTS.moves`: tap a move to pick it, tap again to drop it (picked moves are highlighted; at least one is needed). **Max moves per rep** (− / +, 1–6, default 3). Under **Advanced**: **Gap between moves** min / max (800 / 1500 ms, provisional), **Reset pause** (1000 ms), **Gap before first move** min / max (150 / 400 ms), the **get-set time** min / max after each start call (left corner 1000–2300, right corner 1040–2300, catch 440–1100 ms, provisional), and **Weights after a move** (Another move 50 / SHOT 50, provisional). In the Session group, **Reps per set (Move Lab)** (default 10, saved separately from the other drills). Auto difficulty is hidden: Move Lab has no levels (`level: null`). The picked moves are stored in `reactionCaller.moveLab` as `{ moveIds: [...] }` (a choice saved by the first version of Move Lab, `{ moveId, side }`, loads as that one move). Defaults: CROSSOVER and HESI.

| Move | Type | Spoken | est. ms at rate 1.0 |
|---|---|---|---|
| CROSSOVER | handle | crossover | 650 |
| BETWEEN THE LEGS | handle | between the legs | 850 |
| BEHIND THE BACK | handle | behind the back | 850 |
| HESI | handle | hesi | 450 |
| IN AND OUT | handle | in and out | 650 |
| SPIN | handle | spin | 350 |
| PULL UP | shot | pull up | 450 |
| STEP BACK | shot | step back | 550 |

Each move is also added to the shared phrase table, so learned lengths work for them. Moves are shown in cyan.

**Flow** (`planMoveLabRep`, pure, self-tested). One rep:

```
SPRINT FROM LEFT CORNER | SPRINT FROM RIGHT CORNER | CATCH     (equally likely)
  -> get-set time (getSetMs for that start call)
LEFT | RIGHT                                                    (50 / 50)
  -> gap before the first move (firstMoveGapMinMs..firstMoveGapMaxMs, 150-400 ms of silence)
MOVE                                                            (one of your picked moves, at random)
  -> gap between moves (moveGapMinMs..moveGapMaxMs of silence)
MOVE again (weight "Another move") or SHOT (weight SHOT)
  ... until SHOT. At Max moves per rep moves, SHOT always comes next.
SHOT  -> rep ends; reset pause, then the next start call
```

So a rep has 1 to Max moves; with the default 50 / 50 weights and a max of 3, half the reps have one move, a quarter two and a quarter three. The same move can be called twice in a row. Every call is spoken at the base rate, each one only after the previous one has finished, so calls never overlap. All of Move Lab's numbers, including the get-set times and the gap before the first move, are in `OFFENSE_DEFAULTS.moveLab` and under Move Lab › Advanced. (They used to be borrowed from the removed Shooters only drill; values you saved there carry over, because the inputs kept their ids.) The countdown bar drains from LEFT / RIGHT until SHOT has been spoken.

**Logging.** The set log adds **Clean reps** (0 to the reps in the set, default 0): every move in the rep controlled, on balance, eyes up. Shots made / attempted are always shown, since every rep ends in SHOT. `extra` stores `{ moveIds, cleanReps }` (the picked moves). The summary card adds a Clean reps line, and History lists the picked moves of each set.

**Earlier Move Lab sets.** The first version of Move Lab (one move on one side, a steady GO, and a mastery gate that "unlocked" moves) has been replaced. Its logged sets (`extra: { moveId, side, cleanReps }`) are still valid, still count in the Clean reps totals and show in History as before. Its manual unlock marks in `reactionCaller.moveUnlocks` are no longer read, but are left in storage untouched.

### Offense: sessions, sets and reps

Offense is organized like a training session in the gym:

| Term | Meaning |
|------|---------|
| **Rep** | One rep plan from the drill: one READY … finisher drive, or one Move Lab rep (start call through SHOT) |
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

The top shows the drill and what you are logging, e.g. **OFFENSE · DRIVE** / **Set 2 · 8 reps**, or **Partial set 2 · 5 of 8 reps** after Stop.

| Field | Default | Meaning |
|-------|---------|---------|
| **Shots made** | 0 | Shots or finishes you made. Can't go above attempted: the + button stops there, and lowering attempted pulls made down with it |
| **Shots attempted** | the reps in the set | Each rep ends in exactly one real shot or finish, so this is normally the rep count |
| **Lost handles** | 0 | Lost dribble, travel, or picked up the dribble early |
| **Missed or late calls** | 0 | Calls you didn't react to in time |
| **How did the set feel?** | none | One tap: **Clean**, **Rushed** or **Off-balance**. Optional; tap the selected one again to clear it |
| **Note** | empty | Optional free text (up to 500 characters), under a collapsed "Add a note" |

Buttons:

| Button | What it does |
|--------|--------------|
| **Save & rest** | Saves the set and shows the rest countdown (**Rest between sets**, default 60 s), the level line when Auto difficulty is on (e.g. "Level 3 → 4: nice, timing gets tighter"), and a summary of the session so far, e.g. "This session: 3 sets · 14/24 made (58%) · 0.21 errors per rep · 2 of 3 rated sets clean". When it reaches 00:00 a big **Next set** button appears. **End session** is available throughout |
| **Save & end session** | Saves the set, ends the session and shows the [session summary](#offense-session-summary) |
| **Skip logging** | Saves the set with every outcome field (made, attempted, lost handles, missed calls, rating, note) empty (`null`), and Read the D decisions as not reviewed, then rests like Save & rest |
| **Discard** | Only after Stop mid-set: drops the partial set without saving it and ends the session |

If a value is invalid (e.g. you typed made 9 with attempted 8, or left a field empty), the reason shows above the buttons and nothing is saved until you fix it.

**Next set** starts the next set right away, beginning with its first call (READY or a Move Lab start call). The tap unlocks speech again on iPhone. **End session** ends the session and shows the [session summary](#offense-session-summary).

The rest screen says "Set saved." after each save, or "Couldn't save to this device. Storage may be blocked or full." if storage refused it. Training carries on either way. What is stored is described in [The training log](#the-training-log).

### Offense: session summary

When a session that has at least one saved set ends (**End session**, **Save & end session**, **Discard**, or Stop before a set's first rep finishes), the **Session done** screen shows:

- the **session length** (from Start to the end, mm:ss);
- a card **per drill** played, with: sets, reps, made / attempted and make %, lost handles per 10 reps, missed calls per 10 reps, and the share of rated sets marked Clean. Values that weren't logged show "–" (skipped sets don't count toward the rates);
- one plain-language line comparing today with the **mean of your previous 5 sessions of the same drill** (each earlier session's own rate, averaged), e.g. "Make % 62 (avg 55). Lost handles 1.2 per 10 reps (avg 2.0)" (Read the D starts with "Decisions 85% right (avg 78)"). With no earlier sessions of that drill it adds "No earlier sessions to compare with yet". With fewer than 5 earlier sessions it averages those it has.

**Done** returns to the start screen. A session with no saved sets goes straight back to the start screen.

### History and backup

Tap **History** on the start screen.

**Trends.** For each drill, a small chart of the last 20 sessions of that drill (oldest on the left). The solid blue line is **make %** (left axis, 0–100%), the dashed orange line is **lost handles per 10 reps** (right axis, 0 up to the highest value rounded up, at least 2), and for Read the D a dotted green line is **decisions right %** (left axis). The first and last session dates are under the x-axis. With fewer than 3 sessions of a drill it shows "Not enough data".

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

| Level | Drive window (ms) | Drive read time (ms) | Drive CUT OFF / LAY UP weights |
|---|---|---|---|
| 1 | 2200–2800 | 2000–3500 | 10 / 10 |
| 2 | 1900–2500 | 1500–3000 | 15 / 15 |
| 3 | 1600–2200 | 1000–2500 | 20 / 20 |
| 4 | 1500–2000 | 800–2000 | 28 / 25 |
| 5 | 1400–1800 | 600–1500 | 35 / 30 |

The Drive CUT OFF / LAY UP weights are the CUT OFF and LAY UP entries of `afterDriveOrCutOffWeights` (the three `LAY UP … SIDE` finishers stay at 20 each), so higher levels make drives busier as well as shorter.

Every level passes the drill's normal validation, including the shortest-drive and shortest-window fit checks (a self-test check loops over all of them). From the fit tables, at the defaults (`maxRate` 1.6, `minGapMs` 120):

| Level | Drive: most CUT OFFs that fit at the min / max window |
|---|---|
| 1 | 3 / 3 |
| 2 | 2 / 3 |
| 3 | 1 / 3 |
| 4 | 1 / 2 |
| 5 | 1 / 2 |

(Drive counts use the cheapest finisher; longer finishers need a little more room.)

**The adjustment rule** (`nextLevel(level, set, cfg)`), applied after each saved set:

- A set only counts if its outcomes were logged (not skipped) and it has **at least 5 shots attempted**. Otherwise the level holds.
- *success* = made / attempted; *error rate* = (lost handles + missed calls) / reps.
- **Step up** one level if success ≥ **0.80** and error rate ≤ **0.10**.
- **Step down** one level if success < **0.50** or error rate ≥ **0.30**.
- Otherwise **hold**. The level always stays within 1–5.

**These thresholds, the level values and the starting level are starting heuristics to tune, not research-proven values.** The challenge-point idea says to keep practice hard but doable; it doesn't say that 80% or 0.10 errors per rep is the right line for this drill. They are all marked `// provisional` in `TRAINING_DEFAULTS` (`startLevel`, `levelMinAttempts`, `levelUpSuccess`, `levelUpMaxErrorRate`, `levelDownSuccess`, `levelDownErrorRate`, `levels`). Watch your History trends and adjust them.

**Read the D's rule** (`readTheDLevelDecision`; `levelDecisionFor(drill, …)` picks the right rule per drill) uses decision accuracy as well as shots:

- A set only counts if its outcomes **and** its decisions were logged (not skipped), with at least 5 shots attempted and at least 5 decisions.
- **Step down** one level if decision accuracy < **0.65** or error rate ≥ **0.30**. This is checked first, so a set with too many errors never steps up.
- **Step up** one level if decision accuracy ≥ **0.85** and success (made / attempted) ≥ **0.60**.
- Otherwise hold. All four thresholds are `// provisional` (`readTheDLevelUpAccuracy`, `readTheDLevelUpSuccess`, `readTheDLevelDownAccuracy`, `readTheDLevelDownErrorRate`).

### Stopping

**Stop in the middle of an Offense set**, once at least one rep of that set has finished, halts the set and opens the log form for the **partial set**:

- every pending call and the countdown are cleared and speech is silenced immediately, as before;
- the form shows "Partial set *n* · *done* of *planned* reps", with attempted defaulting to the reps completed (the rep in progress when you pressed Stop doesn't count);
- it has the same buttons plus **Discard**. Save & rest and Skip logging continue the session (rest, then the next set); Save & end session and Discard end it.

**Stop in Defense**, or in Offense before any rep of the current set has finished, and **End session** (on the rest screen) or **Discard**:

- cancel every pending call (Offense keeps all its timers in one list and clears them all, whatever state the rep is in: start call, get-set, mid-window or reset pause);
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
| `reactionCaller.offenseDrill` | `"drive"`, `"readTheD"` or `"moveLab"` (missing or unknown, including the removed `"shooters"`, means Drive) | When you tap the drill switch |
| `reactionCaller.moveLab` | The Move Lab moves you picked, `{ "moveIds": [...] }` (missing means the default CROSSOVER and HESI) | When you tap a move in the Moves grid |
| `reactionCaller.settings` | The raw text of Defense's Min/Max delay fields and every offense field: Drive read time, window and Advanced values, the shared speech settings, the Read the D fields (practice mode, cue rate, decision window, hands, mid-dribble, gaps, read time, LIVE delay, pauses), the Move Lab fields (max moves per rep, get-set times, gaps, reset pause), every weight and the Session fields (reps per set, planned sets, session time warning), keyed by input id | Whenever you edit any of those fields, by typing or with the − / + steppers |
| `reactionCaller.learnedMs` | Learned spoken length of each offense phrase, every drill alike (see [Learned spoken lengths](#learned-spoken-lengths)) | After each measured offense call |
| `reactionCaller.log` | The training log: every Offense session and its logged sets (see [The training log](#the-training-log)) | After every saved set (Save & rest, Save & end session, Skip logging), and when a session with saved sets ends |
| `reactionCaller.log.backup.<time>` | The raw text of a stored log that this version couldn't read (broken, or from a newer version), kept untouched | Once, just before the first new log is saved over it |
| `reactionCaller.lastExportAt` | ISO time of the last JSON export (download, or copying the JSON text) | On export |
| `reactionCaller.levels` | Each drill's current level, e.g. `{"drive":3,"readTheD":2}` (missing or invalid means Level 3) | After every logged set with Auto difficulty on, and on Reset level |
| `reactionCaller.autoLevel` | `"on"` or `"off"` (missing means on) | When you tap the Auto difficulty toggle |
| `reactionCaller.migrations` | Ids of one-time migrations already applied, e.g. `["read-to-ready"]` | Once, on the first load after a migration is added |

Settings are saved by input id, and the Drive and speech fields kept their ids. So settings saved before the Session group existed still load, and any field without a saved value shows its default. Values saved for the removed Shooters only fields are ignored, except its get-set times (corners and catch) and nope gap, which load into Move Lab's get-set and gap-before-first-move fields.

Nothing else is stored. Every storage access is wrapped in `try/catch`. If storage is blocked (private mode, disabled site data), the app works normally with the built-in defaults and just doesn't remember anything; the rest screen then says the set couldn't be saved.

To reset everything to defaults, clear the site's data in your browser, or run `localStorage.clear()` in the browser console on the app's page.

---

## Offense mode in depth (Drive drill)

This section describes the Drive drill. The phrase table, speech settings, runner and learned lengths are shared with the other drills.

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

The estimates are only a starting point. The app measures the real lengths on your device and uses those once it has them. The other drills' phrases live in the same table.

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
| `baseRate` | 1.25 | Normal speech rate (shared by every drill) |
| `maxRate` | 1.6 | Speech rate ceiling (shared by every drill) |
| `minGapMs` | 120 | Minimum silence between calls in a drive (shared by every drill) |
| `finisherBufferMs` | 0 | The finisher must finish being spoken this long before `D` ends |
| `speechLeadMs` | 0 | Speak each call this much early to offset voice start-up delay (shared by every drill) |
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

1. When a rep starts, the app records the rep clock origin with `performance.now()` (plus `speechLeadMs`, so t = 0 is when the first call should be *heard*). The first call (READY, or a Move Lab start call) is spoken right away.
2. Every later call gets its own `setTimeout`, computed from that origin rather than chained from the previous timer, so drift doesn't accumulate. Each fires `speechLeadMs` early. The word appears at the same moment it is sent to the voice, at the call's planned rate.
3. The countdown bar is drawn **only from `plan.windows`**. At each window's start it drains on `requestAnimationFrame` from the same clock, then sits empty at "0.0 s". It is hidden from the start of the rep until the first window.
4. When `endMs + restMs` has passed, the runner plans and starts the next rep. If the rep was the **last of its set**, the runner instead ends the set at `endMs` (the rest is not waited for): it says "set done" with `cancel: false` and shows the set log form. **Next set** starts the next set's first rep inside that tap (see [sessions, sets and reps](#offense-sessions-sets-and-reps)).
5. On **Start** (and on **Next set**), Offense speaks the first call immediately, right after unlocking speech inside the click. That unlock is required on iPhone.

Every timer goes into one list, so Stop clears all of them in any state. The session clock runs on its own interval, which Stop also clears. A run id makes late `onend` events from a stopped run be ignored. In Offense the runner never calls `speechSynthesis.cancel()` between calls; only Stop does.

### Learned spoken lengths

Real spoken lengths depend on the voice and device. For every offense call the app listens to the utterance's `onstart` and `onend` events, measures the time between them and normalizes it to rate 1.0 (`measured × rate`). Then:

This covers every offense phrase, whatever the drill. Shared phrases (LEFT, RIGHT, CUT OFF) share one learned value.

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

## Read the D drill in depth

Read the D is the one offense drill that is **not** Call & Execute. A short spoken sequence describes the defender's state, and nothing names the move: you combine the calls and decide whether to drive (and which way), pull up, or create space. It covers drive decisions only, no passing reads.

### Read the D vocabulary

The defender's state, always from the attacker's point of view:

| Key | Values | Meaning |
|---|---|---|
| `momentum` | `closing`, `set`, `retreating` | Coming at you, standing in his stance, or backing off |
| `distance` | `tight`, `cushion`, `sag` | Inside arm's reach, about an arm's length (called **NO OPENING**), or well off (near the free-throw line) |
| `leadFoot` | `left`, `right` | The side his forward foot is on |
| `hands` (Level 3+) | `up`, `down` | A pure distractor: it never changes the correct answer |

The calls are in the shared phrase table (rough estimates at rate 1.0; the app learns the real lengths like every other call):

| id | display / spoken | est. ms | role |
|---|---|---|---|
| D_CLOSING | CLOSING | 500 | momentum |
| D_SET | SET | 300 | momentum |
| D_RETREATING | RETREATING | 650 | momentum |
| D_TIGHT | TIGHT | 350 | distance |
| D_CUSHION | NO OPENING | 700 | distance (state value `cushion`; the id and value kept their old name so saved logs still load) |
| D_SAG | SAGGING | 500 | distance |
| D_LEFT_FOOT | LEFT FOOT | 550 | lead foot |
| D_RIGHT_FOOT | RIGHT FOOT | 550 | lead foot |
| D_HANDS_UP | HANDS UP | 550 | distractor |
| D_HANDS_DOWN | HANDS DOWN | 600 | distractor |
| D_NOW | NOW | 300 | go signal |
| D_LIVE | LIVE | 350 | mid-dribble lead-in (Levels 4–5) |

The Levels 1–3 lead-in is the Drive drill's READY (id `READ`), spoken once at the base rate.

### The rules (correctAction)

`correctAction(state, rules)` (pure) returns `{ action, ruleId, situation, answer, why, evidence }`. The rules live in `TRAINING_DEFAULTS.readTheD.rules`, so you can edit them, and are checked **in this order**; the first match decides:

| # | Rule id | When | Correct action | Why | Evidence |
|---|---|---|---|---|---|
| 1 | `closing` | momentum closing | DRIVE to the lead-foot side | attack the closeout past his front foot | coaching heuristic |
| 2 | `gaveShot` | distance sag, **or** momentum retreating | PULL UP | he gave you the shot | coaching heuristic |
| 3 | `tightSet` | tight **and** set | DRIVE to the lead-foot side | attack his front foot | study-based |
| 4 | `cushionSet` | cushion (NO OPENING) **and** set | CREATE SPACE: hesi or step-back into a jumper | his foot doesn't matter at this distance | coaching heuristic |

The actions are `DRIVE_LEFT`, `DRIVE_RIGHT`, `PULL_UP` and `CREATE_SPACE`. A rule's action `DRIVE_LEAD_SIDE` becomes DRIVE_LEFT when the lead foot is on the left and DRIVE_RIGHT when it is on the right. The four rules cover all 18 states (rule 1 catches every closing state, including a closing defender who is sagging).

Each rule has `when`, a list of entries; an entry matches when every key in its `match` holds one of the listed values. Each entry has a `situation` (e.g. "sagging defender" or "retreating defender" for rule 2) used in feedback, and each rule has an `answer`, a `why` and an `evidence` tag. Rules can only look at momentum, distance and lead foot, never at hands, so the distractor can't change an answer.

"Study-based" marks the one rule backed by studies of defenders' stance (attacking the side of the lead foot of a tight, set defender). Everything else is a **coaching heuristic**: a common teaching rule, not a measured result.

### Call order and the rep plan

Every rep calls **all three** of momentum, distance and lead foot, in that fixed order, even when the rule that decides doesn't use one of them, so silence never becomes a tell. From Level 3 a hands call (HANDS UP / HANDS DOWN) is inserted at a random place among them (first, between two of them or last, each equally likely). NOW always comes last.

```
READY ──(read time)──▶ momentum ▶ distance ▶ lead foot ▶ NOW ──(decision window)──▶ reset pause
                       └─ a hands call can go anywhere in here from Level 3 ─┘    └─ countdown bar ─┘

Levels 4-5 (mid-dribble):
LIVE ──(600-1500 ms)──▶ momentum ▶ distance ▶ lead foot ▶ NOW ──(decision window)──▶ …
```

`planReadTheDRep(s, dur, rng, onPick, ctx)` (pure) builds the rep plan:

1. **Lead-in** at 0, at `baseRate`: READY (Levels 1–3, "before the move") or LIVE (Levels 4–5, "mid-dribble": start dribbling, the read comes while you're live).
2. **Wait**: the read time (`readTheD.readMinMs`–`readMaxMs`, 800–3500 ms) after READY, or the LIVE delay (`liveDelayMinMs`–`liveDelayMaxMs`, 600–1500 ms) after LIVE, measured from the rep start and clamped so the first cue never overlaps the lead-in.
3. **The cue sequence and NOW**, laid out with the same per-window rate-fit math as a drive window (`fitRateIn` and `scheduleCalls`): the window is exactly long enough for the calls at the level's cue rate with the cue gap between every two calls, so each call is spoken at that rate and none can overlap or clip another.
4. **The decision window** starts at NOW and lasts the level's decision time: make the move and shoot. The countdown bar drains over it.
5. **Rest**: `readTheD.resetPauseMs` (1000 ms), then the next lead-in.

The plan has the usual `calls`, `windows`, `endMs` (the end of the decision window) and `restMs`, plus the optional field `cues`, one entry per decision:

```js
cues: [{ atMs, durMs,     // the decision window (same as its windows entry)
         state,           // { momentum, distance, leadFoot, hands? }
         ids,             // the cue calls in the order spoken, without NOW
         correct,         // "DRIVE_LEFT" | "DRIVE_RIGHT" | "PULL_UP" | "CREATE_SPACE"
         ruleId }]        // the rule that decided
```

Other drills don't have `cues`.

### Sampling states

`sampleState(cfg, withHands, prev, rng)` draws the state in two steps: first a correct action by `TRAINING_DEFAULTS.readTheD.actionWeights` (25 each, provisional), then one of that action's states at random. So the four actions come up about equally often (the self-test checks within 2 points over 40,000 reps), the lead foot is random, and every state comes up. The state of the previous rep (`ctx.lastState`, passed by the runner) is never drawn again, so the exact same state never comes twice in a row.

### Read the D levels

Difficulty comes from the speech rate, the gaps and the decision window, not from how long anything is shown. All values are provisional (`TRAINING_DEFAULTS.levels.readTheD`); the start level is 3, as for Drive.

| Level | Cue speech rate | Cue gap (ms) | Decision window (ms) | Hands distractor | Cue timing | Second read | Longest sequence spoken in |
|---|---|---|---|---|---|---|---|
| 1 | 1.0 | 300 | 3000 | no | before the move (READY, read time) | no | 3100 ms |
| 2 | 1.15 | 250 | 2500 | no | before | no | 2663 ms |
| 3 | 1.3 | 200 | 2200 | yes | before | no | 2954 ms |
| 4 | 1.45 | 150 | 2000 | yes | mid-dribble (LIVE, 600–1500 ms) | yes | 2531 ms |
| 5 | 1.6 (the max rate) | 120 | 1700 | yes | mid-dribble | yes | 2230 ms |

"Longest sequence" is RETREATING > NO OPENING > LEFT FOOT (> HANDS DOWN) > NOW with the estimates, from the first cue to the end of NOW (the self-test page prints this table). The cue rate only applies to the cue calls and NOW; the lead-in stays at the base rate.

The level values are the settings `readTheD.rate`, `cueGapMs`, `decisionMs`, `hands`, `midDribble` and `secondRead` in `OFFENSE_DEFAULTS.readTheD`. Their defaults there (used with Auto difficulty off) are the Level 3 values.

### Read the D validation

`validateReadTheD(s, dur)` checks the speech settings, then:

- the cue speech rate is between 0.5 and 2.0 and **not above the max speech rate** (Level 5 uses exactly 1.6, the default max);
- the cue gap is a whole number ≥ 0 and the decision window a whole number ≥ 500 ms;
- hands, mid-dribble, second read and practice mode are each off (0) or on (1); the second read gap and the practice pause are whole numbers ≥ 0 (gap min ≤ max);
- the second read mapping: a chance from 0 to 1, at least one option after a drive and after a pull-up / create-space, weights ≥ 0 adding up to more than 0, and states that only use valid values, `"random"`, lists of valid values, or (lead foot only) `"opposite"`;
- the read time (whole numbers ≥ 100 ms, min ≤ max), the LIVE delay (whole numbers ≥ 0, min ≤ max) and the reset pause (whole number ≥ 0);
- the rule table: every rule has a known action, an answer, a why, an evidence tag and `when` entries that only match momentum, distance and lead foot values; and **every state has an answer** (e.g. "No rule covers SET · NO OPENING · LEFT FOOT.");
- the action weights are numbers ≥ 0 that add up to more than 0;
- the longest cue sequence fits at the cue rate.

### Second read (Levels 4–5)

At Levels 4–5 (setting `readTheD.secondRead` = 1) the defender reacts to your first move. In a share of reps (`TRAINING_DEFAULTS.readTheD.secondRead.chance`, 0.5, provisional) a second call sequence follows the first:

```
… NOW ──(decision window 1)──▶ 700-1200 ms ▶ momentum ▶ distance ▶ lead foot ▶ NOW ──(decision window 2)──▶ reset pause
```

- It starts `secondGapMinMs`–`secondGapMaxMs` (700–1200 ms, provisional) after the first window ends (in practice mode: after the first explanation).
- It uses the same fixed order (momentum → distance → lead foot → NOW), with **no hands call**, at the level's cue rate and gap.
- It gets the level's **full** decision window too, so the rep is extended by the gap, the second sequence and a second window; the countdown bar drains once per window.
- It is scored with the **same** `correctAction` rules; no new rules.

The second state **follows from the first correct action** (the app assumes you made the right first move), from the mapping in `TRAINING_DEFAULTS.readTheD.secondRead` (weights provisional):

| After the first correct action | Reaction (weight) | Second state | Correct second action |
|---|---|---|---|
| DRIVE LEFT / DRIVE RIGHT | `cutOff` (50) | set, tight, lead foot on the **other** side | a counter drive back the other way |
| DRIVE LEFT / DRIVE RIGHT | `retreat` (50) | retreating, cushion (NO OPENING) or sag, lead foot random | PULL UP |
| PULL UP / CREATE SPACE | `closeout` (100) | closing (a hard closeout), tight or cushion (NO OPENING), lead foot random | DRIVE past his front foot |

A value in the mapping is fixed (`"set"`), a list to pick from at random (`["cushion", "sag"]`), `"random"` (any value) or, for the lead foot, `"opposite"` (the other side from the drive). The second decision is the rep's second `cues` entry (with `reaction`, the option's id), and the decision review shows it as "Rep 3 · read 2". Accuracy counts every decision.

### What three words can't capture

Three spoken words in a fixed order simplify something a real defender shows you almost all at once: his momentum, distance, stance and hands arrive together, change continuously, and come with fakes. The drill trains the decision rules and makes them fast, so the read is automatic when you see it. Reading a real defender on the court still needs practice against a real defender.

## Drill profiles and rep plans

Offense is built around two ideas, so that a future **mixed** drill (a random drill per rep) is a small addition:

**A drill profile** (`OffensePlanner.PROFILES.drive`, `PROFILES.moveLab`, `PROFILES.readTheD`) bundles one drill:

| Field | Drive | Move Lab | Read the D |
|-------|-------|----------|------------|
| `phraseIds` | READ (shown READY), LEFT, RIGHT, CUT_OFF, LAY_UP, finishers | the three Move Lab start calls, LEFT, RIGHT, the moves, SHOT | READ (READY), D_LIVE, the ten cue calls, D_NOW |
| `next` (state table) | `NEXT` | `MOVE_LAB_NEXT` (MOVE stands for any picked move) | none: a fixed call order (`RTD_ORDER`) |
| `weightTables` | `WEIGHT_TABLES` | `afterMoveWeights` (under `settings.moveLab`) | none (action weights are in `TRAINING_DEFAULTS.readTheD`) |
| `planRep(settings, durations, rng, onPick, ctx)` | `planDriveRep` | `planMoveLabRep` | `planReadTheDRep` |
| `validate(settings, durations)` | `validateOffense` | `validateMoveLab` | `validateReadTheD` |
| `fitTable` / `selfTest` | `fitTable` / Drive checks | none / Move Lab checks | `readTheDFitTable` (per level) / Read the D checks |

Phrases stay in one shared table keyed by id, so LEFT, RIGHT and CUT_OFF are shared, and so are their learned lengths.

**A rep plan** is the one shape the runner executes, whatever the drill:

```js
{
  calls:   [{ id, atMs, durMs, rate }],  // every spoken call, ms from the rep start
  windows: [{ startMs, durMs }],         // countdown windows the bar draws
  endMs,                                 // when the rep's last window ends
  restMs,                                // pause after endMs before the next rep
  cues                                   // optional (Read the D): one entry per decision
}
```

`ctx` is what the runner knows about earlier reps: `{ repInSet, lastMoveId, lastState }` (`lastState` is the previous Read the D state). Every plan must satisfy the **runner contract**, which `repPlanProblems(plan, phrases)` checks: known phrases, calls in time order that never overlap, a positive length and a rate of 0.5–2 for each, windows inside `[0, endMs]`, `endMs` at or after the last call ends, `restMs` ≥ 0, and (when present) one `cues` entry per window with the same start and length.

The runner ([Running a rep](#running-a-rep)) knows nothing about drills: it speaks `calls`, draws `windows` and starts the next rep after `endMs + restMs`. The countdown bar covers each window. A single bar over the whole rep would be a change to what the planner puts in `windows`, not a runner change.

A mixer is **not built yet**. It would be a third profile (e.g. `mixed`) whose `planRep` picks a drill per rep and calls that profile's `planRep`, plus a button in the drill switch. Its settings would need every mixed drill's validation.

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
      drill,             // "drive" | "moveLab" (and "shooters" in sets logged before it was removed)
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

**`settingsSnapshot`** keeps old sets interpretable after you change settings. It holds, for every drill, the speech settings (`baseRate`, `maxRate`, `minGapMs`, `speechLeadMs`) and `repsPerSet`, plus:

- **Drive**: read time (`readMinMs` / `readMaxMs`), drive window, reset pause, finisher buffer, both caps and the three weight tables;
- **Move Lab**: the whole `moveLab` settings object (picked moves, max moves per rep, gap between moves, weights, reset pause). Sets logged before Shooters only was removed hold the borrowed get-set and nope gap under `shooters` instead, and old Shooters sets hold the whole Shooters settings object; both stay valid.

**Read the D's `extra`** holds the decisions, one per decision of each finished rep (two for a rep with a second read):

```js
extra: { decisions: [{
  rep, read,          // rep number in the set (1..reps), 1 or 2 (second read)
  ids,                // the cue calls in the order spoken, e.g. ["D_CLOSING", "D_TIGHT", "D_LEFT_FOOT"]
  state,              // { momentum, distance, leadFoot, hands? }
  correct, ruleId,    // the right action and the rule that decided it
  situation,          // e.g. "closing defender" (for feedback)
  actual              // what you did: DRIVE_LEFT | DRIVE_RIGHT | PULL_UP | CREATE_SPACE | FROZE, or null if not reviewed
}] }
```

`summarizeSets` adds `decisions`, `decisionsCorrect`, `decisionPct` and `decisionScore` (the full `scoreDecisions` result) over every set's reviewed decisions. The log `version` stays 1: the new fields are additions inside `extra`, which older sets don't have.

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

Every tunable offense number lives in one commented object, `OFFENSE_DEFAULTS`. It is created in `js/core/planner.js` (speech, learning and the shared phrases), and each drill file adds its own section: `js/drive/drive.js` the top-level Drive keys and phrases, `js/move-lab/move-lab.js` `moveLab`, `js/read-the-d/read-the-d.js` `readTheD`. Put together it looks like this:

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
  phrases: { READ: { display: "READY", spoken: "ready", estMs: 350 }, …, SHOT: { … } },

  // Move Lab drill
  moveLab: {
    moveIds: ["CROSSOVER", "HESI"],
    maxMovesPerRep: 3,                      // 1-6
    getSetMs: { SPRINT_FROM_LEFT_CORNER: { minMs: 1000, maxMs: 2300 }, …, CATCH: { minMs: 440, maxMs: 1100 } }, // provisional
    firstMoveGapMinMs: 150, firstMoveGapMaxMs: 400,
    moveGapMinMs: 800, moveGapMaxMs: 1500,  // provisional
    afterMoveWeights: { MOVE: 50, SHOT: 50 }, // provisional
    resetPauseMs: 1000,
  },

  // Read the D drill (the Level 3 values; with Auto difficulty on the level sets the first five)
  readTheD: {
    rate: 1.3, cueGapMs: 200, decisionMs: 2200, hands: 1, midDribble: 0,
    readMinMs: 800, readMaxMs: 3500,          // provisional
    liveDelayMinMs: 600, liveDelayMaxMs: 1500, // provisional
    secondRead: 0, secondGapMinMs: 700, secondGapMaxMs: 1200, // provisional
    practice: 0, practicePauseMs: 600,         // provisional
    resetPauseMs: 1000,
  },
};
```

- Values here are the **defaults** the start screen shows. Values you type into the start screen are saved and **override** these on that device. After changing a default in the file, clear the saved settings (`localStorage.removeItem("reactionCaller.settings")`) to see the new default in the form.
- The **phrase table** (`phrases`) is where you fix pronunciation (`spoken`), change on-screen text (`display`) or adjust the length estimates (`estMs`). Learned lengths (`reactionCaller.learnedMs`) override `estMs` per phrase. Delete that key to start learning from scratch after changing the voice or the spoken text.
- The Drive read time is `readMinMs` / `readMaxMs` (800 / 3500). Defense's Min/Max delay fields are separate (HTML defaults 1000 / 3000).
- The state tables (`NEXT` for Drive, `MOVE_LAB_NEXT` for Move Lab) and the finisher and start-call lists sit in the drill files. They are structure, not tuning.
- `OFFENSE_DEFAULTS.readTheD` holds the Read the D timing (cue rate and gap, decision window, read time, LIVE delay, reset pause) and the hands / mid-dribble switches. Its calls (`D_…`) are in the shared `phrases` table. The rules and action weights are in `TRAINING_DEFAULTS.readTheD`.
- `OFFENSE_DEFAULTS.moveLab` holds every Move Lab number, including the get-set time after each start call (`getSetMs`) and the gap from LEFT / RIGHT to the first move (`firstMoveGapMinMs` / `firstMoveGapMaxMs`). Its start calls and SHOT are in the shared `phrases` table.

### `TRAINING_DEFAULTS`

Session structure, logging and progression live in a second commented object, also created in `js/core/planner.js`; `js/core/session.js` adds the session fields, `js/core/levels.js` the level rule, `js/log/history.js` the history numbers, and each drill its levels and settings. Put together:

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
    readTheD: [{ "readTheD.rate": 1.0, "readTheD.cueGapMs": 300, "readTheD.decisionMs": 3000,
                 "readTheD.hands": 0, "readTheD.midDribble": 0 }, …],
  },

  // Read the D: the rule table and how often each action comes up
  readTheD: {
    rules: [{ id: "closing", when: [{ match: { momentum: ["closing"] }, situation: "closing defender" }],
              action: "DRIVE_LEAD_SIDE", answer: "…", why: "attack the closeout past his front foot",
              evidence: "coaching heuristic" }, …],
    actionWeights: { DRIVE_LEFT: 25, DRIVE_RIGHT: 25, PULL_UP: 25, CREATE_SPACE: 25 }, // provisional
    secondRead: { chance: 0.5, afterDrive: [{ id: "cutOff", weight: 50, state: { … } }, …],
                  afterPullUpOrCreateSpace: [{ id: "closeout", weight: 100, state: { … } }] }, // provisional
    whyEstMsPerChar: 65, // provisional
  },
};
```

Like `OFFENSE_DEFAULTS`, these are the defaults the Session group shows, and saved values override them. Thresholds marked `// provisional` are heuristics that still need real-world tuning.

Rules of thumb:

- **Drives feel rushed or words sound sped up**: raise `driveMaxMs`/`driveMinMs`, lower `minGapMs`, or lower `baseRate`.
- **Long drives (several CUT OFFs) never happen**: they don't fit. Check the fit table below and raise `driveMaxMs` or `maxRate`.
- **Calls lag behind the countdown on a phone**: the voice starts late. Set `speechLeadMs` (e.g. 100–200), or add a `finisherBufferMs` (Drive).
- **A word is mispronounced**: change its `spoken` text.
- **Read the D: the cues come too fast to take in**: lower the level, or with Auto difficulty off lower `readTheD.rate` or raise `cueGapMs`. **No time to act after NOW**: raise `decisionMs`.
- **Read the D: one action comes up too often**: change `TRAINING_DEFAULTS.readTheD.actionWeights`. **You disagree with a rule**: edit `TRAINING_DEFAULTS.readTheD.rules` (validation makes sure every state still has an answer).
- **Move Lab: not enough time to get to the spot**: raise that start call's `getSetMs` range.
- **Move Lab: not enough time to finish a move before the next call**: raise `moveGapMinMs` / `moveGapMaxMs` (Gap between moves). **Too many or too few moves per rep**: change Max moves per rep or `afterMoveWeights`.

### Self-test (`?selftest=1`)

Open:

```
http://localhost:8080/index.html?selftest=1
```

Use `/index.html?selftest=1`, not `/?selftest=1`. The bundled `server.js` only maps a bare `/` to `index.html`, so `/?selftest=1` returns "Not found".

Instead of the app, the page runs a simulation of every offense planner (every drill profile's self-test) plus checks of the session helpers and the training log, and prints **PASS** / **FAIL** for each check to the console and to an on-page banner (green when everything passes, red otherwise). There are 64 checks in total: 19 Drive, 5 Move Lab, 11 Read the D, 1 Runner, 1 Learned lengths, 6 Session, 3 Levels, 2 Read the D scoring, 9 Training log and 7 History. Each drill file runs its own checks; the other files register theirs with `registerSuite`.

**Read the D.** It checks:

1. the vocabulary: the eleven cue phrases and LIVE exist, are shown as in the table, spoken as shown in lower case and have estimates, and every state value has its call;
2. `correctAction` matches the rule table, written out independently in the test, for all 18 states and all 36 with hands;
3. the hands call never changes the answer (or the deciding rule);
4. every rule has an answer, a why, situations and an evidence tag, and only the tight, set lead-foot rule is study-based;
5. validation: the defaults and all five levels pass; a cue rate of 1.7 (above the max rate) or 0.4, a negative or fractional cue gap, a 400 ms or empty decision window, flags other than 0/1, bad read time or LIVE delay ranges, a negative reset pause, a rule table that leaves a state uncovered, a rule matching hands, an unknown action or evidence tag, all-zero or negative weights are rejected, and a bad base rate is reported as a speech error;
6. the sequence, at every level (2,000 reps each): READY (Levels 1–3) or LIVE (4–5) at 0 at the base rate; momentum, distance and lead foot in that order and matching the state; a hands call at Levels 3–5 only, in every rep, matching the state, at each of its four possible places; NOW last; the `cues` record matches what was called;
7. the timing: the first cue within the read time or LIVE delay (clamped after the lead-in); every cue call at the level's rate with exactly the cue gap between calls, none overlapping; the sequence fits at the level's rate (`fitRateIn`); one window from NOW lasting the level's decision time, `endMs` at its end and the reset pause as rest;
8. sampling: over 40,000 reps (Levels 1 and 3) each correct action's share is within 2 points of its weight;
9. the same state never comes twice in a row, and every state (18, or 36 with hands) comes up;
10. practice mode (Levels 1, 3 and 5, 500 reps each): the action phrases and each rule's why phrase exist; after the window, the practice pause, then the correct action, then (at least the min gap later) the deciding rule's why marked as a caption; `endMs` is when the last why ends, with one why per decision; every plan passes the runner contract;
11. the second read (20,000 reps at Levels 4 and 5): never at Levels 1–3; in 50% of reps within 2 points; it starts 700–1200 ms after the first window; both windows last the level's decision time and the rep ends with the second; the second sequence is momentum > distance > lead foot > NOW with no hands, matching its state and scored with the same rules; after a drive it is a cut-off (set, tight, the counter drive the other way) or a retreat (PULL UP), after PULL UP / CREATE SPACE a closeout (drive to the lead-foot side); all three reactions come up; a bad chance, an empty or zero-weight option list, an invalid value, a bad flag or gap range are rejected.

Checks 6 and 7 look at the first decision of each rep (up to the first NOW).

**Read the D scoring.** Two checks:

1. `scoreDecisions` on 8 decisions with one sagging defender driven anyway: 7/8, the per-action counts, the lines "7/8 correct." and exactly "Missed: sagging defender → pull up, he gave you the shot.", and "sagging defender → you drove anyway"; two closing-defender misses beat one sag miss ("closing defender → you drove the wrong way (2×)"); all right gives no second line; unreviewed decisions give no score;
2. the level rule: up at 17/20 right with 6/10 made; hold at 84% right, at 59% made, and at exactly 65% right; down at 64% right and at error rate 0.30 (even with every decision right); clamped at 5 and 1; hold with too few shots, unreviewed decisions or a skipped set; Drive still uses its own rule.

**Runner.** One check runs 1,000 rep plans of every drill (Read the D at all five levels, odd levels in practice mode) through `repPlanProblems`: the runner contract described in [Drill profiles and rep plans](#drill-profiles-and-rep-plans).

**Move Lab.** It checks the move list (8 moves, 6 handle and 2 shot, each a phrase with an estimate; the default picks are real moves); validation (each single move, all moves, 1 and 6 moves per rep, zero gaps and one-sided weights pass; no moves, unknown moves, non-move phrases, duplicates, 0, 7 or fractional moves per rep, bad gap ranges, all-zero or negative weights, a negative reset pause, and a bad get-set or first-move gap are rejected; a bad speech rate is reported as a speech error); the plans (10,000 reps spread over 1–6 max moves with random picks: a start call, then LEFT/RIGHT, then 1..max picked moves, then SHOT; every move count from 1 to max happens; every start call, direction and move gets called; the get-set time, the first-move gap and each gap between moves stay in range; every call at the base rate, none overlapping; one countdown window from LEFT/RIGHT to the end of SHOT, and the reset pause as rest); and the weights (MOVE vs SHOT within 2 points of the default weights, SHOT always at the max, MOVE weight 0 means always one move, SHOT weight 0 always the max). Session adds a check that Move Lab uses its own reps per set; Training log adds a check of Move Lab sets (picked moves, or an old move + side, and clean reps 0..reps), their snapshot and clean-rep totals.

**Drive.** It runs 10,000 drives at the **default** settings and 10,000 at **tight** settings (`D` fixed at 1400 ms, `maxRate` 2.0, `minGapMs` 40), and checks:

1. every drive starts with LEFT or RIGHT, chosen after READY;
2. every transition is in the state table, and nothing comes after a finisher;
3. every drive ends with exactly one finisher, legal for the previous call (long after LEFT/RIGHT/CUT OFF, short after LAY UP);
4. cut-offs and lay-ups per drive are within their caps;
5. `D` is within the drive window, and the speech rate is between `baseRate` and `maxRate`;
6. every call lies within `[0, D - finisherBufferMs]`, calls never overlap, and gaps are at least `minGapMs`;
7. with loose timing (a 30-second window, 40,000 drives), the observed pick frequencies match the weights within 2 percentage points (counting only picks where every legal choice was available);
8. (rep wrapper) READY is at 0 at `baseRate`, the read time is within the default 800–3500 ms and spreads over the whole range (the shortest and longest of 10,000 read times are within 2% of the ends), and every drive call lies inside the rep's window.

**Session.** It checks the pure session helpers:

1. `TRAINING_DEFAULTS` passes `validateSession`;
2. `validateSession` rejects out-of-range, fractional and missing values (reps per set 2 / 31 / 8.5, planned sets 0 / 21 / 1.5, warning −1 / 2.5, rest −1 / 601 / 2.5, and NaN for each) and accepts the bounds (3, 30, 1, 20, warning 0, rest 0 and 600);
3. walking 6 sets (past the 4 planned) with 3, 8 and 30 reps per set, every set ends after exactly that many reps, and the label reads "SET s / 4 · REP r / n" at every rep;
4. `formatElapsed` gives mm:ss (e.g. 754000 ms → "12:34", 4503000 ms → "75:03", negative → "00:00");
5. the fatigue warning is due at and after 45 min but not 1 ms before, never when set to 0, and its text starts with "45 min: decision quality".

**Defaults and learned lengths.** Three checks, each in the file it belongs to:

1. (`js/core/planner.js`) the `READ` phrase is shown as READY and spoken "ready"; `migrateLearned` drops a stored `READ` length on the first load but keeps other phrases, records `read-to-ready`, sets the marker even when nothing was stored, and doesn't drop a re-learned value on later loads;
2. (Move Lab) every default get-set minimum is at least the start call's estimated length at `baseRate` + `minGapMs`, and every get-set range is at least 600 ms wide;
3. (Drive) the read time range is at least 2000 ms wide.

**Levels.** It checks:

1. Drive and Read the D each have exactly 5 levels that set the same settings, every path exists in `OFFENSE_DEFAULTS`, every level passes the drill's validation (including the shortest-drive fit), plans 500 reps without error, and no level has a longer window than the one below it;
2. `levelDecision` / `nextLevel`: up at 8/10 with 0.1 errors per rep and exactly at both thresholds (4/5, 1 error in 10 reps); hold at 79% success, at error rate 0.11, and at 50% with 0.29; down at 49% and at error rate 0.30; clamped at 5 and 1; hold with only 4 attempts, for a skipped set and when errors weren't logged; a partial set with 5 attempts counts;
3. `applyLevel` sets only the level's settings without changing its input (e.g. Drive Level 4: window 1500, CUT OFF 28, LAY UP 25; Drive Level 1: read 2000, CUT OFF 10, finishers still 20); `normalizeLevels` replaces missing, fractional or out-of-range levels with the start level; `progressLabel` adds " · LVL 3" only when a level is given; `levelMessage` reads "Level 3 → 4: nice, timing gets tighter" and "Holding at Level 3".

**Training log.** It checks `TrainingLog`:

1. valid sets pass `validateSet`: a full set, a skipped set (all outcomes `null`), a note, made = attempted, 0 of 0, every rating, Drive and the removed Shooters only (old sets stay valid);
2. `validateSet` rejects made > attempted, negative, fractional, NaN and string counts, made without attempted, unknown or wrongly cased ratings ("great", "Clean"), an unknown drill, 0 reps, a note over 500 characters, a missing `extra`, snapshot or end time;
3. the math: `setSuccess` (5/8, and `null` when skipped or 0 attempted), `setErrorRate` (3 errors in 6 reps = 0.5, `null` when skipped), and `summarizeSession` on a 4-set session with a skipped and a partial set (28 reps, 10/20 made = 50%, 4 errors over 20 logged reps = 0.2 per rep, 2 of 3 rated sets clean), plus an empty session (all rates `null`);
4. `snapshotSettings` holds the drill's own windows, read or get-set times, weights, caps and speech settings (and nothing from the other drill), as a deep copy that later setting changes don't affect;
5. `upsertSession` appends a new session, replaces one with the same id, and doesn't change the log it was given;
6. `parseLog` reads a version 1 log; treats missing or empty text as a new log; and for a newer version (2, 99), a missing or string version, a non-array `sessions`, invalid JSON, `null`, an array, a number or a string returns a new empty log plus the original text to keep, without throwing;
7. Read the D sets: reviewed, skipped and empty decision lists pass; a missing list, a rep beyond the set, a third read, unknown actions, no ids or no situation are rejected; totals (3 of 5 right), the comparison text "Decisions 60% right (avg 50). Make % 75 (avg 75). Lost handles 2.5 per 10 reps (avg 2.5)", and the decision trend series and line;
8. with a fake store: opening a version 2 log doesn't change it; the first save copies it byte-for-byte to `reactionCaller.log.backup.<time>` and then writes the new log; a second save makes no new backup; when the backup can't be written, the broken log is left untouched and the save reports failure; a valid log keeps its sessions across reopen and save.

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

The self-test uses `OFFENSE_DEFAULTS`, `TRAINING_DEFAULTS` and the seed estimates only. It ignores saved settings and learned lengths, and in self-test mode the normal app never starts.

You can run the same checks without a browser: `node selftest-node.js` (add `-q` to print only failures and the total). It reads the `<script>` tags in `index.html` and loads every pure file (everything except `js/app/`, the `*-ui.js` files and the self-test page) in that order, so it always runs exactly what the page runs. Its exit code is 0 when everything passes.

---

## Project structure

```
Reaction-game/
├── index.html              ← markup of every screen + <script> tags in load order
├── styles.css              ← all styles
├── js/
│   ├── core/               ← pure logic shared by every drill
│   │   ├── planner.js      ← OffensePlanner: the defaults objects, timing math, learned lengths,
│   │   │                     drill registry, runner contract, self-test runner
│   │   ├── levels.js       ← adaptive difficulty: levels, the adjustment rule, its message
│   │   └── session.js      ← sets and reps, progress label, session clock, fatigue warning
│   ├── drive/
│   │   └── drive.js        ← Drive: defaults, phrases, levels, state machine, planner, validation, self-test
│   ├── move-lab/
│   │   ├── move-lab.js     ← Move Lab: defaults, move list, planner, validation, self-test
│   │   └── move-lab-ui.js  ← (app) the move picker, get-set fields, move colors
│   ├── read-the-d/
│   │   ├── read-the-d.js   ← Read the D: calls, rules, sampling, planner, second read, validation, self-test
│   │   ├── scoring.js      ← decision scoring, feedback lines, its level rule
│   │   └── read-the-d-ui.js← (app) cue colors and the decision review
│   ├── log/
│   │   ├── training-log.js ← TrainingLog: set validation, snapshots, summaries, versioned load / save
│   │   └── history.js      ← comparisons, trends, delete, import / merge, CSV, export names
│   ├── app/                ← the app (DOM, speech, timers, storage)
│   │   ├── shared.js       ← storage, speech, showWord, small helpers, drill names, shared elements
│   │   ├── defense.js      ← Defense mode
│   │   ├── runner.js       ← the Offense runner, countdown bar, session clock, learned lengths
│   │   ├── settings.js     ← the settings form, steppers, toggles, saving and loading fields
│   │   ├── levels-ui.js    ← Auto difficulty, level-locked fields, moving the level after a set
│   │   ├── set-log.js      ← the set log form, saving a set, rest, Next set
│   │   ├── summary.js      ← the session summary
│   │   ├── history-ui.js   ← the history screen: trends chart, session list, export reminder
│   │   ├── backup.js       ← export (JSON / CSV), backup text, import
│   │   └── main.js         ← modes, start screen view, Start / Stop, wiring; init() starts the app
│   └── selftest-page.js    ← the ?selftest=1 page
├── selftest-node.js        ← runs the self-test under Node
├── server.js               ← minimal static file server (Node.js, port 8080)
└── README.md               ← this document
```

**How the files fit together.** `index.html` loads the scripts in a fixed order: the pure files first (`js/core/planner.js` first, then levels, session, the drills, the log), then the app files, `main.js` last, and the self-test page.

- **Pure files** are each an IIFE. `planner.js` creates `OffensePlanner` (the shared helpers, `OFFENSE_DEFAULTS`, `TRAINING_DEFAULTS` and the registry); every other pure file takes what it needs from it, adds its own defaults sections, and adds its exports back with `Object.assign(P, …)`. A drill registers itself with `registerDrill(profile)` (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)); other self-test suites with `registerSuite(fn)`. `training-log.js` creates `TrainingLog`, and `history.js` adds to it.
- **App files** are plain scripts sharing the page's global scope: a top-level `function`, `const` or `let` in one is visible in the others, so names must be unique across them. Each element reference lives in the file that uses it (or in `shared.js` when several do). Nothing runs on load except declarations; `main.js` builds the forms, loads saved values and wires every control in `init()`, which it skips on the `?selftest=1` page.
- **Adding a drill** means a new folder with a pure file that calls `registerDrill` (and `*-ui.js` if it needs its own UI), a button in the drill switch, its `DRILLS` entry in `js/app/shared.js`, and its `<script>` tags in `index.html`.

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
                     │  index.html + styles.css                           │
                     │   ├─ Screens: start, game, set log, rest,          │
                     │   │    summary, history                            │
                     │   ├─ Pure logic (js/core, js/log, the drills)      │
                     │   │    OffensePlanner: defaults, timing math,      │
                     │   │    levels, sessions, one file per drill        │
                     │   │    (planner, validation, self-test, profile)   │
                     │   │    TrainingLog: set validation, summaries,     │
                     │   │    versioned load/save, history                │
                     │   ├─ The app (js/app, the drills' *-ui.js)         │
                     │   │    speech, Defense mode, Offense runner, forms,│
                     │   │    screens, localStorage; main.js starts it    │
                     │   └─ js/selftest-page.js: ?selftest=1 page         │
                     └────────────────────────────────────────────────────┘
```

All logic runs **in the browser**. The server only delivers files and has no game state, API or database.

The planner is kept pure on purpose: its functions take settings, spoken lengths and an injectable `rng` (default `Math.random`) and return plain data. They never touch the DOM, timers or speech. That is what lets the self-test simulate tens of thousands of drives and reps in under a second, using exactly the code the game uses. Each drill is a profile whose `planRep` returns a rep plan, and the runner (`js/app/runner.js`) only executes rep plans (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)). `TrainingLog` follows the same rule: it never touches `localStorage` itself, but reads and writes through a store object (`{ get, set }`) that the app passes in and the self-test fakes.

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

## The code in detail

### Head and viewport

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no">
```

Mobile-responsive viewport. The page extends under iPhone notches (`viewport-fit=cover`) and pads itself back with `env(safe-area-inset-*)`. Zoom is disabled so stray taps mid-drill don't zoom the page.

### Styling

All styles are in `styles.css`. Colors are CSS custom properties on `:root`:

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

- **`.segmented`**: the Defense | Offense switch and the drill switch. The selected button has `aria-pressed="true"` and a lighter background. Inside a panel (the drill switch) the track uses the page background and tighter padding.
- **`.panel`**: rounded settings panels. `.panel-section` groups one drill's settings, `.range-row` puts two fields side by side, and `.field-grid` lays out Advanced fields and weights in two columns.
- **`details.advanced`**: the collapsible Advanced and Speech sections (native `<details>` / `<summary>`).
- **`#word`**: the called word, `clamp(3rem, 16vw, 6rem)`, weight 800, uppercase. It is invisible by default (opacity 0, scale 0.85). Adding `.show` fades and grows it in over 120 ms. **`#word.long`** (over 7 characters) drops to `clamp(2rem, 10vw, 3.75rem)`, centers and allows wrapping. **`#word.xlong`** (over 18 characters, i.e. "SPRINT FROM LEFT/RIGHT CORNER") drops further to `clamp(1.6rem, 8vw, 3rem)`, which puts it on two lines at 320 px.
- **`.stepper`**: a number input between − and + buttons, each at least 48 px tall, for fields filled in by hand (the Session group).
- **`.game-header`**, **`.session-progress`**, **`.session-clock`**, **`.session-banner`**: the game screen header (mode label, the muted "SET · REP" line and the mm:ss clock in its top-right corner) and the fatigue banner above it (panel background with a yellow left border).
- **Set log**: `.log-row` puts a label (with a muted `.hint`) and a 56 px stepper on one row, wrapping to two lines on narrow screens; `.segmented.choice` is the 52 px rating row; the note is a `textarea` (16 px text so iPhone doesn't zoom). `#saveRestBtn` is the big blue primary button, `#saveEndBtn` grey, and `.log-minor` holds the outlined **Skip logging** and red **Discard** buttons. Inputs and the textarea re-enable text selection, which the page otherwise turns off.
- **Read the D**: `.word-momentum`, `.word-distance`, `.word-foot`, `.word-hands` (one color per role) and `.word-now` (the `now-flash` keyframes: yellow block fading to yellow text in 0.45 s). `.flag-field` is an on / off setting: a `.toggle-btn` with `data-flag-for` pointing at a hidden 0 / 1 input; disabled (and dimmed) while a level sets it.
- **Rest**: `.rest-count` is the huge mm:ss countdown. **`#nextSetBtn`** / **`#endSessionBtn`**: its big blue button (at least 80 px tall, shown when the rest is over) and grey secondary button.
- **Adaptive difficulty**: `.toggle-row` / `.toggle-btn` (the 88 × 48 px On/Off button, blue when on), `.level-row` with a `.small-btn` (Reset level), `.level-locked` (a field set by a level, dimmed) with its `.level-note`, and `.level-line` (the rest-screen level message).
- **Summary and history**: `.stack` stacks cards; `.drill-card` with a `.stat-grid` (a two-column `<dl>`) and `.compare-line`; `.chart` styles the inline SVG (`.axis`, `.tick`, solid `.line-make` in the accent blue, dashed `.line-lost` in orange, dots and axis titles in the same colors) and `.legend`; `.history-item` is a session row (a full-width button plus its `.history-detail` of `.set-line`s); `.confirm` is the red-bordered confirmation box; `.secondary-btn` (grey, 52 px), `.danger-btn` (red) and `.button-row` (side-by-side buttons); `.reminder` is the start-screen export reminder (yellow left border, like the fatigue banner).
- **`.countdown`**: the track and fill bar plus a tabular-number readout. The fill shrinks via `transform: scaleX(remaining / D)`. `.idle` hides it without changing the layout.
- Word color classes: `.word-left`, `.word-right`, `.word-up`, `.word-back` (Defense), `.word-read`, `.word-center`, `.word-cut`, `.word-layup` (Drive; LEFT/RIGHT variants reuse the Defense blue and green), `.word-sprint`, `.word-catch`, `.word-shot` and `.word-move` (Move Lab).

### Markup

- **Start screen**: mode switch, title, subtitle (changes with the mode and drill), Defense's Min/Max delay panel (`#rangePanel`, hidden in Offense), the offense panel and **Start**. The offense panel holds the drill switch, `#levelSettings` (the Auto difficulty toggle `#autoLevelBtn`, each drill's level with a Reset level button, and `#levelStatus`), `#driveSettings` (read time and drive window fields plus Advanced), `#readTheDSettings` (practice toggle, cue rate, decision window, Advanced with the hands / mid-dribble toggles and timing), `#moveLabSettings` (move picker, moves per rep, Advanced), the shared `#sessionSettings` group (stepper inputs with `data-training` keys into `TRAINING_DEFAULTS`) and the shared `#speech` group. The weight inputs and the Move Lab get-set inputs are generated from `OFFENSE_DEFAULTS` at load, so the form always matches the tables in code.
- **Game screen**: fatigue banner (Offense, hidden until due), mode label (`DEFENSE`, `OFFENSE · DRIVE`, `OFFENSE · READ THE D` or `OFFENSE · MOVE LAB`), set/rep line and session clock (Offense only), word stage, countdown (Offense only) and **Stop**.
- **Set log screen** (`#logScreen`, Offense only): drill label, set title, the four stepper rows, the rating buttons, the collapsed note, an error line and the save / skip / discard buttons.
- **Rest screen** (`#restScreen`, Offense only): drill label, countdown, session summary, save status, the level line (`#restLevel`, Auto difficulty only), **Next set** (hidden until the rest is over) and **End session**.
- **Summary screen** (`#summaryScreen`): session length, one card per drill (`#summaryDrills`) and **Done**.
- **History screen** (`#historyScreen`): trend cards (`#historyTrends`), the session list (`#historyList`), the backup panel (last export, export / import buttons, a hidden file input, the backup text box and the import confirmation) and **Back**. The start screen also has the **History** button and the `#backupReminder` line.

All six screens are always in the DOM, and the `.hidden` class switches between them.

### Pure logic: `OffensePlanner`

`const OffensePlanner` is created by `js/core/planner.js`; `js/core/levels.js`, `js/core/session.js`, the drill files and `js/read-the-d/scoring.js` each add their exports to it (see [Project structure](#project-structure)). Together it contains:

| Export | Purpose |
|--------|---------|
| `OFFENSE_DEFAULTS` | All tunable offense numbers (with the `moveLab` section) and the shared phrase table |
| `NEXT`, `FINISHERS`, `LONG_FINISHERS`, `SHORT_FINISHERS`, `WEIGHT_TABLES` | The Drive state machine |
| `MOVE_LAB_START_CALLS`, `MOVE_LAB_NEXT`, `MOVE_LAB_MIN_MOVES`, `MOVE_LAB_MAX_MOVES` | The Move Lab state machine and the 1–6 moves-per-rep limits |
| `PROFILES` | The drill profiles `drive` and `moveLab` (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)) |
| `cloneSettings(s)` | Deep copy of a settings object |
| `durationsFor(s, learned)` | Per-phrase length at rate 1.0: learned value if present, else `estMs` |
| `fitRate(ids, D, s, dur)` | The one speech rate a drive sequence needs in window `D`, or `null` if it can't fit |
| `minWindowFor(ids, s, dur)` | Smallest drive window a sequence fits in at `maxRate` |
| `planDrive(s, dur, rng, onPick)` | Builds one drive plan `{ D, rate, calls }` |
| `planDriveRep(s, dur, rng, onPick)` | Wraps READY, the read time and a drive into a rep plan |
| `migrateLearned(learned, done)` | Applies one-time learned-length migrations not yet in `done` (currently `read-to-ready`, which drops `READ`); returns `{ learned, done, changed }` |
| `planMoveLabRep(s, dur, rng, onPick)` | Builds one Move Lab rep plan (`onPick(state, legal, pick)` sees each MOVE-or-SHOT decision) |
| `validateOffense(s, dur)` / `validateMoveLab(s, dur)` | Setting checks per drill; return `null` or `{ field, message }` |
| `learnDuration(current, measured, rate, s)` | One learning step, or `null` for an outlier |
| `fitTable(s, dur)` | Rows for the Drive fit table |
| `TRAINING_DEFAULTS` | Session structure: reps per set, planned sets, session time warning, rest between sets, the "set done" phrase |
| `validateSession(t)` | Session settings check; returns `null` or `{ field: "session", message }` |
| `newSession()` / `beginRep(p)` / `isSetComplete(p, t)` / `beginSet(p)` | The set and rep counter. Progress is `{ set, rep }` (current set from 1, reps started in it) |
| `progressLabel(p, t, level)` | "SET 2 / 4 · REP 5 / 8", plus " · LVL 3" when `level` is given |
| `LEVEL_COUNT`, `levelPaths(drill, t)`, `applyLevel(s, drill, level, t)` | 5; the settings paths a drill's levels set; a copy of the settings with a level applied |
| `normalizeLevels(stored, t)` | Stored levels → one per levelled drill (`{ drive, readTheD }`), each 1–5 (else `startLevel`) |
| `levelDecision(level, set, cfg)` / `nextLevel(level, set, cfg)` | The adjustment rule: `{ level, change }` (`up`, `down`, `hold`, `atTop`, `atBottom`, `tooFew`, `skipped`) / just the level |
| `levelMessage(from, decision, cfg)` | The rest-screen line |
| `RTD_REVIEW_ACTIONS`, `scoreDecisions(decisions)`, `confusionText(c)`, `decisionFeedback(score, rules)` | Read the D scoring: the review choices (the four actions and FROZE), accuracy / per action / most common miss, its text, and the two rest-screen lines |
| `readTheDLevelDecision(level, set, cfg)` / `levelDecisionFor(drill, level, set, cfg)` | Read the D's adjustment rule; the rule for any levelled drill |
| `formatElapsed(ms)` | Session clock text, mm:ss |
| `sessionWarningDue(elapsedMs, t)` / `sessionWarningText(t)` | When the fatigue banner is due, and its text |
| `RTD_ORDER`, `RTD_PHRASE`, `RTD_ACTIONS`, `RTD_ACTION_NAMES` | Read the D: the fixed call order, the call for each state value, the four actions and their names |
| `correctAction(state, rules)` / `rtdStates(withHands)` / `sampleState(cfg, withHands, prev, rng)` | The correct action for a state; all 18 (or 36) states; one weighted state draw that never repeats `prev` |
| `planReadTheDRep(s, dur, rng, onPick, ctx)` / `validateReadTheD(s, dur)` / `readTheDFitTable(s, dur)` | The Read the D rep plan (with `cues`), its settings check, and the per-level sequence table |
| `repPlanProblems(plan, phrases)` | The runner contract check: a list of problems, empty for a valid plan |
| `registerDrill(profile)` / `registerSuite(fn)`, `PROFILES`, `LEVEL_DRILLS` | The drill registry (a profile with `levelled: true` joins `LEVEL_DRILLS`) and the extra self-test suites |
| `runSelfTest(log, reps)` | The simulation (every drill's self-test, then every registered suite: runner contract, learned lengths, session, levels, Read the D scoring); returns `{ passed, results, fitTable, fitTables: { drive, moveLab, readTheD } }` |

`runSelfTest(log, reps, extraSuites)` also runs each function in `extraSuites` as `suite(check)`; the self-test page passes `[TrainingLog.selfTest]`.

**`TrainingLog`** is the second pure module, created by `js/log/training-log.js`; `js/log/history.js` adds the comparison, trend, delete, import, merge and CSV functions:

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
| `trendSeries(log, drill, n)` / `trendGeometry(series, box)` | The last `n` sessions' make %, lost handles per 10 reps and decision accuracy, and their chart coordinates (`make`, `lost`, `decision`) |
| `deleteSession(log, id)` | A new log without that session |
| `parseImport(text)` / `mergeLogs(current, incoming, replaceConflicts)` | Read a backup; merge by session id (`{ log, added, identical, conflicts }`) |
| `csvField(v)` / `setsToCsv(log)` | CSV export of every set |
| `exportFileName(date, base, ext)` / `unexportedCount(log, lastExportAt)` | Backup file names; sessions not yet exported |
| `parseLog(raw)` | `{ status: "empty" \| "ok" \| "newer" \| "corrupt", log, keepRaw }`; never throws |
| `openLog(store)` / `saveLog(state, store, nowMs)` | Load from, and save to, an injected `{ get, set }` store, backing up unreadable text first; `saveLog` returns `{ state, saved }` |
| `selfTest(check)` | The training log checks |

Internally, `fitRateIn` / `minWindowIn` / `scheduleCalls` take the end buffer as a parameter, so any window can keep a buffer free at its end with the same math.

### The app (`js/app/`, `js/*/…-ui.js`)

Plain scripts sharing the global scope (see [Project structure](#project-structure)); `js/app/main.js` starts the app in `init()` unless the page is `?selftest=1`. By file: shared helpers are in `shared.js`, Defense in `defense.js`, the runner and learned lengths in `runner.js`, the settings form, toggles and persistence in `settings.js`, adaptive difficulty in `levels-ui.js`, the Move Lab picker in `js/move-lab/move-lab-ui.js`, the Read the D review in `js/read-the-d/read-the-d-ui.js`, the set log and rest in `set-log.js`, the session summary in `summary.js`, the history screen in `history-ui.js`, backup in `backup.js`, and modes, Start / Stop and wiring in `main.js`.

- **Shared helpers**: `storageGet` / `storageSet` (try/catch around `localStorage`), voice loading and `pickVoice()` (first English voice, else the first voice, else the browser default), `speak(text, { rate, cancel })`, `primeSpeech()`, `validateRange()`, `randomDelay()` and `showWord(text, className)`.
  - `speak` cancels before speaking unless `cancel: false` is passed. Defense uses the default (cancel, rate 1), and Offense passes `cancel: false` and the drive's rate.
  - `primeSpeech` speaks a silent blank utterance inside the Start tap. iPhone Safari only allows speech that starts from a user gesture, and this unlocks it for the timer-driven calls that follow.
  - `showWord` sets the text and classes, removes `.show`, forces a reflow (`void wordEl.offsetWidth`) and adds `.show` back. The reflow makes the fade-in replay reliably even when the same call (e.g. CUT OFF) repeats.
- **Modes**: each mode is an object with `start(settings)` and `stop()`. `MODES` maps `defense` / `offense` to the mode object plus its labels. `DRILLS` maps `drive` / `moveLab` to the offense game label and subtitle.
  - `defenseMode` chains `setTimeout` calls with a fresh random delay each time: pick a word, show it, speak it, schedule the next.
  - `offenseMode` runs rep plans from the selected profile, as in [Running a rep](#running-a-rep), grouped into sets. `startRep()` counts the rep, plans and schedules it, and schedules either the next rep (counting `repsCompleted` at each rep's `endMs`) or `finishSet()` (says "set done", opens the set log). `haltSet()` clears the timers and countdown for Stop mid-set but keeps the session clock; `stop()` also stops the clock. `nextSet()` starts the next set from the **Next set** tap and records the set's start time. `startClock()` updates the session clock and shows the fatigue banner once. `runCountdown()` drains the bar for one window. `later(fn, ms)` wraps every timer and records its id so `stop()` can clear them all. `say(id, rate, show)` shows and speaks a phrase and attaches the measuring handlers; a call with `show: "caption"` (practice mode's why) goes in the line under the word instead, and the next normal call clears it. For Read the D the runner keeps each rep's `plan.cues` in `repCues` (for the set log) and passes the last state as `ctx.lastState`, so the same state never comes twice in a row, across sets too. `runId` lets late `onend` events from a stopped run be ignored.
- **Settings form**: inputs carry `data-setting` paths into `OFFENSE_DEFAULTS` (e.g. `moveLab.moveGapMinMs`, `moveLab.getSetMs.CATCH.minMs`), read and written with `getPath` / `setPath`. Session inputs carry `data-training` keys into `TRAINING_DEFAULTS`, read by `readTrainingSettings()` into `settings.training`. `wireSteppers(root)` makes each − / + button inside `root` (the offense panel and the set log) step its input by the input's `step`, clamped to its `min` / `max`, and fires `input` so the value is handled like typing. `buildWeightTables()` (once per drill), `buildGetSetFields()`, `fillOffenseDefaults()`, `readOffenseSettings()` (empty fields become `NaN` so validation catches them), `saveSettings()` / `loadSettings()`.
- **`updateView`, `selectMode`, `selectDrill`**: show the right panels, labels and subtitle for the mode and drill.
- **`startGame` / `stopGame`**: validate (the Min/Max fields only for Defense and Drive, then the drill's `validate`, then `validateSession`; `showError` puts the message in the right place via `ERROR_TARGETS`), prime speech, switch screens, show the session clock and set/rep line only in Offense, start a new session record (Offense), start or stop the active mode, and cancel speech. `stopGame` ends the session and writes its end time to the log if it has saved sets. `stopPressed` (the Stop button) halts the set and opens the partial-set log instead when an Offense set has at least one finished rep.
- **Adaptive difficulty**: `levels` (from `reactionCaller.levels` via `normalizeLevels`) and `autoLevel` hold the state. `updateLevelView()` shows the levels and toggle, and with Auto on calls `lockInput()` on every setting or weight input whose path a level sets (it keeps the manual value in `data-manual-value`, makes the input read-only and adds the "set by Level N" note); `unlockInput()` restores it. `renderFlags()` / `wireFlags()` draw and handle the on / off toggles (a locked toggle is disabled). `manualValue(input)` is what `saveSettings()` and `readOffenseSettings()` use, so level values are never saved as your own. `startGame` keeps the manual settings in `runBaseSettings` and applies the level on top (`settings.level`, or `null` with Auto off). After a set is committed, `adjustLevel(set)` runs `levelDecision`, stores the new level and prepares the rest-screen line; `applyCurrentLevel()` (in the **Next set** tap) re-applies the level to `runBaseSettings` for the next set, keeping the spoken lengths validated at Start (if those settings don't validate, the previous ones are kept).
- **Summary, history and backup**: `showSummary(session)` builds one `drillCard` per drill from `summarizeByDrill` and `compareWithPrevious`. `openHistory()` renders `renderTrends()` (one `trendChart(series)` inline SVG per drill, from `trendGeometry`), `renderSessionList()` (rows that expand into `sessionDetail` with the delete confirmation) and `renderLastExport()`. `exportJson()` / `exportCsv()` use `downloadText()` (a `Blob` and an `<a download>` click), falling back to `showBackupText()`. `importText()` parses with `parseImport`, previews with `mergeLogs` and asks via the confirmation box when sessions conflict; `applyImport(replace)` merges and saves. `saveTrainingLog(log)` saves any changed log; `updateBackupReminder()` runs on load and on every return to the start screen (`showStart()`).
- **Read the D review**: `decisionsOf(repCues)` turns the runner's `repCues` (finished reps only) into decision records; `reviewItems` holds each one's ✓ / ✗ state and pick; `renderReview()` draws the rows, `reviewedDecisions()` reads them back (or shows why it can't), and **All correct** resets them. `commitSet` stores the rest-screen lines (`decisionFeedback`) and `adjustLevel` uses `levelDecisionFor`.
- **Set log and rest**: `trainingLog` is the state from `TrainingLog.openLog(logStore)` (`logStore` wraps `storageGet` / `storageSet`). `openSetLog(partial)` fills the form for the set that just ended, with its settings snapshot. `commitSet()` validates with `TrainingLog.validateSet`, adds the set to the session and saves the whole log (`persistSession` → `upsertSession` + `saveTrainingLog` → `saveLog`). `showRest()` runs the rest countdown and shows `summarizeSession`; `startNextSet()` primes speech and starts the next set.

### Self-test page (`js/selftest-page.js`)

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
- **No mixed drill yet.** Each Start runs one drill. The code is structured for a mixer (see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)), but it isn't built.
- **Move Lab: the get-set time is not checked against how long the sprint really takes you.** Tune the `getSetMs` ranges to your court and speed.
- **Results are self-reported.** You count shots, lost handles and missed calls yourself and enter them after the set; there is no automatic scoring or reaction-time measurement.
- **The log lives in one browser, at one address.** Clearing site data (or Safari clearing it after weeks without a visit) deletes it, and `file://`, `http://localhost:8080` and `http://<LAN IP>:8080` each keep a separate log. Export regularly from **History**; importing a backup at a new address merges it in.
- **Trends are per drill and per session.** Make % and lost handles (and decisions right % for Read the D) are drawn on two axes in one small chart;
- **Read the D decisions are self-reported.** You mark the reps you got wrong after the set, from memory; with long sets it gets harder to remember each rep. missed calls and clean share are only in the session summary and the session list.
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
| Offense: the Min/Max delay fields disappeared | They are Defense only. Drive has its own **Min / Max read time** fields | Expected. Drive read time defaults to 800–3500 ms; a value you saved in the old shared fields stays with Defense |
| Move Lab: LEFT/RIGHT comes later than its get-set min | The get-set time is clamped to at least the start call's length + min gap (the defaults already respect this; it acts if you lower a min or the voice is slow) | Expected. Lower the min gap or raise the base rate if you want it sooner |
| Settings saved before the Session group, or for the removed Shooters only drill | They load as before; the new fields start at their defaults. Shooters' get-set and nope gap values load into Move Lab | Nothing to do |
| The Shooters only drill is gone | It was removed. Its logged sets stay in History (with their own trend while the log holds them) and in exports | Expected |
| "Reps per set must be a whole number from 3 to 30." (or planned sets / session time warning) | A Session value is out of range or empty | Use the − / + steppers, which stay within range |
| Offense stopped calling after a few reps and shows the set log | The set has ended (Reps per set reached) | Log it and tap **Save & rest**, then **Next set** when the rest is over |
| "Couldn't save to this device. Storage may be blocked or full." | Private browsing, blocked site data or full storage | Training continues, but this set isn't kept. Allow site data for the app's address |
| Pressing Stop went straight to the start screen instead of the log | No rep of that set had finished yet, so there was nothing to log | Expected |
| History is empty on the phone, but sessions were logged | The app was opened at a different address (e.g. the computer's LAN IP changed), or Safari cleared site data | Open the old address if it still works, or import your latest JSON backup from **History** |
| Export does nothing / no file appears | The browser blocked or doesn't support downloads | Use **Backup as text** → **Copy**, and paste it into a note or a file |
| "This backup is from a newer version of the app" | The backup was made by a newer app version | Update the app files, then import |
| The page is unstyled, or nothing happens on Start | `styles.css` or a file under `js/` is missing next to `index.html` (e.g. only `index.html` was copied) | Copy the whole folder: `index.html`, `styles.css` and `js/` |
| A `reactionCaller.log.backup.…` key appeared | The stored log couldn't be read (broken, or written by a newer version), so it was kept aside before a new log was started | Nothing is lost. The raw text is in that key |

---

## Ideas for future work

- A **mixed** offense drill that picks a drill at random per rep (another profile; see [Drill profiles and rep plans](#drill-profiles-and-rep-plans)).
- A "Reset to defaults" button and a way to view or clear learned lengths from the UI.
- Charts for missed calls and clean share, and a per-week view.
- Tune the level thresholds from real logs, e.g. adjust over the last two or three sets instead of one, and chart the level in History.
- An option to prevent the same Defense word twice in a row.
- Voice picker and a mute toggle (visual-only mode).
- Harden the server: serve only the app's files, map `/?…` to `index.html`, use a `ROOT + path.sep` prefix check, and make the port configurable.
- Make it a PWA (manifest + service worker) so it can be installed to the home screen and work offline.
