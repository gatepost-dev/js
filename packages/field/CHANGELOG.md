# @gatepost/field

## 0.1.0-alpha.0

### Minor Changes

- 0003151: Add the custom element `gatepost-postcode-field`. A plain HTML form submits the canonical form of the postcode. The field checks the format offline, offers the fix of a look-alike character, accepts or refuses a legacy postcode, and works with the keyboard alone. With a publishable key, it asks NIPOST's gateway about each whole postcode and names its place. A failed or negative answer never stops the form. The field refuses a secret key and sends no request with it. With `gps` and a key, it fills in the postcode of the user's location, or only the part that the accuracy supports, when the user presses its button.

### Patch Changes

- Updated dependencies [0003151]
- Updated dependencies [c94adef]
- Updated dependencies [0003151]
- Updated dependencies [f933b93]
- Updated dependencies [69d7dd4]
- Updated dependencies [b248de7]
  - @gatepost/client@0.1.0-alpha.0
  - @gatepost/core@0.1.0-alpha.1
