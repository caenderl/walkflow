// The safety gate of a pull request (CI job `safety-gate`, see CONTRIBUTING.md): code that decides what reaches the treadmill
// changes only together with a test, and says so. A missing test fails the check; a title that is not `safety` and missing
// treadmill checks are warnings, because a refactor of safety code is not a safety change.
//
//   node scripts/safety-gate.mjs <base ref> "<pull request title>"
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Code that can change what is sent to the belt or what the person is warned about
const SAFETY = [/^src\/core\/safety\//, /^src\/ui\/live\//];
const TEST = /\.test\.ts$/;

export function checkSafetyGate({ files, title, libraryChanged = false }) {
  const errors = [], warnings = [];
  const safety = files.filter(f => SAFETY.some(p => p.test(f)) && !TEST.test(f));
  const tests = files.filter(f => TEST.test(f));
  const isSafetyTitle = /^safety(\(.+\))?!?:/.test(title);
  if (safety.length && !tests.length)
    errors.push(`Safety code changed without a changed test: ${safety.join(', ')}. Write the test first (CONTRIBUTING.md → Pull requests).`);
  if (safety.length && !isSafetyTitle)
    warnings.push(`Safety code changed but the title is not "safety(…)": fine for a refactor that changes no behaviour, otherwise use the safety type.`);
  if ((safety.length || isSafetyTitle) && !files.includes('HARDWARE-TESTS.md'))
    warnings.push('No change to HARDWARE-TESTS.md: say in the pull request why no check on a treadmill is needed.');
  if (libraryChanged)
    warnings.push('New ftms-treadmill version: read its changelog; anything under Safety needs the checks in HARDWARE-TESTS.md before the release is published.');
  return { errors, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base = 'origin/main', title = ''] = process.argv.slice(2);
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const files = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  const libraryChanged = /^[+-]\s*"ftms-treadmill":/m.test(git('diff', `${base}...HEAD`, '--', 'package.json'));
  const { errors, warnings } = checkSafetyGate({ files, title, libraryChanged });
  for (const w of warnings) console.log(`::warning::${w}`);
  for (const e of errors) console.log(`::error::${e}`);
  console.log(errors.length ? 'Safety gate: failed' : 'Safety gate: passed');
  process.exitCode = errors.length ? 1 : 0;
}
