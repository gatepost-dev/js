// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
// Checks each dependency against DEP-4: it has a permissive licence, or it has a recorded
// exception. The script reads `pnpm licenses list --json`, so run `pnpm install` first.
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { isMainModule } from './main-module.mjs';

// The first six licences are the ones that the standard names. The last three are permissive
// too, and dev tools in the tree use them.
const ALLOWED = [
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Python-2.0',
];

// A package here may have a licence that is not allowed. The reason says why that is safe.
// An entry matches the name and the licence together, so a change of licence fails the check.
const EXCEPTIONS = [
  {
    name: 'caniuse-lite',
    licence: 'CC-BY-4.0',
    reason:
      'A dev-only data licence. It arrives through @stryker-mutator/core, @babel/core and ' +
      'browserslist. @gatepost/core ships dist/ only and has no dependencies, so nothing ' +
      'redistributes the data.',
  },
  {
    name: 'spdx-exceptions',
    licence: 'CC-BY-3.0',
    reason:
      'A dev-only data licence. It arrives through eslint-plugin-jsdoc and ' +
      'spdx-expression-parse. @gatepost/core ships dist/ only and has no dependencies, so ' +
      'nothing redistributes the data.',
  },
  {
    name: /^lightningcss(-.+)?$/,
    licence: 'MPL-2.0',
    reason:
      'A dev-only build tool that arrives through Vite, which Vitest runs. We do not change it, ' +
      'and @gatepost/core ships dist/ only, so nothing redistributes it. The package has one ' +
      'variant for each platform, so the name is a pattern.',
  },
  {
    name: /^(axe-core|@axe-core\/playwright)$/,
    licence: 'MPL-2.0',
    reason:
      'Dev-only accessibility checks that the tests of the field run in a browser (T-10). We do ' +
      'not change them, and the published packages ship dist/ only, so nothing redistributes them.',
  },
];

// "A OR B" passes when one alternative is allowed. This pattern reads nothing else, so an
// expression such as "A AND B" fails, and an exception must record it.
const ALTERNATIVES = /^\(?([\w.+-]+(?: OR [\w.+-]+)*)\)?$/;

function isAllowed(licence, allowed) {
  const match = ALTERNATIVES.exec(licence);
  return (
    match !== null && match[1].split(' OR ').some((alternative) => allowed.includes(alternative))
  );
}

function isException(exception, name, licence) {
  const sameName =
    exception.name instanceof RegExp ? exception.name.test(name) : exception.name === name;
  return sameName && exception.licence === licence;
}

/**
 * Lists the packages that DEP-4 does not allow.
 *
 * @param report - The packages by licence, as `pnpm licenses list --json` prints them. Each
 * package has a `name` and its `versions`.
 * @param policy - The `allowed` licences and the `exceptions`. The default is the policy of
 * this repo.
 * @returns One message for each package that breaks the policy.
 */
export function findViolations(
  report,
  { allowed, exceptions } = { allowed: ALLOWED, exceptions: EXCEPTIONS },
) {
  return Object.entries(report)
    .filter(([licence]) => !isAllowed(licence, allowed))
    .flatMap(([licence, packages]) =>
      packages
        .filter(
          ({ name }) => !exceptions.some((exception) => isException(exception, name, licence)),
        )
        .map(({ name, versions }) => `${name}@${versions.join(', ')} has the licence ${licence}.`),
    );
}

// With no installed packages, pnpm exits with 0 and gives every package the licence "Unknown". So
// a report without one known licence, even an empty report, shows that the install is missing.
function cannotListLicences(report) {
  const packages = Object.values(report).flat();
  return packages.length === 0 || Object.keys(report).every((licence) => licence === 'Unknown');
}

// Returns the report, or the problem that stopped pnpm from giving one.
function readReport() {
  try {
    const output = execFileSync('pnpm', ['licenses', 'list', '--json'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { report: JSON.parse(output) };
  } catch (error) {
    // The call fails with the exit code of pnpm, or with ENOENT when pnpm is missing.
    if (error.code === 'ENOENT') {
      return { problem: 'Cannot start pnpm. Enable it with corepack enable.' };
    }
    if (typeof error.status === 'number') {
      const summary = `pnpm licenses list exited with the code ${error.status}.`;
      return { problem: [summary, error.stderr.trim()].filter((line) => line !== '').join('\n') };
    }
    throw error;
  }
}

function main() {
  const { report, problem } = readReport();
  if (problem !== undefined) {
    process.stderr.write(`${problem}\n`);
    process.exitCode = 1;
    return;
  }
  if (cannotListLicences(report)) {
    process.stderr.write('pnpm cannot list the licences. Run pnpm install first.\n');
    process.exitCode = 1;
    return;
  }
  const violations = findViolations(report);
  if (violations.length > 0) {
    process.stderr.write(`${violations.join('\n')}\n`);
    process.stderr.write('Allow a package only with a recorded exception in this script.\n');
    process.exitCode = 1;
    return;
  }
  const count = Object.values(report).flat().length;
  process.stdout.write(`Checked ${count} packages. Each has an allowed licence or an exception.\n`);
}

if (isMainModule(import.meta.url)) {
  main();
}
