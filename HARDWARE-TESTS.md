# Hardware tests

Things that can only be checked on the real treadmill. Record the results here (date, firmware, what the log said).
Always: safety key inserted, low speed, start while standing on the side rails.

Log lines below are quoted in English. Either switch the app to English (language picker at the top right) to compare them word for word, or compare the hex bytes, which are the same in every language.

## Results so far: Sportstech sPad 500, desktop app on macOS, 2026-11-09 (BLE module FITHOME JJ-BT2-DL, HW 2.0, FW 1.023)

A walking pad: it has **no safety key** (nothing to hold on to), so all “pull the safety key” checks do not apply to it. Still open and to be done in a second session: everything under “Not yet tested” that is not ticked, History, Workouts (distance steps), Routes, Settings and training view, Units and the rest of the Desktop app list.

- Connecting, Request Control, start, stop, the ramp in 0.5 km/h steps and Stop during a ramp work as expected.
- **Device stop** (button on the treadmill) gives `ℹ Status 02 01` (stopped) after about 4–7 s, not `02 02`. Start on the device and a speed change on the device are noticed by the app through the live values.
- **No `05` (target speed) and no `03` (safety key) status ever came.** The treadmill changes its speed in 0.1 km/h steps on the device without telling us in the Machine Status. Whether `ff` (control lost) ever comes is not recorded.
- **Countdown after start:** about 3 s (the program waits 4.5 s, so it sets the first speed after the belt has started).
- **Incline:** `Set Inclination` is accepted, the belt follows after about 5 s. The treadmill’s display shows **levels, not percent**: the app sent 1.0 %, 3.0 % and 0 % (`03 0a 00`, `03 1e 00`, `03 00 00`) and the display showed level 1, 3 and 0. The range “0 to 5 %” in the log is levels 0 to 5. The real slope of a level is unknown.
- **Starting speed (finding):** the treadmill remembers the last `Set Speed`, also one set before the start, and runs up to it by itself after `Start` (0 to 2 km/h slowly in the test). Fixed in the app: after `Request Control` it now sends `Set Speed` with the lowest speed of the device (`→ 02 64 00` for 1.0 km/h) and only then `Start`. Confirmed on the treadmill on 2026-11-10, see below.
- Texts that ask for the safety key are wrong for this device; the “%” label for the incline is wrong for level-based treadmills.

## Changed compared with the prototype, please double-check

- [x] **Connecting.** Same sequence as the prototype, except that the notification listener is now registered *before* `startNotifications`. Expected in the log: `Device: …`, `Manufacturer: …`, `Speed range: …`, `→ 00`, `← Request Control: OK`, then live values come in.
- [x] **Ramp.** At 2 km/h press preset 5. Expected: `→ 02 fa 00` (2.5), `02 2c 01` (3.0), `02 5e 01` (3.5), `02 90 01` (4.0), `02 c2 01` (4.5), `02 f4 01` (5.0), each at least 1.5 s apart and with `← Set Speed: OK`. Suspicious would be: missing responses, `failed`, or the belt jerking at every step.
- [x] **Stop takes priority.** Press Space during a ramp. Expected: `→ 08 01` comes right after the write in progress, possibly with `dropped: 02 …`. The belt stops.
- [x] **Starting speed.** The speed was 1.5 km/h before the start. Expected: `→ 00`, `→ 02 64 00`, `→ 07`, each answered with OK, and then the ramp from 1.0 km/h, with no jump to the old speed. *sPad 500, 2026-11-10: exactly that; the belt started at 1.0 km/h and the app ramped up in 0.5 km/h steps (a route run, 2.54 km in 31:31, up to 6.0 km/h).*
- [ ] **Lowering the limit while the belt runs.** (The settings are locked while the belt runs, so this cannot happen any more; the item is obsolete.) At 5 km/h set the limit to 4. Expected: `Limit lowered, regulating to 4.0 km/h` and `→ 02 90 01`.

## Machine Status (controls program abort)

- [x] Stop button on the device/remote while the belt is running. Which `ℹ Status` line comes? According to FTMS `02 01` (stopped) or `02 02` (paused). *sPad 500: `02 01`, after about 4–7 s.*
- [ ] Pull the safety key. According to FTMS `03`. *sPad 500: no safety key, not applicable. Still open for treadmills with one.*
- [x] Change the speed on the remote. According to FTMS `05 <LSB> <MSB>`. *sPad 500: no `05` comes.*
- [ ] Does `ff` (control lost) ever come?

