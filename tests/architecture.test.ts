// The rules of the project structure (docs/ARCHITECTURE.md), checked on the source files (src/ and electron/). A change
// that breaks one fails here, so the structure does not erode: layers only look downwards, the pure layers know nothing about the browser, and
// there are no cycles at runtime.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/** Which layers a layer may import from (itself always). Lower layers know nothing about the ones above. */
const MAY_IMPORT: Record<string, readonly string[]> = {
  i18n: [],
  platform: [],
  core: ['i18n'],
  data: ['core'],
  /** The connection to other people's devices (sharing). Never the treadmill: no device, no ui. */
  net: ['core', 'i18n', 'platform'],
  ui: ['core', 'i18n', 'device', 'data', 'platform', 'net'],
};
/** Without the browser: no DOM, no storage. device and data are where those belong. */
const PURE = ['i18n', 'core', 'platform'];
/** What the main process of the desktop app may use of src/: pure code only */
const ELECTRON_MAY_IMPORT = ['i18n', 'platform', 'core'];
const ROOT_FILES = ['main.ts', 'env.d.ts', 'style.css'];
/** What reaches other people's devices must never be able to drive the belt: no FTMS commands, no treadmill connection */
const SHARING = ['src/net/', 'src/core/share/'];
/** The treadmill library (npm package ftms-treadmill, its own repository): it drives the belt and speaks in codes */
const LIB_NAME = 'ftms-treadmill';
/** The only ways into the library */
const LIB_ENTRIES = [LIB_NAME, `${LIB_NAME}/web-bluetooth`, `${LIB_NAME}/sim`, `${LIB_NAME}/protocol`];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

interface Import { spec: string; typeOnly: boolean }

const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

function importsOf(text: string): Import[] {
  const out: Import[] = [];
  const re = /\b(import|export)(\s+type)?\s*(?:[^'";]*?\s+from\s*)?['"](\.{1,2}\/[^'"?]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"?]+)['"]\s*\)/g;
  for (const m of code(text).matchAll(re)) out.push({ spec: m[3] ?? m[4]!, typeOnly: m[2] !== undefined });
  return out;
}

