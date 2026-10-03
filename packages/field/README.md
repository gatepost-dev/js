<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup-dark.svg">
  <img src="https://raw.githubusercontent.com/gatepost-dev/.github/main/brand/gatepost-lockup.svg" alt="gatepost" height="48">
</picture>

# @gatepost/field

A postcode field for any web form. It checks Nigeria's new postcode while the user types, and the form sends the postcode in its canonical form.

> Unofficial. Not made or endorsed by NIPOST.

[![CI](https://github.com/gatepost-dev/js/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gatepost-dev/js/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](https://github.com/gatepost-dev/js/blob/main/LICENSE)

## Install

```sh
pnpm add @gatepost/field
```

The first alpha is not on npm yet, so this command and the CDN address below work only after its release.

Import `@gatepost/field` once in your app, and the page can use the element. A page with no build step can load the one-file build from a CDN instead, as the quickstart does.

## Quickstart

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@gatepost/field/dist/element.js"></script>
<form action="/address">
  <gatepost-postcode-field name="postcode" required></gatepost-postcode-field>
  <button>Continue</button>
</form>
```

A user who types `fc 01 z99 zz 01` sends `postcode=FC-01-Z99-ZZ-01`. With no key, the field checks the format offline and sends no request.

## What it does

- Checks the format as the user types, and shows one plain message for each mistake. It waits until the user leaves the input, or until the text is long enough for a whole postcode.
- Offers a fix for look-alike characters, such as the letter O in place of a zero, and uses it only when the user presses its button.
- Accepts an old 6-digit postcode, or refuses it when you set `legacy="reject"`.
- Submits the form on Enter, as a native input does.
- With a publishable key, asks NIPOST's gateway about each whole postcode, and names its place.
- With `gps`, puts the postcode of the user's location in the input, or only the part that the accuracy supports.
- Works with the keyboard alone and with screen readers, and meets WCAG 2.2 AA.
- Stores nothing, sets no cookie and sends no telemetry.

### Check postcodes with NIPOST

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@gatepost/field/dist/element.js"></script>
<form action="/address">
  <gatepost-postcode-field name="postcode" api-key="nipost_pk_live_your_key" confirm="level2" gps>
  </gatepost-postcode-field>
  <button>Continue</button>
</form>
```

Use a publishable key, which starts with `nipost_pk_`, and add your site to its allowed origins in NIPOST's dashboard. Anyone can read a key in a page, so the field refuses a secret key: it sends no request, and it logs one console error for you. `confirm="level2"` needs a key with level 2 access.

A postcode that the gateway does not know, or a failed request, never stops the form. The gateway's data is new, so check the postcode again on your server.

| Attribute                               | Values                       | Default                             |
| --------------------------------------- | ---------------------------- | ----------------------------------- |
| `name`, `value`, `required`, `disabled` | as for a native input        | none                                |
| `label`                                 | the visible label            | `Postcode`                          |
| `api-key`                               | a publishable key            | none, so the field sends no request |
| `base-url`                              | the gateway's address        | `https://api.postcode.gov.ng`       |
| `confirm`                               | `none`, `level1` or `level2` | `level1`                            |
| `gps`                                   | present or absent            | absent                              |
| `legacy`                                | `accept` or `reject`         | `accept`                            |

### Listen for changes

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@gatepost/field/dist/element.js"></script>
<gatepost-postcode-field name="postcode"></gatepost-postcode-field>
<output id="chosen"></output>
<script type="module">
  const field = document.querySelector('gatepost-postcode-field');
  field.addEventListener('gatepost-change', (event) => {
    document.querySelector('#chosen').value = event.detail.value;
  });
</script>
```

The events bubble, so a page can listen on the form.

| Event              | `detail`                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `gatepost-change`  | `value`, `postcode`, `source` (`typed`, `pasted`, `suggestion` or `gps`) and `accuracyM`        |
| `gatepost-confirm` | `lookup`, the result of the lookup                                                              |
| `gatepost-error`   | `code`, an error code of `@gatepost/client`, or `secret_key`, `gps_denied` or `gps_unavailable` |

### Change the words and the look

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@gatepost/field/dist/element.js"></script>
<style>
  gatepost-postcode-field {
    --gatepost-accent: #5b2a86;
  }
</style>
<gatepost-postcode-field name="postcode"></gatepost-postcode-field>
<script type="module">
  const field = document.querySelector('gatepost-postcode-field');
  field.messages = { label: 'Delivery postcode', empty: 'Enter the postcode of the delivery.' };
</script>
```

The `messages` property replaces messages by key, and the field keeps the English text for each key that you leave out. [`field_en.arb`](https://github.com/gatepost-dev/spec/blob/main/messages/field_en.arb) in the spec repo lists each key, with a note on when it shows.

Set the properties `messages` and `value` only after the browser defines the element. A property that you set earlier is lost. Module scripts run in order, so a module script below the field's script is safe. Other code can wait for `customElements.whenDefined('gatepost-postcode-field')`.

The tokens are `--gatepost-text`, `--gatepost-muted`, `--gatepost-background`, `--gatepost-border`, `--gatepost-accent`, `--gatepost-error`, `--gatepost-warning`, `--gatepost-radius` and `--gatepost-font`. The defaults meet a contrast of 4.5:1 on white. Check your own colours on your page's background. The parts `field`, `label`, `hint`, `input`, `message` and `button` take `::part()` rules.

## Requirements

| Requirement   | Version                                                    |
| ------------- | ---------------------------------------------------------- |
| Browser       | a current Chrome, Edge or Firefox, or Safari 16.4 or later |
| Module format | ESM only                                                   |
| Gatepost spec | 0.3.0                                                      |

The package exports `SPEC_VERSION`, the version of the Gatepost spec that it implements. A server can import the package: it defines the element only in a browser.

## Docs

The API report is in [`etc/field.api.md`](https://github.com/gatepost-dev/js/blob/main/packages/field/etc/field.api.md). [`field.md`](https://github.com/gatepost-dev/spec/blob/main/field.md) in the spec repo defines the settings, the events, the states and the rules of the field.

## Support

Ask questions and report bugs in [GitHub Issues](https://github.com/gatepost-dev/js/issues). Report security problems privately, as [`SECURITY.md`](https://github.com/gatepost-dev/.github/blob/main/SECURITY.md) describes.

## Contributing

Read [`CONTRIBUTING.md`](https://github.com/gatepost-dev/.github/blob/main/CONTRIBUTING.md) before you open a pull request. `pnpm check` runs the browser tests, so ports 3000 and 4010 must be free.

## Licence

Apache-2.0. See [`LICENSE`](https://github.com/gatepost-dev/js/blob/main/LICENSE) and [`NOTICE`](https://github.com/gatepost-dev/js/blob/main/NOTICE).
