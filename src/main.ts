import './style.css';
import { TreadmillClient, WebBluetoothAdapter } from './ble';
import { drawChart } from './chart';
import { exportFilename, toCsv, type Sample } from './export';
import { cmdPause, cmdRequestControl, cmdSetInclination, cmdSetSpeed, cmdStart, cmdStop, hex, type TreadmillData } from './ftms';
import { fmtTime, parseProgram, ProgramRunner, totalSeconds } from './program';
import { checkConsoleCommand, clampSpeed, effectiveMax as calcEffectiveMax, parseHexBytes, parseLimit } from './safety';
import { $, $button, $input, download, log } from './ui';

// ---------- State ----------
let devMin = 1.0, devMax = 12.0;
let wakeLock: WakeLockSentinel | null = null;
const cur: Omit<Sample, 'ts'> = {};   // letzte Messwerte
const samples: Sample[] = [];          // Verlauf (1 Hz)
let lastSample = 0;

const client = new TreadmillClient(new WebBluetoothAdapter(), {
  log,
  data: onTreadmillData,
  heartRate: bpm => { if (bpm > 0) { cur.hr = bpm; $('vHr').textContent = String(bpm); } },
  machineStatus: dv => log(`ℹ Status ${hex(dv)}`),
  trainingStatus: dv => log(`ℹ Status ${hex(dv)}`),
  disconnected: onDisconnected,
});

const runner = new ProgramRunner({
  start: doStart,
  stop: () => client.send(cmdStop()),
  setSpeed,
  currentTarget: () => parseFloat($input('slider').value),
  status: t => { $('progStatus').textContent = t; },
});

// ---------- Live-Daten ----------
function onTreadmillData(r: TreadmillData) {
  if (r.speed !== undefined) { cur.speed = r.speed; $('vSpeed').textContent = r.speed.toFixed(1); }
  if (r.dist !== undefined) { cur.dist = r.dist; $('vDist').textContent = (r.dist / 1000).toFixed(2); }
  if (r.incl !== undefined) { cur.incl = r.incl; $('vIncl').textContent = r.incl.toFixed(1); }
  if (r.kcal !== undefined) { cur.kcal = r.kcal; $('vKcal').textContent = String(r.kcal); }
  if (r.time !== undefined) { cur.time = r.time; $('vTime').textContent = fmtTime(r.time); }
  if (r.hr !== undefined && r.hr > 0) { cur.hr = r.hr; $('vHr').textContent = String(r.hr); }

  const now = Date.now();
  if (now - lastSample >= 1000) {
    lastSample = now;
    samples.push({ ts: now, ...cur });
    if (samples.length > 20000) samples.shift();
    redrawChart();
  }
}

function redrawChart() {
  drawChart($<HTMLCanvasElement>('chart'), samples, {
    now: Date.now(), limit: effectiveMax(), target: parseFloat($input('slider').value),
  });
}

// ---------- Speed & Steigung ----------
function effectiveMax() { return calcEffectiveMax(devMax, parseLimit($input('cap').value)); }

function applyLimits() {
  const sl = $input('slider');
  sl.min = String(devMin); sl.max = String(effectiveMax());
  if (parseFloat(sl.value) > parseFloat(sl.max)) sl.value = sl.max;
  if (parseFloat(sl.value) < parseFloat(sl.min)) sl.value = sl.min;
  $('target').textContent = `${parseFloat(sl.value).toFixed(1)} km/h`;
  $('rangeInfo').textContent = `Geräte-Range: ${devMin.toFixed(1)} – ${devMax.toFixed(1)} km/h, aktives Limit: ${effectiveMax().toFixed(1)}`;
  try { localStorage.setItem('cap', $input('cap').value); } catch { /* privater Modus */ }
}

function setSpeed(kmh: number): Promise<boolean> {
  const v = clampSpeed(kmh, { min: devMin, max: effectiveMax() });
  if (v === null) {
    log(`❌ Kein erlaubter Speed: Limit ${effectiveMax()} liegt unter dem Geräte-Minimum ${devMin}`);
    return Promise.resolve(false);
  }
  $input('slider').value = String(v);
  $('target').textContent = `${v.toFixed(1)} km/h`;
  return client.send(cmdSetSpeed(v));
}

function setIncline(pct: number) {
  $input('inclSlider').value = String(pct);
  $('inclTarget').textContent = `${pct.toFixed(1)} %`;
  return client.send(cmdSetInclination(pct));
}

// ---------- Start / Stop / Programm ----------
function doStop() {
  runner.abort('Gestoppt');
  return client.send(cmdStop());
}

async function doStart() {
  await client.send(cmdRequestControl());
  await client.send(cmdStart());
}

async function runProgram() {
  const steps = parseProgram($input('progText').value);
  if (!steps.length) { $('progStatus').textContent = 'Programm leer oder nicht lesbar'; return; }
  const total = totalSeconds(steps);
  if (!confirm(`Programm mit ${steps.length} Schritten (${fmtTime(total)} min) starten?\nStehst du auf den Seitenflächen?`)) return;
  await runner.run(steps);
}

