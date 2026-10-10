// ?selftest=1: run the offense planner simulation and show the results.
(function () {
  if (new URLSearchParams(window.location.search).get("selftest") !== "1") return;

  document.getElementById("app").classList.add("hidden");
  const banner = document.createElement("pre");
  banner.style.cssText = "margin:0;padding:16px;white-space:pre-wrap;font-size:13px;line-height:1.5;";
  document.body.appendChild(banner);

  const lines = [];
  const log = line => {
    console.log(line);
    lines.push(line);
  };

  log("Reaction Caller self-test (every drill, levels, session and the training log)\n");
  const result = OffensePlanner.runSelfTest(log, 10000, [TrainingLog.selfTest]);
  console.table(result.fitTables.drive);

  const s = OffensePlanner.OFFENSE_DEFAULTS;
  lines.push("\nDrive fit table: minimum drive window at maxRate " + s.maxRate + ", minGap " + s.minGapMs +
    " ms, buffer " + s.finisherBufferMs + " ms (driveMaxMs " + s.driveMaxMs + ")");
  result.fitTables.drive.forEach(r => {
    lines.push(r.cutOffs + " cut-offs  " + (r.finisher + "                  ").slice(0, 19) +
      String(r.minWindowMs).padStart(5) + " ms  fits: " + r.fitsAtDriveMax);
  });

  // Read the D: how long reps run (the drill's self-test returns this table).
  const lengths = result.fitTables.readTheD;
  console.table(lengths);
  lines.push("\nRead the D: rep length from GO to the end of the window, by first read (" + lengths[lengths.length - 1].reps + " reps)");
  lengths.forEach(r => {
    lines.push(r.entry.padEnd(12) + String(r.reps).padStart(6) + " reps  avg " + String(r.avgMs).padStart(5) + " ms  longest " +
      String(r.maxMs).padStart(5) + " ms  calls avg " + r.avgCalls + ", max " + r.maxCalls);
  });

  banner.style.color = result.passed ? "#4fd87c" : "#ff4f5e";
  banner.textContent = lines.join("\n");
})();
