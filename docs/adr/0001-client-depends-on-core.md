# 1. The client depends on the core

Date: 9 Oct 2026

## Context

`@gatepost/client` must parse each postcode before it sends a lookup, so that a bad code sends no request. It also returns parsed postcodes in its results, and it builds the partial postcode of each autocomplete offer. `@gatepost/core` holds the only parser, with the state table and the segment rules from the spec data.

The roadmap says that the client has no runtime dependencies. DEP-3 asks for a record of each new runtime dependency.

## Decision

The client lists `@gatepost/core` as its one dependency, with a caret range on the same release line. It has no other dependency. Its size limit of 5 KB counts the core too, because size-limit bundles the dependencies.

## Reasons

- A copy of the parser in the client would be a second place for the spec data, which CS-4 forbids, and an app that uses both packages would ship the parser twice.
- The core is a Gatepost package with no dependencies of its own, so the client still pulls in no third-party code.
- The client's types name the core's `Postcode` and `Precision`, so a caller can pass a parsed postcode to `lookup`.

## Consequences

- A breaking release of the core needs a release of the client.
- The client's tests and type check read the core's source, so they need no build of the core first. The published package reads the core's built files.
