<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
  <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="gatepost" height="48">
</picture>

# @gatepost/client

Call NIPOST's postcode gateway from TypeScript: look up a postcode, find the postcode of a place, and complete a postcode that a user is typing.

> Unofficial. Not made or endorsed by NIPOST.

[![CI](https://github.com/gatepost-dev/js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gatepost-dev/js/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](https://github.com/gatepost-dev/js/blob/main/LICENSE)

## Install

```sh
pnpm add @gatepost/client
```

The package installs `@gatepost/core`, which parses each postcode before a request goes out.

## Quickstart

```ts
import { PostcodeClient } from '@gatepost/client';

const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
const result = await client.lookup('fc 01 z99 zz 01');
result.postcode.canonical; // 'FC-01-Z99-ZZ-01'
result.valid; // true
```

The examples use `FC-01-Z99-ZZ-01`, a synthetic postcode, and show the answers of Gatepost's mock server, which CI runs them against. The real gateway does not know this postcode.

Get a key from NIPOST's dashboard. The gateway refuses every call without a key. A key that starts with `nipost_test_` or `nipost_live_` is a secret key, so keep it on a server. The client refuses a secret key in a page that has a `document`, such as a web page.

## What it does

- Looks up a postcode at a lookup level from 1 to 5.
- Finds the unit at a coordinate.
- Offers the values of the segment that a user is typing.
- Checks each postcode offline first, so a bad code sends no request.
- Retries a failed request when a retry can help, and waits between attempts.
- Shares one request between identical calls, and sends at most 4 requests at a time.
- Keeps results for a time that you choose. It keeps none by default.

The client sends only the requests that you make. It has no logging. It sends your key only in the `X-API-Key` header, and none of its own error messages holds the key.

### Look up a postcode

`lookup` takes a postcode in any form, or a postcode that `parse` from `@gatepost/core` returned. A postcode that the gateway does not know gives `valid` false and a `status` of `not_found`, not an error.

```ts
import { PostcodeClient } from '@gatepost/client';

const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
const unknown = await client.lookup('FC-01-Z99-ZZ-02');
unknown.valid; // false
unknown.status; // 'not_found'
```

A key holds a lookup level, and `lookup` sends level 1 when you give none. NIPOST's docs say that level 1 tells only whether a postcode exists, level 2 adds the names of the places that hold it and a recent house address, and level 3 adds what the building is used for. A call above the key's level fails with `forbidden`. The gateway does not say which level it sent, so `levelReceived` comes from the fields of the response.

```ts
import { PostcodeClient } from '@gatepost/client';

const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
const result = await client.lookup('FC-01-Z99-ZZ-01', { level: 2 });
result.levelRequested; // 2
result.levelReceived; // 2
result.administrativeAddress?.lgaName; // 'SYNTHETIC LGA'
```

Gatepost has seen only level 1 responses from the gateway. The fields of levels 2 to 5 are documented, not observed: they follow NIPOST's docs, and no Gatepost test has seen them from the gateway yet. The example above shows the answer of the mock server.

### Handle errors

Each call raises a `PostcodeError` when it cannot give a result. Its `code` is one of `invalid_input`, `unauthorized`, `insufficient_credits`, `origin_not_allowed`, `forbidden`, `rate_limited`, `server_error`, `unexpected_response`, `network_error` and `timeout`. `unexpected_response` means that the gateway answered 200 with a body that the client cannot read. `status` holds the HTTP status, and `apiCode` holds the gateway's own error code.

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

`900108` is a legacy postcode, so the client sends no request for it. Show the user the message for the error code, not the error's own message, which is for developers.

When the gateway limits a key, the error is `rate_limited`. The client waits and tries again when the gateway asks for a wait of 10 seconds or less. For a longer wait, `retryAfterMs` holds it, so you can tell the user when to try again.

### Find the postcode of a place

`reverse` takes a latitude and a longitude in degrees, and an optional radius in metres. The gateway uses 25 m when you give no radius, and 250 m at most. `found` can be true while `unit` is null: the gateway then found an area, but no unit within the radius.

```ts
import { PostcodeClient } from '@gatepost/client';

const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
const place = await client.reverse(9, 7);
place.found; // true
place.unit?.postcode.canonical; // 'FC-01-Z99-ZZ-01'
place.area; // 'FC-01-Z99-ZZ'
```

A GPS fix is only as good as its accuracy. `precisionForAccuracy` from `@gatepost/core` tells you which segment a fix supports.

### Complete a typed postcode

`autocomplete` takes the text that a user typed. It names the segment that the user is typing, and the gateway's values for it. Each value comes with the partial postcode that it completes.

```ts
import { PostcodeClient } from '@gatepost/client';

const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
const typing = await client.autocomplete('fc 01 z');
typing.segment; // 'district'
typing.suggestions[0]?.code; // 'Z99'
typing.suggestions[0]?.postcode?.canonical; // 'FC-01-Z99'
```

Empty text sends no request and fails with `invalid_input`, because the gateway does not answer it. A timeout of `autocomplete` gets no retry, because the next keystroke replaces the call. `autocomplete` waits 15 seconds for one attempt, not 8, unless you set `timeoutMs`.

### Cancel a call

Each call takes an `AbortSignal`. A cancelled call ends with the signal's reason, not with a `PostcodeError`. When every caller of a shared request cancels, the request stops and frees its place.

```ts
import { PostcodeClient } from '@gatepost/client';

const client = new PostcodeClient({ apiKey: process.env['NIPOST_API_KEY'] });
const keystroke = new AbortController();
const call = client.autocomplete('fc 0', { signal: keystroke.signal });
keystroke.abort();
const outcome = await call.catch((reason: unknown) => reason);
outcome === keystroke.signal.reason; // true
```

### Choose the settings

| Option       | Meaning                                             | Default                            |
| ------------ | --------------------------------------------------- | ---------------------------------- |
| `apiKey`     | the key for the `X-API-Key` header                  | none, so no key is sent            |
| `baseUrl`    | the gateway's address                               | `https://api.postcode.gov.ng`      |
| `transport`  | the function that sends each request, like `fetch`  | the platform's `fetch`             |
| `timeoutMs`  | the longest wait for one attempt, in milliseconds   | 8000, and 15000 for `autocomplete` |
| `maxRetries` | the most retries after the first attempt            | 2                                  |
| `cacheTtlMs` | how long the client keeps a result, in milliseconds | 0, which keeps none                |

A client retries a 502, 503 or 504, a lost connection and a timeout. It waits 500 ms before the first retry and 1000 ms before the second, plus up to 250 ms at random. With `cacheTtlMs` above 0, an identical call within that time gets the kept result with no request. Errors stay out of the cache, and `clearCache` removes every kept result. The cache of each call type keeps at most 1000 results and drops the oldest first.

```ts
import { PostcodeClient } from '@gatepost/client';

const apiKey = process.env['NIPOST_API_KEY'];
const client = new PostcodeClient({ apiKey, cacheTtlMs: 60_000 });
await client.lookup('FC-01-Z99-ZZ-01');
client.clearCache();
```

## Requirements

| Requirement   | Version                                        |
| ------------- | ---------------------------------------------- |
| Node          | 22 or later, or a current browser with `fetch` |
| Module format | ESM only                                       |
| Gatepost spec | 0.2.0                                          |

The package exports `SPEC_VERSION`, the version of the Gatepost spec that it implements.

```ts
import { SPEC_VERSION } from '@gatepost/client';

SPEC_VERSION; // '0.2.0'
```

## Docs

The API report is in [`etc/client.api.md`](https://github.com/gatepost-dev/js/blob/main/packages/client/etc/client.api.md). [`client.md`](https://github.com/gatepost-dev/spec/blob/main/client.md) in the spec repo defines the results, the errors and the retries, and every Gatepost client passes the same contract scenarios.

## Support

Ask questions and report bugs in [GitHub Issues](https://github.com/gatepost-dev/js/issues). Report security problems privately, as [`SECURITY.md`](https://github.com/gatepost-dev/.github/blob/main/SECURITY.md) describes.

## Contributing

Read [`CONTRIBUTING.md`](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md) before you open a pull request.

## Licence

Apache-2.0. See [`LICENSE`](https://github.com/gatepost-dev/js/blob/main/LICENSE) and [`NOTICE`](https://github.com/gatepost-dev/js/blob/main/NOTICE).