If the treadmill sends different status bytes or none at all, please note the hex values. They decide whether a program ends immediately; otherwise only the standstill detection after 8 s kicks in.

## Not yet tested

- [x] **Incline (asks the treadmill).** *sPad 500: works, shows levels (see results above).* After connecting, the log has `Features: …`, `Controllable: …` and, if readable, `Inclination range: …`. Note all three lines. If `Controllable` has no `Inclination`, the card “Incline”, the incline figure and the incline fields of the workout editor must not be shown, and the log says `This treadmill does not report incline control`. If it has `Inclination` and incline levels are set (Settings → Treadmill), the card appears: press a level; `← Set Inclination: OK` or `not supported`? Does the treadmill’s incline really change, and does the figure in the app follow?
- [ ] **Incline levels.** Settings → Treadmill → Incline levels: set the slider to the number of levels of the treadmill (for the sPad 500: 5). The card then shows one numbered button per level; the levels are spread evenly from the lowest to the highest incline in `Inclination range` (both ends included), the button’s tooltip says the percent. Press each: `→ 03 …` in the log with that value (percent × 10, little endian), and the treadmill goes to that level? Which percent does each level of the treadmill really have? (That decides whether a percent per level has to become configurable.) The slider offers none, then 2 to 10 (no single level). With “none” the card and the incline figure disappear from the training view.
- [ ] **Heart rate.** Does the log say `Heart rate service subscribed`? Do values come in?
- [x] **Speed chosen while standing.** Connect with the belt standing, choose 3.0 km/h (slider or a button), then press Start. Expected: while standing, no `→ 02 …` in the log, only `Target 3.0 km/h: approached in steps once the belt is running`; after Start `→ 00`, `→ 02 64 00`, `→ 07`; the belt starts at 1.0 km/h, and once the live speed shows it moving the app ramps up in 0.5 km/h steps (`→ 02 96 00`, `→ 02 c8 00`, …) to 3.0 km/h, at least 1.5 s apart. Stop before the ramp ends: the rest of the ramp is not sent, and the next Start begins at 1.0 km/h with no target.
- [x] **Countdown.** *sPad 500: about 3 s.* How long does the treadmill count down after start? The program waits 4.5 s before setting the first speed.
- [ ] **Program transitions.** Program `0.5 2` / `0.5 3` / `0.5 2`. Changes at the right time? Cancel a program with the stop button on the device: does it end (status under the speed or `Belt stopped, program ended`)?
- [ ] **Reconnecting.** Disconnect, connect again: `← Request Control: OK` and live values again?
- [ ] **Connection loss** (the dangerous assumption). At 2 km/h, standing on the side rails, turn off Bluetooth on the computer. Does the belt keep running, does it stop, after how long? Record the result here and in the project description. The app shows the warning in any case.

Result connection loss: *(still open)*

## History

Saving runs only reads the live values the app already receives; it sends nothing to the treadmill.

- [ ] Walk at least 1 minute, then stop. Right after disconnecting, or 5 minutes after the stop, the log says `Run saved: <km> km, <time>`. Does the distance match the treadmill’s display?
- [ ] Stop on the treadmill and start again within 5 minutes: is it one run with a pause, and does the distance keep counting after the treadmill has reset its counter?
- [ ] Stop the belt, then close the app without disconnecting. After reopening, is the run in the history (it is saved every 15 s)?
- [ ] `⚠ Could not save the run` should never appear. If it does, please note the text after the colon.

## Workouts (distance steps)

Time steps work as before. A distance step ends when the treadmill’s own distance counter has advanced by that amount since the step began; the app sends nothing new to the belt for it (the same speed commands as for a time step). Speed limit, ramp and Stop are unchanged.

