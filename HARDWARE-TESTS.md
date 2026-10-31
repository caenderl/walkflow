# Hardware-Tests

Dinge, die nur am echten Band geprüft werden können. Ergebnisse hier eintragen (Datum, Firmware, was im Log stand).
Immer: Sicherheitsschlüssel eingesteckt, niedriges Tempo, Start auf den Seitenflächen.

## Gegenüber dem Prototyp geändert, bitte gegenprüfen

- [ ] **Verbinden.** Ablauf wie im Prototyp, nur wird der Notification-Listener jetzt *vor* `startNotifications` registriert. Erwartet im Log: `Gerät: …`, `Hersteller: …`, `Speed-Range: …`, `→ 00`, `← Request Control: OK`, danach laufen Live-Werte ein.
- [ ] **Rampe.** Bei 2 km/h auf Preset 5 drücken. Erwartet: `→ 02 fa 00` (2,5), `02 2c 01` (3,0), `02 5e 01` (3,5), `02 90 01` (4,0), `02 c2 01` (4,5), `02 f4 01` (5,0), jeweils mindestens 1,5 s auseinander und mit `← Set Speed: OK`. Auffällig wäre: fehlende Antworten, `fehlgeschlagen`, oder das Band ruckelt bei jeder Stufe.
- [ ] **Stop hat Vorrang.** Während einer Rampe Leertaste drücken. Erwartet: `→ 08 01` kommt direkt nach dem gerade laufenden Write, ggf. mit `verworfen: 02 …`. Band stoppt.
- [ ] **Limit senken während das Band läuft.** Bei 5 km/h das Limit auf 4 setzen. Erwartet: `Limit gesenkt, regle auf 4.0 km/h` und `→ 02 90 01`.

## Machine Status (steuert Programm-Abbruch)

- [ ] Stopp-Taste am Gerät/Fernbedienung, während das Band läuft. Welche `ℹ Status`-Zeile kommt? Laut FTMS `02 01` (gestoppt) bzw. `02 02` (pausiert).
- [ ] Sicherheitsschlüssel ziehen. Laut FTMS `03`.
- [ ] Speed an der Fernbedienung ändern. Laut FTMS `05 <LSB> <MSB>`.
- [ ] Kommt irgendwann `ff` (Steuerrecht verloren)?

Wenn das Band andere oder gar keine Status-Bytes schickt, bitte die Hex-Werte notieren. Davon hängt ab, ob ein Programm sofort endet; sonst greift erst die Stillstandserkennung nach 8 s.

## Bisher ungetestet

- [ ] **Steigung.** Slider bewegen. `← Set Inclination: OK` oder `nicht unterstützt`? Was steht bei `Inclination-Range` beim Verbinden?
- [ ] **Puls.** Steht `Puls-Service abonniert` im Log? Kommen Werte?
- [ ] **Countdown.** Wie lange zählt das Band nach Start herunter? Das Programm wartet 4,5 s, bevor es den ersten Speed setzt.
- [ ] **Programm-Übergänge.** Programm `0.5 2` / `0.5 3` / `0.5 2`. Wechsel zur richtigen Zeit? Ein Programm mit Stopp am Gerät abbrechen: endet es (Status-Zeile oder `Band steht, Programm beendet`)?
- [ ] **Wiederverbinden.** Trennen, erneut verbinden: wieder `← Request Control: OK` und Live-Werte?
- [ ] **Verbindungsabbruch** (die gefährliche Annahme). Bei 2 km/h, auf den Seitenflächen stehend, Bluetooth am Rechner ausschalten. Läuft das Band weiter, stoppt es, nach welcher Zeit? Ergebnis hier und in der Projektbeschreibung eintragen. Die App zeigt in jedem Fall den Warnhinweis.

Ergebnis Verbindungsabbruch: *(noch offen)*

## Desktop-App

- [ ] macOS: Beim ersten „Verbinden“ fragt macOS nach Bluetooth. Erscheint danach der Chooser mit dem Band?
- [ ] Zweites Verbinden mit Haken „automatisch verbinden“: wird das Band ohne Chooser gewählt? Log: `Zuletzt verbundenes Gerät automatisch gewählt`.
- [ ] Globales Kürzel: Andere App im Vordergrund, Cmd+Umschalt+Leertaste. Log: `Globales Stop-Kürzel`, `→ 08 01`. (Die Registrierung klappt auf macOS ohne Zusatzrechte, das Auslösen selbst ist noch ungetestet.)
- [ ] Windows: Chooser und, falls das Band koppeln will, PIN-Dialog.
