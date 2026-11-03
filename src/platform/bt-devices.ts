// The Bluetooth device list of the desktop chooser: devices that advertise no name are hidden by default.
// There is no service filter on purpose (unclear whether the treadmill advertises FTMS), so the list holds
// every device nearby, mostly nameless ones.

export interface BtDevice { id: string; name: string }

// Chromium names a device without a name "Unknown or Unsupported Device (<address>)", in the system
// language. The language changes, the address in brackets at the end does not.
const PLACEHOLDER = /\((?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\)\s*$|\([0-9a-f-]{32,36}\)\s*$/i;

export function isUnnamedDevice(d: BtDevice): boolean {
  const name = d.name.trim();
  return name === '' || PLACEHOLDER.test(name);
}

/** What the chooser lists: the last connected device first, then the named ones, then (on request) the rest. */
export function chooserList(devices: readonly BtDevice[], lastId: string | null, showAll: boolean): { shown: BtDevice[]; hidden: number } {
  const keep = (d: BtDevice) => d.id === lastId || !isUnnamedDevice(d);
  const rank = (d: BtDevice) => (d.id === lastId ? 0 : keep(d) ? 1 : 2);
  const sorted = devices.map((d, i) => ({ d, i })).sort((a, b) => rank(a.d) - rank(b.d) || a.i - b.i).map(x => x.d);
  return { shown: showAll ? sorted : sorted.filter(keep), hidden: devices.filter(d => !keep(d)).length };
}