- [ ] Make a workout with one distance step of 50 m at about 3 km/h (**Workouts → New workout**, unit `m`), select it, start it from **Training**. Watch the workout panel (“to go”): the remaining metres should count down roughly once per second.
- [ ] When it reaches 0, the belt should stop. Compare the distance on the treadmill’s display with 50 m: how far off is it (at 3 km/h one metre is about 1.2 s)?
- [ ] Log while it runs: is there a speed command at the start of the step and no further ones? If `Distance not advancing` shows up while the belt is moving, please note the text and whether the treadmill’s distance display moved.
- [ ] Mixed workout: a time step, then a distance step, then a time step. Does the second time step really last its full time after the distance step ended?
- [ ] Press Stop (button, Space or Esc) during a distance step: belt stops and the program ends, nothing restarts it.
- [ ] Reconnect case: does the treadmill reset its distance counter when you start the belt, or only after a stop? (The app handles both: a counter that jumps back adds nothing for that update.)
- [ ] Incline per step is stored and shown only. Run a workout whose steps have an incline (`5 min 3 incl 4`): the log must show speed commands only, no `Set Inclination`, and the treadmill’s incline must stay where it was.

## Routes

The route’s progress follows the treadmill’s own distance counter. The route itself sends nothing to the treadmill: no incline, and no speed from the file. The checks up to “Restart route” only display; **Start** with a route chosen starts a workout (see below), so the belt moves only after the usual confirmation.

- [ ] Import a real GPX file (**Routes → Import GPX file**) and choose it with **Use** (the training view is about it then). Start the belt and walk 100 m: does “km of km” advance together with the distance shown on the treadmill’s display? Note how far apart the two are after 100 m.
- [ ] With a route chosen, the progress bar, “km of km · km to go · about N min left” sit above the map, the length, speed and description below it. The time left is the distance left at the route’s walking speed (capped by the limit), rounded up to whole minutes. Over a longer walk, does it match the clock?
- [ ] Press **Restart route**: the progress goes back to 0 and counts on from there, the belt is not affected.
- [ ] Stop the belt and start it again: does the route continue where it was, or did the treadmill’s counter reset and the route lose or double distance? (The app adds up only increases; a counter that goes back adds nothing.)
- [ ] Disconnect and reconnect in the middle of a route: does the progress carry on without a jump?
- [ ] The slope shown for the next 100 m is only information about the file. Check that the treadmill’s incline did not change at all while you walked.

### Walk this route (route as a workout)

With a route chosen, **Start** (its tooltip reads “Strecke gehen” / “Walk this route”) is one workout step: the whole route as a distance step at the route’s own walking speed (**Routes** → open a route with the arrow → pencil icon, default 3 km/h). Speed steps, limit, confirmation and stop work as for every workout. Please check in the log:

- [ ] Start a short route (about 200 m) at a low speed (3 km/h). The confirmation names the route, its length and the speed. After confirming, the log shows Request Control and Start, then speed commands that follow the ramp (0.5 km/h per command, at least 1.5 s apart). There is no incline command at all.
- [ ] Give the route a walking speed above your limit (**Routes** → arrow → pencil icon): the confirmation says it is capped, and the belt never goes above the limit.
- [ ] Let it run to the end: the belt stops by itself, the status says the program is done, and the route card says “Route completed”. How far apart are the route progress and the end of the program on the treadmill’s display? (Both use the distance counter, a few metres are expected.)
- [ ] Press **Stop** or Space halfway: the belt stops at once. The run appears in the history as “Started from: Route: …, stopped early”.
- [ ] After a complete walk of more than a minute the run shows “completed”, and its minutes count toward today’s goal in **Workouts → week plan**. Check that the minutes match the treadmill’s time (they are moving seconds without pauses).
- [ ] Walk a route while today has a target in the week plan: the training view says how many minutes are left and whether this route reaches the goal. It refreshes after a run was saved.

### Map (optional)

The map only draws. It reads the position the route card already has and sends nothing to the treadmill.

- [ ] Switch the map on in the training view (route chosen), then walk a route (with or without the map the log must look the same: same commands, same spacing, no extra writes). The blue-green dot should move along the line together with “km of km”.
- [ ] With the map on, press Space/Esc and **Stop** during a walk: the belt stops as fast as without the map.
- [ ] Take the computer offline while the map is on: the route card keeps counting, the map shows a hint, the belt is not affected.

## Settings and training view

The settings dialog and the training view only change what is shown, plus one setting (quiet mode) that skips the question before a start.

