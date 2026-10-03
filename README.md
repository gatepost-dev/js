<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
  <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="gatepost" height="48">
</picture>

# Gatepost for TypeScript

TypeScript packages for Nigeria's National Digital Postcode.

> Unofficial. Not made or endorsed by NIPOST.

| Package                                         | What it does                                        |
| ----------------------------------------------- | --------------------------------------------------- |
| [`@gatepost/core`](packages/core)               | Parse, check and format postcodes offline.          |
| [`@gatepost/client`](packages/client)           | Call NIPOST's gateway, with retries and limits.     |
| [`@gatepost/field`](packages/field)             | A postcode field for any web form.                  |
| [`@gatepost/react`](packages/react)             | The postcode field as a React component.            |
| [`@gatepost/mock-server`](packages/mock-server) | Mock NIPOST's gateway for client tests. Not on npm. |

## Develop

You need Node 24, `corepack enable`, Python 3.11 or later and `uv`.

    git clone --recurse-submodules https://github.com/gatepost-dev/js
    pnpm install
    pnpm exec playwright install chromium
    pnpm check

The tests of the field and of the React package run in Chromium, which Playwright installs once.
`pnpm check` runs the journeys of the field too, with a test page on port 3000 and the mock server
on port 4010, so both ports must be free.

`pnpm check` also builds the packages. Then it runs publint, attw, size-limit and API Extractor on
the result, and it starts each built package once. It checks the licence of each dependency and of
each file, and it checks the workflows with zizmor. It starts REUSE and zizmor with `uvx` at pinned
versions. REUSE needs an encoding detector, and `uvx` installs REUSE without one, so the script pins
`charset-normalizer` as well. Renovate updates the three pins. After a change to the public API of a
package, run `pnpm --filter <package> run api:update` and commit its `etc/<name>.api.md`. For each
change to a package, add a change file with `pnpm changeset`, or with `pnpm changeset --empty` when
the change needs no release. The pull request job fails without a change file.

A squash merge writes the commit message from the title and the body of the pull request. The same
job lints that message. Write the title as a Conventional Commits header with a scope, and end the
body with your `Signed-off-by` line. A line of the body has at most 100 characters, and a web form
does not wrap lines, so break them yourself. The title and the suffix `(#N)` that GitHub adds have
at most 72 characters together.

The mutation run (`pnpm --filter @gatepost/core run mutation`) uses Stryker's command runner in
place, because the Stryker Vitest runner does not match Vitest 5 test names. After a run that
stops hard, run `git checkout packages/core && rm -rf packages/core/.stryker-tmp`, which also
discards your uncommitted changes in that folder.

Read [`CONTRIBUTING.md`](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md) and
`CODING_STANDARDS.md` before you open a pull request.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
