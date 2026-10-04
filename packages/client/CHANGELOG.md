# @gatepost/client

## 0.1.0-alpha.0

### Minor Changes

- f933b93: Add the client package. It looks up postcodes, finds the postcode of a place and completes a typed postcode through NIPOST's gateway, with the retries, waits and limits of spec 0.2.0.

### Patch Changes

- 0003151: The package implements spec 0.3.0. That version adds the postcode field and its messages, and leaves the client contract as it was, so every call behaves as before.
- 69d7dd4: Refuse secret keys with surrounding white space in browser clients.
- b248de7: The README of each package is shorter and links the docs site for the full guide and the reference.
- Updated dependencies [c94adef]
- Updated dependencies [0003151]
- Updated dependencies [b248de7]
  - @gatepost/core@0.1.0-alpha.1
