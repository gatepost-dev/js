<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
    <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="Gatepost" width="240">
  </picture>
</p>

<h1 align="center">@gatepost/mock-server</h1>

<p align="center">A local mock of NIPOST's postcode gateway, for the tests of Gatepost's clients.</p>

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
  <a href="https://gatepost-dev.github.io/docs/spec/client/">Client spec</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md">Contributing</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/gatepost-dev/js/discussions">Discussions</a>
</p>

> Unofficial. Not made or endorsed by NIPOST.

## Install

The package is private and does not go to npm. Run it from a clone of this repo. It needs no install step, because it has no dependencies and Node runs its TypeScript source.

```sh
git clone --recurse-submodules https://github.com/gatepost-dev/js
node js/packages/mock-server/src/main.ts
```

The command listens on port 4010 and prints its address. `GET /healthz` answers 200 with no key.

A release tag starts a workflow that publishes the image `ghcr.io/gatepost-dev/postcode-mock:0.1.0`. The image is not public yet, so a pull of it fails today. Build the image from the root of a clone:

```sh
docker build --file packages/mock-server/Dockerfile --tag postcode-mock .
docker run --publish 4010:4010 postcode-mock
```

## Use

```ts
import { startMockServer } from '@gatepost/mock-server';

const mock = await startMockServer({ port: 0 });
const response = await fetch(`${mock.url}/v1/lookup?code=FC-01-Z99-ZZ-01`, {
  headers: { 'X-API-Key': 'nipost_test_mock_l1' },
});
const body = await response.json();
await mock.close();
```

`body` is `{ data: { postcode: 'FC-01-Z99-ZZ-01', valid: true, status: 'valid', verified: false } }`, the gateway's answer at lookup level 1.

## Features

- Answers the six gateway endpoints with the synthetic responses in `spec/fixtures`.
- Treats each key in `spec/fixtures/keys.json` in its own way: a lookup level, no credits, a rate limit, or a publishable key.
- Counts the requests of each key in each clock minute, and sends the `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers.
- Plays a contract scenario from `spec/contract` for a request with the headers `X-Scenario-Id` and `X-Scenario-Run`.

| Variable            | Meaning                                         | Default                             |
| ------------------- | ----------------------------------------------- | ----------------------------------- |
| `PORT`              | the port. 0 picks a free one                    | 4010                                |
| `HOST`              | the address to listen on                        | 127.0.0.1, and 0.0.0.0 in the image |
| `MOCK_DELAY_MS`     | a wait before every response, for timeout tests | 0                                   |
| `GATEPOST_SPEC_DIR` | the spec folder                                 | the `spec` submodule                |

## Requirements

| Requirement   | Version                                    |
| ------------- | ------------------------------------------ |
| Node          | 22.22.2 or later 22.x, or 24.15.0 or later |
| Gatepost spec | 0.2.0                                      |

## Docs

`spec/fixtures/README.md` says which request gets which response. `spec/client.md` defines the behaviour that the contract scenarios test, and `spec/contract/README.md` defines their format.

## Support

Ask questions in [GitHub Discussions](https://github.com/gatepost-dev/js/discussions). Report bugs in [GitHub Issues](https://github.com/gatepost-dev/js/issues). Report security problems through the [private reporting form](https://github.com/gatepost-dev/js/security/advisories/new).

## Develop

Read [`docs/develop.md`](https://github.com/gatepost-dev/js/blob/main/docs/develop.md) and the [contributing guide](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md) before you open a pull request.

## Licence

Apache-2.0. See [`LICENSE`](https://github.com/gatepost-dev/js/blob/main/LICENSE) and [`NOTICE`](https://github.com/gatepost-dev/js/blob/main/NOTICE).
