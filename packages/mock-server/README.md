<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
  <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="gatepost" height="48">
</picture>

# @gatepost/mock-server

A local mock of NIPOST's postcode gateway, for the tests of Gatepost's clients.

> Unofficial. Not made or endorsed by NIPOST.

[![CI](https://github.com/gatepost-dev/js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gatepost-dev/js/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](https://github.com/gatepost-dev/js/blob/main/LICENSE)

## Install

The package does not go to npm. Run it from a clone of this repo. It needs no install step, because it has no dependencies and Node runs its TypeScript source.

```sh
git clone --recurse-submodules https://github.com/gatepost-dev/js
node js/packages/mock-server/src/main.ts
```

The command listens on port 4010 and prints its address. `GET /healthz` answers 200 with no key.

A release tag starts a workflow that publishes the image `ghcr.io/gatepost-dev/postcode-mock`. The image listens on port 4010. Until the first release, build the image from the root of a clone:

```sh
docker build --file packages/mock-server/Dockerfile --tag postcode-mock .
docker run --publish 4010:4010 postcode-mock
```

## Quickstart

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

## What it does

- It answers the six gateway endpoints with the synthetic responses in `spec/fixtures`. `spec/fixtures/README.md` says which request gets which response.
- It treats each key in `spec/fixtures/keys.json` in its own way: a lookup level from 1 to 3, no credits, no lookup scope, a rate limit, or a publishable key for the origin `http://localhost:3000`. A request with no key gets 401 `auth_required`, and any other key gets 401 `invalid_api_key`.
- It counts the requests of each key in each clock minute, and sends the `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers, as the gateway does.
- It does not answer an empty `q` of `autocomplete`, because the gateway does not answer one. The connection stays open until the client gives up.
- A request with the headers `X-Scenario-Id` and `X-Scenario-Run` gets the next response of that contract scenario in `spec/contract`. The CORS headers allow both, so browser tests can send them. The gateway itself does not allow them.

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

`spec/client.md` defines the behaviour that the contract scenarios test, and `spec/contract/README.md` defines their format.

## Support

Report bugs in GitHub Issues. Report security problems privately, as `SECURITY.md` describes.

## Contributing

Read [`CONTRIBUTING.md`](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md) before you open a pull request.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
