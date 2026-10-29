---
'@gatepost/client': minor
'@gatepost/field': minor
---

Accept only publishable keys in a web page, as spec 0.4.0 asks. A browser client now also refuses a key that is neither a publishable key nor a secret key, with its own message. The field refuses such a key in the same way and raises `gatepost-error` with the new code `unsupported_key`.
