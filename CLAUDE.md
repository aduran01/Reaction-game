# CLAUDE.md

Ground rules for working on Reaction Caller. Follow them in every session. Offense mode is being turned into a measured training system over a series of prompts; these rules apply to all of them.

## Project shape

- The whole app is `index.html`: one self-contained file. No libraries, no build step, no `package.json`, no extra JS or CSS files.
- **Do not modify `server.js`.**
- `README.md` documents the app in detail. Read it, and `index.html`, before changing anything.
- `index.html` has three `<script>` blocks:
  - **Script 1** `OffensePlanner`: pure logic (defaults, state tables, planning, validation, self-test).
  - **Script 2**: the app (DOM, speech, timers, `localStorage`).
  - **Script 3**: the `?selftest=1` page.

## Target device and visual design

- **iPhone Safari is the main target.** Keep the dark theme and the existing visual language (CSS variables on `:root`, `.panel`, `.segmented`, `details.advanced`, the call color classes).
- There are two reading distances, and they need different design:
  - **Game screen**: read from 3–4 m away while dribbling. Calls must stay huge and high-contrast. Don't add small text or clutter the game screen.
  - **Forms the player fills in by hand** (e.g. entering results after a set): touch targets at least **48 px**, and **number steppers (− / +)** instead of tiny inputs. Hands may be sweaty.

## Behavior that must not change

- **Defense mode keeps behaving exactly as it does now**: same words, colors, random delay loop, and cancel-before-speak.
- **Offense mode never calls `speechSynthesis.cancel()` between calls.** Only Stop cancels speech. Calls are planned so they never overlap.

## Where logic goes

- Planning, scoring and progression logic goes in **pure functions in Script 1**: inputs in, data out, an injectable `rng` that defaults to `Math.random`, and no DOM, timers, speech or storage access.
- **Every new pure function gets checks in the `?selftest=1` simulation.** The whole self-test must pass before you commit.
  - Run it in a browser at `http://localhost:8080/index.html?selftest=1` (not `/?selftest=1`), or extract Script 1 and run `OffensePlanner.runSelfTest(console.log)` under Node.

## Tunable numbers

- Every tunable number lives in a clearly commented defaults object: `OFFENSE_DEFAULTS` for drill timing and speech, or a new `TRAINING_DEFAULTS` for logging and progression. No magic numbers scattered in code.
- Mark heuristic thresholds (guesses that need real-world tuning) with a `// provisional` comment.

## Storage

- Every `localStorage` access stays wrapped in `try/catch`. The app must work fully with storage blocked.
- Stored data that holds the training log must carry a schema `version`.
- **Never delete or overwrite saved log data because it failed to parse.** Keep the raw string (e.g. under a backup key) and start a new log alongside it.

## Out of scope

- No camera, microphone input, motion sensors, computer vision or network calls.
- The player enters results by typing or tapping **at the end of a set, never during a set**.

## Workflow for each prompt

- Work on the `training-system` branch. Make one or more commits, one per logical step.
- Update `README.md` to match every change, including the self-test check count.
- Finish with a short summary listing the files changed, the commits, and every assumption made.
- If something is ambiguous, choose the simplest reasonable option, keep going, and list the assumption in the summary.
