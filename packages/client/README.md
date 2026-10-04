<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
    <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="Gatepost" width="240">
  </picture>
</p>

<h1 align="center">@gatepost/client</h1>

<p align="center">Call NIPOST's postcode gateway from TypeScript: look up a postcode, find the postcode of a place, and complete a postcode that a user is typing.</p>

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
  <a href="https://gatepost-dev.github.io/docs/guides/typescript-client/">Guide</a>
  &nbsp;&middot;&nbsp;
  <a href="https://gatepost-dev.github.io/docs/reference/js/client/">Reference</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md">Contributing</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/gatepost-dev/js/discussions">Discussions</a>
</p>

> Unofficial. Not made or endorsed by NIPOST.

## Install

```sh
pnpm add @gatepost/client
```

The first alpha is not published yet, so this command does not work today. The package installs `@gatepost/core`, which parses each postcode before a request goes out.

## Use

```ts
import { PostcodeClient } from '@gatepost/client';

const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
const result = await client.lookup('fc 01 z99 zz 01');
result.postcode.canonical; // 'FC-01-Z99-ZZ-01'
result.valid; // true
```

The examples use `FC-01-Z99-ZZ-01`, a synthetic postcode, and show the answers of Gatepost's mock server, which CI runs them against. The real gateway does not know this postcode.

Get a key from NIPOST's dashboard. The gateway refuses every call without a key. A key that starts with `nipost_test_` or `nipost_live_` is a secret key, so keep it on a server. The client refuses a secret key in a page that has a `document`.

Each call raises a `PostcodeError` when it cannot give a result. Its `code` is one of `invalid_input`, `unauthorized`, `insufficient_credits`, `origin_not_allowed`, `forbidden`, `rate_limited`, `server_error`, `unexpected_response`, `network_error` and `timeout`.

```ts
import { PostcodeClient, PostcodeError } from '@gatepost/client';

const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
try {
  await client.lookup('900108');
} catch (error) {
  if (error instanceof PostcodeError) {
    error.code; // 'invalid_input'
    error.status; // null
  }
}
```

`900108` is a legacy postcode, so the client sends no request for it.

## Main functions

| Call                       | What it does                                                  |
| -------------------------- | ------------------------------------------------------------- |
| `new PostcodeClient(opts)` | Makes a client. See the settings below.                       |
| `client.lookup`            | Looks up a postcode at a lookup level from 1 to 5.            |
| `client.reverse`           | Finds the unit at a latitude and a longitude.                 |
| `client.autocomplete`      | Offers the values of the segment that a user is typing.       |
| `client.clearCache`        | Removes every result that the client kept.                    |
| `PostcodeError`            | The error of a call. It holds `code`, `status` and `apiCode`. |
| `SPEC_VERSION`             | The version of the Gatepost spec that the package implements. |

| Option       | Meaning                                             | Default                            |
| ------------ | --------------------------------------------------- | ---------------------------------- |
| `apiKey`     | the key for the `X-API-Key` header                  | none, so no key is sent            |
| `baseUrl`    | the gateway's address                               | `https://api.postcode.gov.ng`      |
| `timeoutMs`  | the longest wait for one attempt, in milliseconds   | 8000, and 15000 for `autocomplete` |
| `maxRetries` | the most retries after the first attempt            | 2                                  |
| `cacheTtlMs` | how long the client keeps a result, in milliseconds | 0, which keeps none                |

The client also takes a `transport` option, a function like `fetch`, and each call takes an `AbortSignal`.

## Features

- Checks each postcode offline first, so a bad code sends no request.
- Retries a failed request when a retry can help, and waits between attempts.
- Shares one request between identical calls, and sends at most 4 requests at a time.
- Keeps results for a time that you choose. It keeps none by default.
- Sends your key only in the `X-API-Key` header. It has no logging.
- Is under 6 kB with `@gatepost/core`, minified and brotlied.

## Requirements

| Requirement   | Version                                        |
| ------------- | ---------------------------------------------- |
| Node          | 22 or later, or a current browser with `fetch` |
| Module format | ESM only                                       |
| Gatepost spec | 0.3.0                                          |

## Docs

The [guide](https://gatepost-dev.github.io/docs/guides/typescript-client/) covers levels, errors, cancelling and the settings. The [reference](https://gatepost-dev.github.io/docs/reference/js/client/) lists every export. The API report is in [`etc/client.api.md`](https://github.com/gatepost-dev/js/blob/main/packages/client/etc/client.api.md). [`client.md`](https://gatepost-dev.github.io/docs/spec/client/) defines the results, the errors and the retries, and every Gatepost client passes the same contract scenarios.

## Support

Ask questions in [GitHub Discussions](https://github.com/gatepost-dev/js/discussions). Report bugs in [GitHub Issues](https://github.com/gatepost-dev/js/issues). Report security problems through the [private reporting form](https://github.com/gatepost-dev/js/security/advisories/new).

## Develop

Read [`docs/develop.md`](https://github.com/gatepost-dev/js/blob/main/docs/develop.md) and the [contributing guide](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md) before you open a pull request.

## Licence

Apache-2.0. See [`LICENSE`](https://github.com/gatepost-dev/js/blob/main/LICENSE) and [`NOTICE`](https://github.com/gatepost-dev/js/blob/main/NOTICE).
