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

## Desktop app

- [ ] macOS: on the first “Connect”, macOS asks for Bluetooth. Does the chooser with the treadmill appear afterwards? Is the prompt text in the system language?
- [ ] Second connect with “connect automatically” ticked: is the treadmill selected without the chooser? Log: `Automatically selected the last connected device`.
- [ ] Global shortcut: another app in the foreground, Cmd+Shift+Space. Log: `Global stop shortcut`, `→ 08 01`. (Registering works on macOS without extra permissions; triggering it is still untested.)
- [ ] Windows: chooser and, if the treadmill wants to pair, the PIN dialog.
