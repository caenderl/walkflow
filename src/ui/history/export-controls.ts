// The export buttons of the data tab: the recording since the page was opened as CSV or TCX, and clearing it. The recording
// itself (the samples) belongs to the app; this only reads it and, on "clear", empties it.

import { buildTcx, exportFilename, toCsv, type Sample, type TcxSport } from '../../core/history/export';
import { t } from '../../i18n/i18n';
import { $, $button, download, log, store } from '../ui';

const TCX_SPORT_KEY = 'walkflow.tcxSport';

/** `onCleared` is called after the recording was emptied (the chart is drawn again) */
export function setupExportControls(samples: Sample[], onCleared: () => void) {
  const sport = $<HTMLSelectElement>('tcxSport');
  const saved = store.get(TCX_SPORT_KEY);
  if (saved === 'Running' || saved === 'Other') sport.value = saved;
  sport.onchange = () => store.set(TCX_SPORT_KEY, sport.value);

  $button('csv').onclick = () => {
    if (!samples.length) { log(t.settings.noData); return; }
    download(toCsv(samples), 'text/csv', exportFilename(new Date(), 'csv'));
  };

  $button('tcx').onclick = () => {
    const xml = buildTcx(samples, { sport: sport.value as TcxSport, notes: t.settings.tcxNotes });
    if (!xml) { log(t.settings.noMovement); return; }
    const firstMoving = samples.find(s => (s.speed ?? 0) > 0);
    download(xml, 'application/vnd.garmin.tcx+xml', exportFilename(new Date(firstMoving?.ts ?? Date.now()), 'tcx'));
  };

  $button('clear').onclick = () => {
    samples.length = 0;
    onCleared();
    log(t.settings.cleared);
  };
}