/** Imports of packages (not relative paths), e.g. 'ftms-treadmill/sim' */
function packageImportsOf(text: string): Import[] {
  const out: Import[] = [];
  const re = /\b(import|export)(\s+type)?\s*(?:[^'";]*?\s+from\s*)?['"]([^'".][^'"?]*)['"]|\bimport\(\s*['"]([^'".][^'"?]*)['"]\s*\)/g;
  for (const m of code(text).matchAll(re)) out.push({ spec: m[3] ?? m[4]!, typeOnly: m[2] !== undefined });
  return out;
}

const isLib = (spec: string) => spec === LIB_NAME || spec.startsWith(`${LIB_NAME}/`);

function resolveTs(from: string, spec: string): string | null {
  const base = normalize(join(dirname(from), spec));
  for (const candidate of [`${base}.ts`, base]) {
    try { if (statSync(candidate).isFile()) return candidate; } catch { /* next */ }
  }
  return null;
}

const sources = walk(SRC).filter(p => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.endsWith('.d.ts'));
const layerOf = (file: string) => relative(SRC, file).split(sep)[0]!;
const rel = (file: string) => relative(ROOT, file);

describe('project structure', () => {
  it('keeps every source file in a layer folder (only main.ts and a few files stay at the top)', () => {
    const loose = readdirSync(SRC).filter(n => statSync(join(SRC, n)).isFile() && !ROOT_FILES.includes(n));
    expect(loose).toEqual([]);
    for (const dir of readdirSync(SRC).filter(n => statSync(join(SRC, n)).isDirectory())) expect(Object.keys(MAY_IMPORT), dir).toContain(dir);
  });

  it('lets a layer import only from itself and the layers below it', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const layer = layerOf(file);
      if (!(layer in MAY_IMPORT)) continue;
      for (const { spec } of importsOf(readFileSync(file, 'utf8'))) {
        const target = resolveTs(file, spec);
        if (!target || !target.startsWith(SRC)) continue;
        const to = layerOf(target);
        if (to !== layer && !MAY_IMPORT[layer]!.includes(to) && !ROOT_FILES.includes(to)) violations.push(`${rel(file)} → ${rel(target)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps sharing away from the belt: nothing from other devices can reach the treadmill commands', () => {
    const bad: string[] = [];
    // Every file that sharing can run, however far down the imports (a type-only import runs nothing)
    for (const file of sources.filter(f => SHARING.some(s => rel(f).startsWith(s)))) {
      const seen = new Set<string>([file]);
      const queue: { file: string; via: string[] }[] = [{ file, via: [file] }];
      while (queue.length) {
        const cur = queue.shift()!;
        const text = readFileSync(cur.file, 'utf8');
        // The treadmill library, directly imported: also a type (the commands' types have no business in sharing either)
        for (const { spec, typeOnly } of packageImportsOf(text)) {
          if (isLib(spec) && (cur.file === file || !typeOnly)) bad.push([...cur.via.map(rel), spec].join(' → '));
        }
        for (const { spec, typeOnly } of importsOf(text)) {
          const target = resolveTs(cur.file, spec);
          if (!target || !target.startsWith(SRC) || seen.has(target)) continue;
          if (typeOnly) continue;
          seen.add(target);
          queue.push({ file: target, via: [...cur.via, target] });
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('lets the app use the treadmill library only through its entry points', () => {
    const bad: string[] = [];
    for (const file of [...walk(SRC), ...walk(join(ROOT, 'electron'))].filter(p => p.endsWith('.ts'))) {
      const text = readFileSync(file, 'utf8');
      for (const { spec } of packageImportsOf(text)) if (isLib(spec) && !LIB_ENTRIES.includes(spec)) bad.push(`${rel(file)} → ${spec}`);
    }
    expect(bad).toEqual([]);
  });

  it('lets only the ui choose Web Bluetooth: the pure layers use the core of the library', () => {
    const bad: string[] = [];
    for (const file of sources.filter(f => PURE.includes(layerOf(f)))) {
      for (const { spec } of packageImportsOf(readFileSync(file, 'utf8'))) if (spec === `${LIB_NAME}/web-bluetooth`) bad.push(`${rel(file)} → ${spec}`);
    }
    expect(bad).toEqual([]);
  });

  it('keeps the browser out of the pure layers: no DOM, no storage, no window', () => {
    const found: string[] = [];
    for (const file of sources.filter(f => PURE.includes(layerOf(f)))) {
      // Texts for the person may say "window"; only code counts
      const hit = code(readFileSync(file, 'utf8')).replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''").match(/\b(document\.|window\.|localStorage|sessionStorage|indexedDB|navigator\.|HTMLElement|addEventListener)/);
      if (hit) found.push(`${rel(file)}: ${hit[0]}`);
    }
    expect(found).toEqual([]);
  });

  it('has no import cycles at runtime (a type-only import does not count)', () => {
    const graph = new Map<string, string[]>();
    for (const file of sources) {
      const deps = importsOf(readFileSync(file, 'utf8')).filter(i => !i.typeOnly).map(i => resolveTs(file, i.spec)).filter((p): p is string => !!p && p.startsWith(SRC));
      graph.set(file, deps);
    }
    const cycles: string[] = [];
    const state = new Map<string, 1 | 2>();
    const stack: string[] = [];
    const visit = (f: string) => {
      state.set(f, 1);
      stack.push(f);
      for (const d of graph.get(f) ?? []) {
        if (state.get(d) === 1) cycles.push([...stack.slice(stack.indexOf(d)), d].map(rel).join(' → '));
        else if (!state.has(d)) visit(d);
      }
      stack.pop();
      state.set(f, 2);
    };
    for (const f of graph.keys()) if (!state.has(f)) visit(f);
    expect(cycles).toEqual([]);
  });

  it('lets the desktop main process use only pure code of src/', () => {
    const bad: string[] = [];
    for (const file of walk(join(ROOT, 'electron')).filter(p => p.endsWith('.ts'))) {
      for (const { spec } of importsOf(readFileSync(file, 'utf8'))) {
        const target = resolveTs(file, spec);
        if (!target || !target.startsWith(SRC)) continue;
        if (!ELECTRON_MAY_IMPORT.includes(layerOf(target))) bad.push(`${rel(file)} → ${rel(target)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps a test next to the code it tests', () => {
    const tests = walk(SRC).filter(p => p.endsWith('.test.ts'));
    const orphans = tests.filter(t => !statSync(t.replace(/\.test\.ts$/, '.ts'), { throwIfNoEntry: false })?.isFile());
    expect(orphans.map(rel)).toEqual([]);
  });
});
