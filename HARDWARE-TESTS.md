# Hardware tests

Things that can only be checked on the real treadmill. Record the results here (date, firmware, what the log said).
Always: safety key inserted, low speed, start while standing on the side rails.

Log lines below are quoted in English. Either switch the app to English (language picker at the top right) to compare them word for word, or compare the hex bytes, which are the same in every language.

## Changed compared with the prototype, please double-check

- [ ] **Connecting.** Same sequence as the prototype, except that the notification listener is now registered *before* `startNotifications`. Expected in the log: `Device: …`, `Manufacturer: …`, `Speed range: …`, `→ 00`, `← Request Control: OK`, then live values come in.
- [ ] **Ramp.** At 2 km/h press preset 5. Expected: `→ 02 fa 00` (2.5), `02 2c 01` (3.0), `02 5e 01` (3.5), `02 90 01` (4.0), `02 c2 01` (4.5), `02 f4 01` (5.0), each at least 1.5 s apart and with `← Set Speed: OK`. Suspicious would be: missing responses, `failed`, or the belt jerking at every step.
- [ ] **Stop takes priority.** Press Space during a ramp. Expected: `→ 08 01` comes right after the write in progress, possibly with `dropped: 02 …`. The belt stops.
- [ ] **Lowering the limit while the belt runs.** At 5 km/h set the limit to 4. Expected: `Limit lowered, regulating to 4.0 km/h` and `→ 02 90 01`.

## Machine Status (controls program abort)

- [ ] Stop button on the device/remote while the belt is running. Which `ℹ Status` line comes? According to FTMS `02 01` (stopped) or `02 02` (paused).
- [ ] Pull the safety key. According to FTMS `03`.
- [ ] Change the speed on the remote. According to FTMS `05 <LSB> <MSB>`.
- [ ] Does `ff` (control lost) ever come?

If the treadmill sends different status bytes or none at all, please note the hex values. They decide whether a program ends immediately; otherwise only the standstill detection after 8 s kicks in.

## Not yet tested

- [ ] **Incline.** Move the slider. `← Set Inclination: OK` or `not supported`? What does `Inclination range` say when connecting?
- [ ] **Heart rate.** Does the log say `Heart rate service subscribed`? Do values come in?
- [ ] **Countdown.** How long does the treadmill count down after start? The program waits 4.5 s before setting the first speed.
- [ ] **Program transitions.** Program `0.5 2` / `0.5 3` / `0.5 2`. Changes at the right time? Cancel a program with the stop button on the device: does it end (status line or `Belt stopped, program ended`)?
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

- [ ] Make a workout with one distance step of 50 m at about 3 km/h (**Workouts → New workout**, unit `m`), select it, start it from **Training**. Watch the status line: the remaining metres should count down roughly once per second.
- [ ] When it reaches 0, the belt should stop. Compare the distance on the treadmill’s display with 50 m: how far off is it (at 3 km/h one metre is about 1.2 s)?
- [ ] Log while it runs: is there a speed command at the start of the step and no further ones? If `Distance not advancing` shows up while the belt is moving, please note the text and whether the treadmill’s distance display moved.
- [ ] Mixed workout: a time step, then a distance step, then a time step. Does the second time step really last its full time after the distance step ended?
- [ ] Press Stop (button, Space or Esc) during a distance step: belt stops and the program ends, nothing restarts it.
- [ ] Reconnect case: does the treadmill reset its distance counter when you start the belt, or only after a stop? (The app handles both: a counter that jumps back adds nothing for that update.)

## Routes

A route only displays progress. It follows the treadmill’s own distance counter and sends nothing to the treadmill: no speed, no incline. Nothing in this section can move the belt.

- [ ] Import a real GPX file (**Routes → Import GPX file**) and choose it in the **Training** route card. Start the belt and walk 100 m: does “km of km” advance together with the distance shown on the treadmill’s display? Note how far apart the two are after 100 m.
- [ ] Press **Restart route**: the progress goes back to 0 and counts on from there, the belt is not affected.
- [ ] Stop the belt and start it again: does the route continue where it was, or did the treadmill’s counter reset and the route lose or double distance? (The app adds up only increases; a counter that goes back adds nothing.)
- [ ] Disconnect and reconnect in the middle of a route: does the progress carry on without a jump?
- [ ] The slope shown for the next 100 m is only information about the file. Check that the treadmill’s incline did not change at all while you walked.

## Desktop app

- [ ] macOS: on the first “Connect”, macOS asks for Bluetooth. Does the chooser with the treadmill appear afterwards? Is the prompt text in the system language?
- [ ] Second connect with “connect automatically” ticked: is the treadmill selected without the chooser? Log: `Automatically selected the last connected device`.
- [ ] Global shortcut: another app in the foreground, Cmd+Shift+Space. Log: `Global stop shortcut`, `→ 08 01`. (Registering works on macOS without extra permissions; triggering it is still untested.)
- [ ] Windows: chooser and, if the treadmill wants to pair, the PIN dialog.