- [ ] Start the belt (any way). The settings button in the header is greyed out while the belt runs, and available again a few seconds after it stopped. Also check this after a connection loss and after stopping on the treadmill itself.
- [ ] **Settings → Safety → Hide warnings and safety questions**: switching it on asks first. Then press **Start** and start a workout: the belt starts without the “Band starten?” question. The log must still show the usual ramp (0.5 km/h per command, at least 1.5 s apart), the speed limit still caps a higher target, and Space/Esc still stops at once. A raw Start (`07`) in the experiment console (Settings → General → Developer mode) still asks.
- [ ] With quiet mode on, pull the safety key or disconnect: the alarm for the lost connection still appears.
- [ ] With a workout or a route chosen, **Start** starts exactly that, and nothing else (no free start). With nothing chosen (“Stattdessen frei trainieren”), Start begins free training as before. Pressing Start again while a program runs does nothing.
- [ ] Run a workout with several steps: the main element shows the current step (target speed, time or distance left), the strip of all steps and the next steps. Compare the step changes with the treadmill’s display and with the log (speed commands at the step boundaries).
- [ ] Choose a route and switch the map on: the map is the main element of the training view, also while the route is walked. During a workout with steps the steps are shown instead.

- [ ] **Banner over the figures** (display only, nothing is sent). Press **Start** (confirm): the box with the speed turns green with “Mach dich bereit, das Band startet gleich …” and fades out over about 4.5 s, earlier if the belt already moves. Is it gone about when the belt starts to move? Press **Stop** (button, Space or Esc, also the stop on the device and the safety key) while the belt runs: the box turns red (“Band stoppt …”), the stronger the slower the belt is, “Band steht” when it stands, and after 3 s the normal display. Stop must work exactly as fast as before. Without a connection (also after pulling the Bluetooth) the box has a grey overlay “Nicht verbunden. Jetzt verbinden”, and the link opens the connection menu.

- [ ] **Buttons follow the belt.** With a connection and the belt standing, **Start** is available and **Pause** is greyed out. After a start Start is greyed out (while the belt runs, also while the treadmill counts down, and while a program runs) and Pause is available. **Stop** must never be greyed out while connected, in no state: press it with the belt standing and while it runs. Start the belt with the treadmill’s own remote: does Start grey out in the app once the speed is reported? Stop it on the treadmill: does Start come back (also if the treadmill reports nothing when it stands: after 5 s)?

### Units (km/h or mph)

**Settings → General → Units** only changes what is shown and typed. Everything stored, sent and checked stays km/h and metres: the limit of 6 km/h, the step of 0.5 km/h per command, the lines in the log of the experiment console. Please check with the belt running in **Imperial**:

- [ ] The speed on the treadmill’s display (km/h) matches the speed shown in the app in mph (km/h ÷ 1.609). Same for the distance (km ÷ 1.609 = mi).
- [ ] **+** and **−** change the target by half a mph (0.8 km/h). In the log, the commands still go up in steps of at most 0.5 km/h, at least 1.5 s apart.
- [ ] The default limit shows as 3.73 mph. Typing 3.7 mph keeps the 6 km/h limit and asks nothing; typing 3.8 mph asks for the confirmation (it is above 6 km/h). With the limit at 3.7 mph, a target above it is capped at 6.0 km/h in the log.
- [ ] A workout with distance steps (in feet or miles) ends its steps at the treadmill’s distance counter, as in metric.
- [ ] Switch back to Metric: the same values show as km/h and km again.

## Desktop app

