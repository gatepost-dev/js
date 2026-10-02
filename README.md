<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
  <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="gatepost" height="48">
</picture>

# Gatepost for TypeScript

TypeScript packages for Nigeria's National Digital Postcode.

> Unofficial. Not made or endorsed by NIPOST.

| Package                           | What it does                               |
| --------------------------------- | ------------------------------------------ |
| [`@gatepost/core`](packages/core) | Parse, check and format postcodes offline. |

## Develop

You need Node 24, `corepack enable`, Python 3.11 or later and `uv`.

    git clone --recurse-submodules https://github.com/gatepost-dev/js
    pnpm install
    pnpm check

`pnpm check` also builds the package. Then it runs publint, attw, size-limit and API Extractor on
the result, and it checks the licence of each dependency. After a change to the public API, run
`pnpm --filter @gatepost/core run api:update` and commit `packages/core/etc/core.api.md`. For each
user-visible change, add a change file with `pnpm changeset`.

The mutation run (`pnpm --filter @gatepost/core run mutation`) uses Stryker's command runner in
place, because the Stryker Vitest runner does not match Vitest 5 test names. After a run that
stops hard, run `git checkout packages/core && rm -rf packages/core/.stryker-tmp`, which also
discards your uncommitted changes in that folder.

Read `CONTRIBUTING.md` and `CODING_STANDARDS.md` before you open a pull request.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
