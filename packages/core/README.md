<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
  <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="gatepost" height="48">
</picture>

# @gatepost/core

Parse, check and format Nigeria's digital postcodes, with no network access.

> Unofficial. Not made or endorsed by NIPOST.

[![CI](https://github.com/gatepost-dev/js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gatepost-dev/js/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](https://github.com/gatepost-dev/js/blob/main/LICENSE)

## Install

```sh
pnpm add @gatepost/core
```

## Quickstart

```ts
import { parse } from '@gatepost/core';

const result = parse('ek 01 a03 fk 01');
if (result.ok) {
  result.value.canonical; // 'EK-01-A03-FK-01'
} else {
  result.error.code; // for example 'bad_length'
}
```

`parse` accepts any spacing, dashes and letter case. For any string, it returns a result and never throws.

## What it does

- Reads codes that users type or paste.
- Names the problem in a bad code, and suggests a fix for common typos, such as O in place of 0.
- Recognises old 6-digit postcodes.
- Writes a code in its compact, canonical and display forms.
- Cuts a code down to its area, district, LGA or state, and checks whether one code contains another.
- Hides the unit of a code for logs.

The package checks the form of a postcode, with no network access. It checks the length, the characters, the state code and the rule for each segment. It cannot tell whether a building has a given postcode. Only NIPOST's API can say that.

### Read a postcode

A postcode has five segments: state, LGA, district, area and unit. When `parse` succeeds, `value` holds the postcode in its three forms, its segments and its precision. Set `allowPartial` to accept a code that stops after a segment.

```ts
import { parse } from '@gatepost/core';

const full = parse('ek 01 a03 fk 01');
if (full.ok) {
  full.value.compact; // 'EK01A03FK01'
  full.value.canonical; // 'EK-01-A03-FK-01'
  full.value.display; // 'EK 01 A03 FK 01'
  full.value.segments.state; // 'EK'
  full.value.precision; // 'unit'
}

const district = parse('EK-01-A03', { allowPartial: true });
if (district.ok) {
  district.value.precision; // 'district'
}
```

### Handle a bad code

When `parse` fails, `error.code` gives the reason: `empty`, `legacy_code`, `bad_character`, `bad_length`, `unknown_state` or `bad_segment`. For `unknown_state` and `bad_segment`, `error.segment` names the failing segment, and `error.suggestion` can hold a fixed code.

```ts
import { parse } from '@gatepost/core';

const mistyped = parse('ek o1 a03 fk 01'); // a letter o where a zero belongs
if (!mistyped.ok) {
  mistyped.error.code; // 'bad_segment'
  mistyped.error.segment; // 'lga'
  mistyped.error.suggestion; // 'EK-01-A03-FK-01'
}
```

A suggestion is a hint only. `parse` never returns the fixed code as a success. Show the suggestion to the user, and let the user decide.

### Limit the input

`parse` reads at most 64 code points of input. This is the input limit. Longer input fails with `bad_length`, even when it holds a valid code. The check runs before `parse` cleans the input, so long text cannot stall a server. `isLegacy` applies the same limit.

```ts
import { parse } from '@gatepost/core';

const code = 'EK-01-A03-FK-01';
parse(code.padEnd(64)).ok; // true
parse(code.padEnd(65)).ok; // false
```

### Clean typed text

`normalize` cleans text that a user typed or pasted. It applies Unicode NFKC, removes white space, hyphens, dashes, full stops and some zero-width characters, and changes ASCII letters to upper case. It does not check the result. It has no input limit, so call `parse` for text from an untrusted source.

```ts
import { normalize } from '@gatepost/core';

normalize(' ek-01 a03.fk-01 '); // 'EK01A03FK01'
```

### Recognise a legacy postcode

A legacy postcode is an old 6-digit postcode. It names an area, not a building. `isLegacy` recognises one, and `parse` fails on it with `legacy_code`.

```ts
import { isLegacy, parse } from '@gatepost/core';

isLegacy('900 108'); // true
isLegacy('EK-01-A03-FK-01'); // false

const legacy = parse('900108');
if (!legacy.ok) {
  legacy.error.code; // 'legacy_code'
}
```

### Name a state

`stateName` returns the English name of a state from its two-letter code, or `null` for an unknown code.

```ts
import { stateName } from '@gatepost/core';

stateName('EK'); // 'Ekiti'
stateName('fc'); // 'Federal Capital Territory'
stateName('XX'); // null
```

### Match a GPS fix to a precision

`precisionForAccuracy` returns the most precise segment that a GPS fix supports, from its accuracy in metres. It returns `lga` when the accuracy is unknown or too large.

```ts
import { precisionForAccuracy } from '@gatepost/core';

precisionForAccuracy(6); // 'unit'
precisionForAccuracy(35); // 'district'
precisionForAccuracy(null); // 'lga'
```

### Move between segments

`truncate` cuts a postcode down to a less precise segment. It throws a `RangeError` when you ask for more precision than the code has. `parent` returns the postcode one segment up, or `null` for a state. `contains` tells whether one postcode lies inside another.

```ts
import { contains, parent, parse, truncate } from '@gatepost/core';

const building = parse('EK-01-A03-FK-01');
const district = parse('EK-01-A03', { allowPartial: true });
if (building.ok && district.ok) {
  truncate(building.value, 'district').canonical; // 'EK-01-A03'
  parent(building.value)?.canonical; // 'EK-01-A03-FK'
  contains(district.value, building.value); // true
}
```

### Hide the unit in logs

`redact` replaces the unit with `**`, so that a log shows the area but not the building.

```ts
import { parse, redact } from '@gatepost/core';

const building = parse('EK-01-A03-FK-01');
if (building.ok) {
  redact(building.value); // 'EK-01-A03-FK-**'
}
```

## Requirements

| Requirement   | Version                             |
| ------------- | ----------------------------------- |
| Node          | 22 or later, or any current browser |
| Module format | ESM only                            |
| Gatepost spec | 0.1.0                               |

The package exports `SPEC_VERSION`, the version of the Gatepost spec that it implements.

```ts
import { SPEC_VERSION } from '@gatepost/core';

SPEC_VERSION; // '0.1.0'
```

## Docs

The API report is in [`etc/core.api.md`](https://github.com/gatepost-dev/js/blob/main/packages/core/etc/core.api.md). The Gatepost docs site will hold the full guide.

## Support

Ask questions in [GitHub Discussions](https://github.com/gatepost-dev/js/discussions). Report bugs in [GitHub Issues](https://github.com/gatepost-dev/js/issues). Report security problems privately, as [`SECURITY.md`](https://github.com/gatepost-dev/.github/blob/main/SECURITY.md) describes.

## Contributing

Read `CONTRIBUTING.md` before you open a pull request.

## Licence

Apache-2.0. See [`LICENSE`](https://github.com/gatepost-dev/js/blob/main/LICENSE) and [`NOTICE`](https://github.com/gatepost-dev/js/blob/main/NOTICE).
