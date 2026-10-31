# Walkflow

Open-Source-Steuerung für Laufbänder mit Bluetooth-FTMS (Fitness Machine Service), direkt im Browser per Web Bluetooth oder als Desktop-App. Kein Konto, kein Server, kein Tracking.

> [!WARNING]
> **Sicherheits- und Haftungshinweis.** Nutzung auf eigene Gefahr. Die Software wird ohne Gewährleistung bereitgestellt (siehe [MIT-Lizenz](LICENSE)).
>
> - Steck den Sicherheitsschlüssel des Laufbands ein und befestige ihn an deiner Kleidung.
> - Starte das Band nur, während du auf den Seitenflächen stehst.
> - **Bricht die Bluetooth-Verbindung ab, kann die App das Band nicht stoppen.** Dann helfen nur die Stopp-Taste am Gerät oder der Sicherheitsschlüssel.
> - Bei Beschwerden sofort aufhören und ärztlichen Rat einholen.
> - Angezeigte Werte kommen vom Gerät oder sind Schätzungen und können falsch sein.

Walkflow ist ein unabhängiges Projekt und nicht mit dem Hersteller des Laufbands oder des Bluetooth-Moduls verbunden.

## Getestet mit

Sportstech sPad 500, BLE-Modul FITHOME JJ-BT2-DL (HW 2.0, FW 1.023).

- Ausprobiert: Verbinden, Start/Pause/Stop, Speed setzen, Live-Daten.
- Noch nicht einzeln getestet: Steigung, Puls, Übergänge im Intervall-Programm, Wiederverbinden, Verhalten des Bands bei Verbindungsabbruch.

Andere FTMS-Laufbänder können funktionieren, sind aber nicht getestet.

## Funktionen

- Verbinden/Trennen, Start/Pause/Stop, Speed per Slider, Presets und ±0,5, Steigung
- Intervall-Programm (Zeilen `Minuten km/h`)
- Live-Werte, Verlauf der letzten 5 Minuten, Export als CSV und TCX (Strava, Garmin Connect & Co.)
- Log mit gesendeten/empfangenen Bytes und eine Experimentier-Konsole für den Control Point
- Demo-Modus mit simuliertem Laufband, ohne Hardware
- Offline nutzbar und installierbar (PWA)

### Sicherheitsfunktionen

- Eigenes Speed-Limit (Standard 6 km/h); höhere Werte nur nach zusätzlicher Bestätigung. Alle Wege (Slider, Presets, ±, Pfeiltasten, Programm, Konsole) werden darauf gekappt. Wird das Limit gesenkt, regelt die App aktiv herunter.
- Rampe: höchstens 0,5 km/h pro Befehl (einstellbar 0,1–1,0) und mindestens 1,5 s zwischen zwei Speed-Befehlen. Größere Sprünge werden in Stufen angefahren.
- Start nur nach Bestätigung. Leertaste oder Esc stoppt sofort; Stop und Pause haben Vorrang vor allen anderen Befehlen. Bluetooth-Writes laufen nie parallel.
- Ein laufendes Programm endet bei Verbindungsabbruch, wenn das Band „gestoppt“ oder „Sicherheitsschlüssel“ meldet, oder wenn es 8 s lang 0 km/h meldet.
- Dauerhafter Hinweis, dass die App bei Verbindungsabbruch nicht stoppen kann; großer Warnhinweis, wenn die Verbindung abbricht, während das Band vermutlich läuft. „Trennen“ bietet bei laufendem Band erst Stop an.
- Hintergrund-Tabs: Warnung im Tab-Titel, optional Band pausieren, Programm läuft nach Zeitstempeln statt nach (gedrosselten) Timern.

## Web-Version

Web Bluetooth gibt es in Chrome (Desktop, Android), Edge und Opera. Safari und Firefox haben es nicht; auf iPhone/iPad gibt es es in keinem Browser (Umweg: Browser mit eigener Bluetooth-Brücke wie Bluefy, nicht getestet). Unter Linux muss es in Chrome je nach Version erst über `chrome://flags` aktiviert werden.

Die Web-Version läuft nach dem ersten Deploy unter `https://<github-user>.github.io/<repo>/`.

## Desktop-App

Downloads unter **Releases**. Die App ist nicht signiert, deshalb warnt das System beim ersten Öffnen:

- **macOS (Sequoia und neuer):** App öffnen, bei der Warnung „Fertig“ wählen. Dann *Systemeinstellungen → Datenschutz & Sicherheit* öffnen, nach unten scrollen und bei Walkflow auf **„Trotzdem öffnen“** klicken. Beim ersten Verbinden fragt macOS nach der Bluetooth-Berechtigung.
- **Windows:** Bei „Der Computer wurde durch Windows geschützt“ auf *Weitere Informationen → Trotzdem ausführen*.
- **Linux:** `chmod +x Walkflow-*.AppImage` und starten. Web Bluetooth unter Linux ist ungetestet.

