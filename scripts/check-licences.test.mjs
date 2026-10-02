// SPDX-FileCopyrightText: 2026 The Gatepost authors
// SPDX-License-Identifier: Apache-2.0
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findViolations } from './check-licences.mjs';

function report(licence, ...names) {
  return { [licence]: names.map((name) => ({ name, versions: ['1.2.3'] })) };
}

describe('findViolations', () => {
  const policy = {
    allowed: ['MIT', 'Apache-2.0'],
    exceptions: [{ name: 'data-pack', licence: 'CC-BY-4.0', reason: 'A dev-only data licence.' }],
  };

  it('accepts a dependency with an allowed licence', () => {
    assert.deepEqual(findViolations(report('MIT', 'left-pad'), policy), []);
  });

  it('names the package, its versions and its licence when the licence is not allowed', () => {
    const entries = { 'GPL-3.0': [{ name: 'copyleft', versions: ['1.0.0', '2.0.0'] }] };
    assert.deepEqual(findViolations(entries, policy), [
      'copyleft@1.0.0, 2.0.0 has the licence GPL-3.0.',
    ]);
  });

  it('reports a package that has no licence', () => {
    assert.equal(findViolations(report('Unknown', 'no-licence'), policy).length, 1);
  });

  it('accepts a dual licence when one alternative is allowed', () => {
    assert.deepEqual(findViolations(report('(GPL-3.0 OR MIT)', 'dual'), policy), []);
    assert.deepEqual(findViolations(report('MIT OR Apache-2.0', 'dual'), policy), []);
  });

  it('rejects a dual licence when no alternative is allowed', () => {
    assert.equal(findViolations(report('GPL-3.0 OR AGPL-3.0', 'dual'), policy).length, 1);
  });

  it('rejects an expression that joins licences with AND or with nested parentheses', () => {
    assert.equal(findViolations(report('MIT AND Apache-2.0', 'both'), policy).length, 1);
    const hidden = report('GPL-3.0 AND (MIT OR Apache-2.0)', 'hidden');
    assert.equal(findViolations(hidden, policy).length, 1);
  });

  it('accepts an exception that names the package and its licence', () => {
    assert.deepEqual(findViolations(report('CC-BY-4.0', 'data-pack'), policy), []);
  });

  it('reports a package under the licence of an exception when its name differs', () => {
    assert.equal(findViolations(report('CC-BY-4.0', 'other-pack'), policy).length, 1);
  });

  it('reports an excepted package when its licence changes', () => {
    assert.equal(findViolations(report('GPL-3.0', 'data-pack'), policy).length, 1);
  });

  it('matches the packages of an exception that has a name pattern', () => {
    const withPattern = {
      allowed: [],
      exceptions: [{ name: /^native(-.+)?$/, licence: 'MPL-2.0', reason: 'One per platform.' }],
    };
    const entries = report('MPL-2.0', 'native', 'native-linux-x64', 'nativeish');
    assert.deepEqual(findViolations(entries, withPattern), [
      'nativeish@1.2.3 has the licence MPL-2.0.',
    ]);
  });
});

describe('the default policy', () => {
  // The first six are in the standard. The last three are permissive too (Ruling R31).
  const permissive = [
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

  for (const licence of permissive) {
    it(`allows the permissive licence ${licence}`, () => {
      assert.deepEqual(findViolations(report(licence, 'any-package')), []);
    });
  }

  for (const licence of ['GPL-3.0', 'AGPL-3.0', 'LGPL-3.0', 'MPL-2.0', 'UNLICENSED', 'Unknown']) {
    it(`rejects the licence ${licence} for an unlisted package`, () => {
      assert.equal(findViolations(report(licence, 'any-package')).length, 1);
    });
  }

  it('records caniuse-lite as the one package that may use CC-BY-4.0', () => {
    assert.deepEqual(findViolations(report('CC-BY-4.0', 'caniuse-lite')), []);
    assert.equal(findViolations(report('CC-BY-4.0', 'another-data-set')).length, 1);
  });

  it('records spdx-exceptions as the one package that may use CC-BY-3.0', () => {
    assert.deepEqual(findViolations(report('CC-BY-3.0', 'spdx-exceptions')), []);
    assert.equal(findViolations(report('CC-BY-3.0', 'another-data-set')).length, 1);
    assert.equal(findViolations(report('CC-BY-4.0', 'spdx-exceptions')).length, 1);
  });

  it('records lightningcss and its platform packages as the only users of MPL-2.0', () => {
    const platforms = ['lightningcss', 'lightningcss-darwin-arm64', 'lightningcss-linux-x64-gnu'];
    assert.deepEqual(findViolations(report('MPL-2.0', ...platforms)), []);
    assert.equal(findViolations(report('MPL-2.0', 'lightningcssx', 'another-tool')).length, 2);
  });
});
