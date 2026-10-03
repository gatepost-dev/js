<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
    <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="Gatepost" width="240">
  </picture>
</p>

<h1 align="center">@gatepost/core</h1>

<p align="center">Parse, check and format Nigeria's digital postcodes, with no network access.</p>

<p align="center">
  <a href="https://github.com/gatepost-dev/js/actions/workflows/ci.yml"><img src="https://github.com/gatepost-dev/js/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <a href="https://github.com/gatepost-dev/js/blob/main/LICENSE"><img src="https://img.shields.io/badge/licence-Apache--2.0-blue?style=flat" alt="Licence: Apache-2.0"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/gatepost-dev/js"><img src="https://api.scorecard.dev/projects/github.com/gatepost-dev/js/badge" alt="OpenSSF Scorecard"></a>
</p>

<p align="center">
  <a href="https://gatepost-dev.github.io/docs/">Docs</a>
  &nbsp;&middot;&nbsp;
  <a href="https://gatepost-dev.github.io/docs/playground/">Playground</a>
  &nbsp;&middot;&nbsp;
  <a href="https://gatepost-dev.github.io/docs/guides/typescript/">Guide</a>
  &nbsp;&middot;&nbsp;
  <a href="https://gatepost-dev.github.io/docs/reference/js/core/">Reference</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md">Contributing</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/gatepost-dev/js/discussions">Discussions</a>
</p>

> Unofficial. Not made or endorsed by NIPOST.

## Install

```sh
pnpm add @gatepost/core
```

The first alpha is not published yet, so this command does not work today.

## Use

```ts
import { parse } from '@gatepost/core';

const parsed = parse('ek 01 a03 fk 01');
if (parsed.ok) {
  parsed.value.canonical; // 'EK-01-A03-FK-01'
  parsed.value.display; // 'EK 01 A03 FK 01'
} else {
  parsed.error.code; // for example 'bad_length'
}
```

`parse` accepts any spacing, dashes and letter case. For any string, it returns a result and never throws. It reads at most 64 code points of input, and a longer input fails with `bad_length`.

When a code has a common typo, the error holds a `suggestion`. Show it to the user. `parse` never accepts the fixed code for you.

```ts
import { contains, parse, redact, truncate } from '@gatepost/core';

const mistyped = parse('ek o1 a03 fk 01'); // a letter o where a zero belongs
if (!mistyped.ok) {
  mistyped.error.code; // 'bad_segment'
  mistyped.error.suggestion; // 'EK-01-A03-FK-01'
}

const building = parse('EK-01-A03-FK-01');
const district = parse('EK-01-A03', { allowPartial: true });
if (building.ok && district.ok) {
  truncate(building.value, 'district').canonical; // 'EK-01-A03'
  contains(district.value, building.value); // true
  redact(building.value); // 'EK-01-A03-FK-**'
}
```

## Main functions

| Function               | What it does                                                             |
| ---------------------- | ------------------------------------------------------------------------ |
| `parse`                | Reads text and returns a postcode or an error. Never throws.             |
| `normalize`            | Cleans typed or pasted text. It does not check the result.               |
| `isLegacy`             | Recognises an old 6-digit postcode.                                      |
| `stateName`            | Returns the name of a state from its two-letter code, or `null`.         |
| `precisionForAccuracy` | Returns the most precise segment that a GPS accuracy in metres supports. |
| `truncate`             | Shortens a postcode to a less precise segment.                           |
| `parent`               | Returns the postcode one segment up, or `null` for a state.              |
| `contains`             | Tells whether one postcode lies inside another.                          |
| `redact`               | Replaces the unit with `**`, so that a log does not show the building.   |
| `SPEC_VERSION`         | The version of the Gatepost spec that the package implements.            |

## Features

- Reads codes that users type or paste, including full-width characters.
- Names the problem in a bad code, and suggests a fix for common typos such as O in place of 0.
- Recognises old 6-digit postcodes.
- Writes a code in its compact, canonical and display forms.
- Moves between the levels of a postcode, from a building up to its state.
- Has no dependencies. It is about 2 kB, minified and brotlied.

The package checks the form of a postcode. It cannot tell whether a building has a given postcode. Only NIPOST's API can say that. For that, use [`@gatepost/client`](../client).

## Requirements

| Requirement   | Version                             |
| ------------- | ----------------------------------- |
| Node          | 22 or later, or any current browser |
| Module format | ESM only                            |
| Gatepost spec | 0.2.0                               |

## Docs

The [guide](https://gatepost-dev.github.io/docs/guides/typescript/) shows each function with an example. The [reference](https://gatepost-dev.github.io/docs/reference/js/core/) lists every export. Try the package in the [playground](https://gatepost-dev.github.io/docs/playground/). The API report is in [`etc/core.api.md`](https://github.com/gatepost-dev/js/blob/main/packages/core/etc/core.api.md).

## Support

Ask questions in [GitHub Discussions](https://github.com/gatepost-dev/js/discussions). Report bugs in [GitHub Issues](https://github.com/gatepost-dev/js/issues). Report security problems through the [private reporting form](https://github.com/gatepost-dev/js/security/advisories/new).

## Develop

Read [`docs/develop.md`](https://github.com/gatepost-dev/js/blob/main/docs/develop.md) and the [contributing guide](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md) before you open a pull request.

## Licence

Apache-2.0. See [`LICENSE`](https://github.com/gatepost-dev/js/blob/main/LICENSE) and [`NOTICE`](https://github.com/gatepost-dev/js/blob/main/NOTICE).