Die Desktop-App fragt beim Start bei GitHub nach, ob es eine neuere Version gibt, und zeigt dann einen Hinweis. Sie aktualisiert sich nicht selbst. Die Abfrage lässt sich im Info-Bereich abschalten.

Zusätzlich zur Web-Version: eigener Geräte-Chooser mit optionaler automatischer Wahl des zuletzt verbundenen Geräts, globales Stop-Kürzel **Cmd/Strg + Umschalt + Leertaste** (nur solange verbunden, auch wenn das Fenster im Hintergrund ist), Bildschirm-Ruhezustand wird verhindert, solange verbunden.

## Entwicklung

Voraussetzung: Node.js 24.

```bash
npm ci
```

```bash
npm run dev
```

| Befehl | Zweck |
| --- | --- |
| `npm test` | Vitest (FTMS-Parser, Sicherheitslogik, Programm-Runner, Simulator, Export) |
| `npm run typecheck` | TypeScript strict für App, Config und Electron |
| `npm run build` | Web-Build nach `dist/` (mit Service Worker) |
| `npm run electron` | Desktop-Variante bauen und Electron starten |
| `npm run dist` | Installer für das aktuelle System nach `release/` |
| `npm run icons` | Icons neu erzeugen (`scripts/make-icons.mjs`) |

Ohne Laufband: „Demo (ohne Laufband)“ klicken. Der Simulator spricht echte FTMS-Bytes und kann einen Verbindungsabbruch und den Sicherheitsschlüssel simulieren.

### Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/ftms.ts` | FTMS-Protokoll als reine Funktionen: Parser, Befehle, Feature/Ranges, Status |
| `src/ble.ts` | `BleAdapter`-Interface, `WebBluetoothAdapter`, serielle Write-Queue, Verbindungsablauf |
| `src/safety.ts` | Limits, Rampe (`SpeedGovernor`), Konsolenprüfung, Stillstandserkennung |
| `src/program.ts` | Intervall-Programm: Parser und zeitstempelbasierter Runner |
| `src/sim.ts` | Simuliertes FTMS-Laufband (Demo-Modus, Tests) |
| `src/export.ts` | CSV und TCX |
| `src/main.ts`, `ui.ts`, `chart.ts`, `dialogs.ts` | Dünne UI-Schicht, Vanilla TS |
| `src/desktop.ts` | Renderer-Seite der Electron-Integration |
| `electron/` | Main-Prozess und Preload |

Ein zweiter BLE-Weg (z. B. nativ) implementiert nur `BleAdapter`/`BleDevice` aus `src/ble.ts`.

## Veröffentlichen

### GitHub Pages

1. Repository-Einstellungen → *Pages* → Source: **GitHub Actions**.
2. `public/impressum.html` und `public/datenschutz.html` ausfüllen. Solange dort `TODO` steht, bricht der Pages-Workflow absichtlich ab.
3. Optional: Repository-Variable `DONATION_URL` setzen (siehe unten).
4. Deployen von Hand: *Actions → Pages → Run workflow*. Für einen Deploy bei jedem Push auf `main` in `.github/workflows/pages.yml` den auskommentierten `push`-Trigger wieder einschalten.

### Desktop-Release

1. Version in `package.json` erhöhen und committen.
2. Tag `v<version>` pushen, z. B. `git tag v0.1.0 && git push origin v0.1.0`.
3. Der Release-Workflow baut macOS (arm64, x64), Windows und Linux und legt einen **Release-Entwurf** mit Prüfsummen an. Veröffentlichen von Hand.

### Signierung und Notarisierung (später)

Vorbereitet in `electron-builder.config.cjs`: Sobald im Release-Workflow die Secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` und `APPLE_TEAM_ID` als Umgebungsvariablen gesetzt sind, wird mit Developer ID signiert, Hardened Runtime aktiviert und notarisiert. Ohne sie wird macOS ad-hoc signiert (nötig, damit Apple-Silicon-Macs die App überhaupt starten).

## Unterstützung

<!-- Platzhalter: Link erst eintragen, wenn Anbieter und Bedingungen geklärt sind. -->
Freiwillige Unterstützung, keine Gegenleistung: *(Link folgt)*

Es gibt keinen Support-Anspruch und keine Funktionen, die von einer Unterstützung abhängen.

## Lizenz

[MIT](LICENSE)
