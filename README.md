<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
    <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="Gatepost" width="240">
  </picture>
</p>

<h1 align="center">Gatepost for TypeScript</h1>

<p align="center">TypeScript packages for Nigeria's National Digital Postcode.</p>

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
  <a href="https://gatepost-dev.github.io/docs/guides/typescript/">TypeScript guide</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md">Contributing</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/gatepost-dev/js/discussions">Discussions</a>
</p>

> Unofficial. Not made or endorsed by NIPOST.

## Packages

| Package                                         | What it is                                      | Status                     |
| ----------------------------------------------- | ----------------------------------------------- | -------------------------- |
| [`@gatepost/core`](packages/core)               | Parse, check and format postcodes offline.      | Alpha, not on npm yet      |
| [`@gatepost/client`](packages/client)           | Call NIPOST's gateway, with retries and limits. | Alpha, not on npm yet      |
| [`@gatepost/field`](packages/field)             | A postcode field for any web form.              | Alpha, not on npm yet      |
| [`@gatepost/react`](packages/react)             | The postcode field as a React component.        | Alpha, not on npm yet      |
| [`@gatepost/mock-server`](packages/mock-server) | Mock NIPOST's gateway for client tests.         | Private, never goes to npm |

## Example

```ts
import { parse } from '@gatepost/core';

const parsed = parse('ek 01 a03 fk 01');
if (parsed.ok) {
  parsed.value.canonical; // 'EK-01-A03-FK-01'
}
```

The [TypeScript guide](https://gatepost-dev.github.io/docs/guides/typescript/) and the [client guide](https://gatepost-dev.github.io/docs/guides/typescript-client/) show every function. The [reference](https://gatepost-dev.github.io/docs/reference/js/core/) lists every export.

## Develop

Read [`docs/develop.md`](docs/develop.md) for the set-up, the checks and the rules for a pull request. Then read the [contributing guide](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md).

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