// ---------- CSV ----------
function exportCsv() {
  if (!samples.length) { log('Keine Daten zum Exportieren'); return; }
  download(toCsv(samples), 'text/csv', exportFilename(new Date(), 'csv'));
}

// ---------- Verbinden ----------
async function connect() {
  try {
    $('status').textContent = 'Suche…';
    const info = await client.connect();

    if (info.speedRange) { devMin = info.speedRange.min; devMax = info.speedRange.max; }
    if (info.inclRange) {
      const { min: mn, max: mx, step: st } = info.inclRange;
      const sl = $input('inclSlider');
      sl.min = String(mn); sl.max = String(mx); sl.step = String(st || 0.5); sl.value = String(Math.max(mn, 0));
      $('inclTarget').textContent = `${parseFloat(sl.value).toFixed(1)} %`;
      $('inclInfo').textContent = `Range: ${mn} – ${mx} % (Step ${st})`;
    }

    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }

    applyLimits();
    setUi(true);
    $('status').textContent = `Verbunden: ${info.deviceName ?? 'Laufband'}`;
    await client.send(cmdRequestControl());
  } catch (e) {
    log(`❌ ${e instanceof Error ? e.message : String(e)}`);
    $('status').textContent = 'Nicht verbunden';
  }
}

function onDisconnected() {
  log('Verbindung getrennt');
  runner.abort('Verbindung getrennt, Programm beendet');
  try { void wakeLock?.release(); } catch { /* egal */ }
  wakeLock = null;
  $('status').textContent = 'Nicht verbunden';
  setUi(false);
}

function setUi(connected: boolean) {
  $button('connect').disabled = connected;
  $button('disconnect').disabled = !connected;
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.needs-conn').forEach(el => { el.disabled = !connected; });
}

// ---------- Events ----------
$button('connect').onclick = connect;
$button('disconnect').onclick = () => client.disconnect();

$button('start').onclick = async () => {
  if (!confirm('Stehst du auf den Seitenflächen und nicht auf dem Band?')) return;
  await doStart();
};
$button('pause').onclick = () => { runner.abort('Pausiert, Programm beendet'); void client.send(cmdPause()); };
$button('stop').onclick = () => void doStop();

$input('slider').oninput = e => { $('target').textContent = `${parseFloat((e.target as HTMLInputElement).value).toFixed(1)} km/h`; };
$input('slider').onchange = e => void setSpeed(parseFloat((e.target as HTMLInputElement).value));
$button('minus').onclick = () => void setSpeed(parseFloat($input('slider').value) - 0.5);
$button('plus').onclick = () => void setSpeed(parseFloat($input('slider').value) + 0.5);
document.querySelectorAll<HTMLButtonElement>('.preset').forEach(b => {
  b.onclick = () => void setSpeed(parseFloat(b.dataset.speed ?? ''));
});
$input('cap').onchange = () => { applyLimits(); redrawChart(); };

$input('inclSlider').oninput = e => { $('inclTarget').textContent = `${parseFloat((e.target as HTMLInputElement).value).toFixed(1)} %`; };
$input('inclSlider').onchange = e => void setIncline(parseFloat((e.target as HTMLInputElement).value));

$button('progStart').onclick = runProgram;
$button('progStop').onclick = () => void doStop();

$button('csv').onclick = exportCsv;
$button('clear').onclick = () => { samples.length = 0; redrawChart(); log('Verlauf gelöscht'); };

$button('rawSend').onclick = () => {
  const bytes = parseHexBytes($input('raw').value);
  if (!bytes) { log('❌ Ungültige Hex-Bytes'); return; }
  const check = checkConsoleCommand(bytes, effectiveMax());
  if (!check.ok) { log(`❌ ${check.reason}`); return; }
  void client.send(new Uint8Array(bytes));
};
$input('raw').addEventListener('keydown', e => { if (e.key === 'Enter') $button('rawSend').click(); });

document.addEventListener('keydown', e => {
  if (!client.connected) return;
  const t = e.target as HTMLElement;
  const tag = t.tagName;
  const isText = tag === 'TEXTAREA' || (tag === 'INPUT' && (t as HTMLInputElement).type !== 'range');
  if (isText) return;
  if (e.code === 'Space' || e.key === 'Escape') {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    void doStop();
  } else if (tag !== 'INPUT' && e.key === 'ArrowUp') {
    e.preventDefault(); void setSpeed(parseFloat($input('slider').value) + 0.5);
  } else if (tag !== 'INPUT' && e.key === 'ArrowDown') {
    e.preventDefault(); void setSpeed(parseFloat($input('slider').value) - 0.5);
  }
});

try { const c = localStorage.getItem('cap'); if (c) $input('cap').value = c; } catch { /* privater Modus */ }
applyLimits();
redrawChart();
setInterval(redrawChart, 1000);

void new WebBluetoothAdapter().availability().then(a => {
  if (!a.ok && a.reason === 'no-api') {
    $('status').textContent = 'Web Bluetooth fehlt, bitte Chrome nutzen';
    $button('connect').disabled = true;
  }
});