- [ ] macOS: on the first “Connect”, macOS asks for Bluetooth. Does the chooser with the treadmill appear afterwards? Is the prompt text in the system language?
- [ ] The chooser lists only devices with a name (the treadmill, e.g. `sPad500-…`); the nameless ones (“Unbekanntes oder nicht unterstütztes Gerät (…)”) are behind “Show N nameless devices”. Is the treadmill listed without opening that link? If it only shows up there, note what its entry says: the filter then needs another rule.
- [ ] Second connect with “connect automatically” ticked: is the treadmill selected without the chooser? Log: `Automatically selected the last connected device`.
- [ ] Global shortcut: another app in the foreground, Cmd+Shift+Space. Log: `Global stop shortcut`, `→ 08 01`. (Registering works on macOS without extra permissions; triggering it is still untested.)
- [ ] Windows: chooser and, if the treadmill wants to pair, the PIN dialog.
- [ ] **Developer tools.** Without developer mode the View menu has no “Toggle Developer Tools” and Cmd+Alt+I (Ctrl+Shift+I) does nothing. Switch **Settings → General → Developer mode** on (it asks first): the entry appears and the experiment console shows in the training view. Open the tools, switch the mode off again: the tools close and the entry goes away.
- [ ] **Route package file.** Export a route as package (**Routes → ⋯ → Export as package**) and look at the `.walkflow` file in the Finder / Explorer: does it show the sheet icon with the green double arrow (also in a list view and as a small icon)? Double click it: Walkflow opens (or comes to the front, if it is running), shows the Routes view and asks “Import this route?”; **Import** adds it as a new route, **Cancel** adds nothing. Also try “Open with” and, with Walkflow running, a second double click. A text file renamed to `.walkflow` must be refused with a message, not imported. (macOS: the icon may need a moment or `killall Finder` after the first install; Windows: it appears after the installer has run.)
- [ ] **Workout package file.** Export a workout (**Workouts → ⋯ → Export as package**) and double click the `.walkflow` file: Walkflow opens the **Workouts** view and asks “Import this workout?” (not the Routes view, although the extension is the same); **Import** adds a new workout and selects it, **Cancel** adds nothing. A route package opened the same way still goes to Routes. Check the speed note in the question: a workout with a step above your speed limit must run at your limit, not above it (watch the speed in the log).
- [ ] **Updating itself (Windows and the Linux AppImage; needs two published releases, e.g. 0.1.0 installed, then 0.1.1 published).** Open the old app: after a moment the banner says “Walkflow 0.1.1 is available” with **Download and install**. Nothing has been downloaded before you click (check the app's update folder: `%LOCALAPPDATA%\walkflow-updater` on Windows, `~/.cache/walkflow-updater` on Linux). Click: the banner shows the percentage (a few MB if the blockmap was used, the whole installer otherwise), then “Walkflow 0.1.1 is installed. Restart to finish the update.” with **Restart now**. Connect to the treadmill (or the demo) first: **Restart now** must refuse and say to disconnect first. Disconnect, click again: the app closes, starts again as 0.1.1 (Settings → Info), the settings, runs and routes are still there. Also: with “check for updates” switched off nothing is requested; with no internet the banner stays hidden; after an interrupted download the next check offers it again.
- [ ] **macOS update.** The macOS app is not signed, so the banner only opens the release page. Check that it does, and that it does not offer “Download and install”. (Once builds are signed and notarized, this item becomes the same test as above.)
- [ ] **Community in the desktop app** (not in the first release: only in a build with `WALKFLOW_COMMUNITY=on`). Switch **Community** on in the desktop app and in a browser (or a second computer): do they find each other (the status says “Connected to 1 device”)? Take a workout from one to the other: the question appears, it is saved, and the other side then lists it as offered by one more device. Check that the macOS firewall question (incoming connections) does not block it, and that switching Community off ends the connection (the other side forgets the device).

## Stop and Start, hardened (partly confirmed on a treadmill)

Covered by tests without hardware (`belt.test.ts`, `ble.test.ts`, `live-data.test.ts`, `safety.test.ts`); what only a treadmill can show:

- [x] **Stop on a running belt (route run, sPad 500, 2026-11-10).** `→ 08 01` was answered with `← Stop/Pause: OK` at the first try, so no repeat was needed. `ℹ Status 02 01` came about 8 s later (a bit more than the 4–7 s seen before). No console error; the only warning was `Image "wood-pattern" could not be loaded` from the map library (harmless). The repeat and the refusal paths below are still not seen on a treadmill.
- [ ] **Stop during the start.** Press Start, confirm, and press Space at once (while `→ 00` / `→ 02 64 00` are still going out). Expected: `→ 08 01` is the last command in the log, no `→ 07` after it, and the belt does not start. Before this change `→ 07` could follow the stop.
- [ ] **Stop on a standing belt.** Connected, belt standing, press Stop. Which answer comes: `← Stop/Pause: OK` or `failed`? The warning “The treadmill did not take the stop” must *not* appear (it only appears while a speed above 0 is reported). Note the answer here.
- [ ] **Pause while standing, Start while running:** note the `←` answers as well; a refused Set Speed (`← Set Speed: …` other than OK) now ends the ramp with `The treadmill refused the speed`.
- [ ] **Stop that does not get through.** Hard to provoke on purpose; if `Write error` follows a `→ 08 01`, the log must show the stop up to three times, about 0.3 s apart, and then the red warning.
