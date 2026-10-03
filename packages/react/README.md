<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
  <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="gatepost" height="48">
</picture>

# @gatepost/react

The Gatepost postcode field as a React component. It renders on the server, and a plain form sends the postcode in its canonical form.

> Unofficial. Not made or endorsed by NIPOST.

[![CI](https://github.com/gatepost-dev/js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gatepost-dev/js/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](https://github.com/gatepost-dev/js/blob/main/LICENSE)

## Install

```sh
pnpm add @gatepost/react
```

The first alpha is not on npm yet, so this command works only after its release.

The package installs `@gatepost/field`, the custom element that does the work.

## Quickstart

```tsx
'use client';
import { useState, type ReactElement } from 'react';
import { PostcodeField } from '@gatepost/react';

export function AddressForm(): ReactElement {
  const [postcode, setPostcode] = useState('');
  return (
    <form action="/address">
      <PostcodeField
        name="postcode"
        required
        onChange={(detail) => {
          setPostcode(detail.value);
        }}
      />
      <p>{postcode}</p>
      <button>Continue</button>
    </form>
  );
}
```

A user who types `fc 01 z99 zz 01` sees `FC-01-Z99-ZZ-01`, and the form sends `postcode=FC-01-Z99-ZZ-01`.

## What it does

- Renders `<gatepost-postcode-field>` with one attribute for each prop, so the HTML of a server render already holds the field's settings.
- Calls `onChange`, `onConfirm` and `onError` with the detail of each event of the field.
- Gives the element through `ref`, for `checkValidity()` and the other members of a form control.
- Works with React 18 and React 19, and in the App Router of Next.js, because the module starts with `'use client'`.

The field keeps its own text, as an uncontrolled input does. `defaultValue` sets the text at first. Read each new value in `onChange`, or read the form when it submits.

| Prop                                           | Meaning                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `name`, `defaultValue`, `required`, `disabled` | as for a native input                                                 |
| `label`                                        | the visible label. The default is `Postcode`                          |
| `apiKey`                                       | a publishable key. Without one, the field sends no request            |
| `baseUrl`                                      | the gateway's address                                                 |
| `confirm`                                      | `none`, `level1` or `level2`. The default is `level1`                 |
| `gps`                                          | true shows the location button, when the field has a key              |
| `legacy`                                       | `accept` or `reject` an old 6-digit postcode. The default is `accept` |
| `messages`                                     | text that replaces the English messages, by key                       |

The [README of `@gatepost/field`](https://github.com/gatepost-dev/js/tree/main/packages/field#readme) explains the key, the events, the messages and the theme tokens.

## Requirements

| Requirement   | Version                  |
| ------------- | ------------------------ |
| React         | 18 or 19                 |
| Browser       | as for `@gatepost/field` |
| Module format | ESM only                 |
| Gatepost spec | 0.3.0                    |

The package exports `SPEC_VERSION`, the version of the Gatepost spec that it implements.

## Docs

The API report is in [`etc/react.api.md`](https://github.com/gatepost-dev/js/blob/main/packages/react/etc/react.api.md). [`field.md`](https://github.com/gatepost-dev/spec/blob/main/field.md) in the spec repo defines the field.

## Support

Ask questions and report bugs in [GitHub Issues](https://github.com/gatepost-dev/js/issues). Report security problems privately, as [`SECURITY.md`](https://github.com/gatepost-dev/.github/blob/main/SECURITY.md) describes.

## Contributing

Read [`CONTRIBUTING.md`](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md) before you open a pull request.

## Licence

Apache-2.0. See [`LICENSE`](https://github.com/gatepost-dev/js/blob/main/LICENSE) and [`NOTICE`](https://github.com/gatepost-dev/js/blob/main/NOTICE).
