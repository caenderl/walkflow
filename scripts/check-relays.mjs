// Checks that the relays for sharing (src/platform/relays.ts) still do what sharing needs: accept the kind of short-lived event the
// connection uses (kind 25xxx, "ephemeral") and pass it on to a second connection. Run it now and then, and before a release:
//
//   npm run relays:check              the pinned relays
//   npm run relays:check -- --default every relay the library knows, to find a replacement for one that no longer works
//   npm run relays:check -- wss://a wss://b   the ones named
//
// Exit code 1 if a pinned relay fails. It signs a throw-away event with the library the connection itself uses.

import { createHash } from 'node:crypto';
import * as secp from '@noble/secp256k1';

const { schnorr } = secp;
secp.hashes.sha256 = m => new Uint8Array(createHash('sha256').update(m).digest());

const TIMEOUT_MS = 9000;
const hex = u => Buffer.from(u).toString('hex');

function makeEvent(kind) {
  const { secretKey, publicKey } = schnorr.keygen();
  const pubkey = hex(publicKey), created_at = Math.floor(Date.now() / 1000), tags = [['t', 'walkflow-relay-check']], content = 'check';
  const id = createHash('sha256').update(JSON.stringify([0, pubkey, created_at, kind, tags, content])).digest();
  return { id: hex(id), pubkey, created_at, kind, tags, content, sig: hex(schnorr.sign(id, secretKey)) };
}

function probe(url) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const result = { url, ok: false, ms: null, note: '' };
    let a, b, done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); try { a?.close(); b?.close(); } catch { /* closing */ } resolve(result); };
    const timer = setTimeout(() => { result.note ||= 'timeout'; finish(); }, TIMEOUT_MS);
    try { a = new WebSocket(url); b = new WebSocket(url); } catch (e) { result.note = String(e); finish(); return; }
    const kind = 25000 + Math.floor(Math.random() * 1000);
    const event = makeEvent(kind);
    let open = 0;
    const onOpen = () => {
      if (++open < 2) return;
      b.send(JSON.stringify(['REQ', 'check', { kinds: [kind], since: event.created_at - 5 }]));
      setTimeout(() => a.send(JSON.stringify(['EVENT', event])), 600);
    };
    a.onopen = b.onopen = onOpen;
    a.onerror = b.onerror = () => { result.note ||= 'connection failed'; finish(); };
    a.onmessage = m => {
      try {
        const d = JSON.parse(m.data);
        if (d[0] === 'OK' && !d[2]) { result.note = String(d[3]).slice(0, 80); finish(); }
        else if (d[0] === 'AUTH') result.note ||= 'wants authentication';
      } catch { /* not JSON */ }
    };
    b.onmessage = m => {
      try {
        const d = JSON.parse(m.data);
        if (d[0] === 'EVENT' && d[2]?.id === event.id) { result.ok = true; result.ms = Date.now() - t0; finish(); }
        else if (d[0] === 'CLOSED') result.note ||= `closed: ${String(d[2]).slice(0, 60)}`;
      } catch { /* not JSON */ }
    };
  });
}

const args = process.argv.slice(2);
let urls;
if (args.includes('--default')) urls = (await import('@trystero-p2p/nostr')).defaultRelayUrls;
else if (args.length) urls = args;
else urls = (await import('../src/platform/relays.ts')).RELAY_URLS;
const pinned = !args.length;

const results = [];
const queue = [...urls];
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) results.push(await probe(queue.shift())); }));
results.sort((x, y) => Number(y.ok) - Number(x.ok) || (x.ms ?? 1e9) - (y.ms ?? 1e9));
for (const r of results) console.log(r.ok ? 'ok  ' : 'FAIL', r.url.padEnd(36), r.ok ? `${r.ms} ms` : r.note);
const failed = results.filter(r => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} work`);
if (pinned && failed) process.exit(1);
