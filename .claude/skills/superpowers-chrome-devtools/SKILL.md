---
name: superpowers-chrome-devtools
description: >
  Browser-debugging workflow for VolTrail using real-page inspection, console capture, network
  review, and click-path verification. Use when buttons, forms, redirects, or browser-only defects
  need to be proven with evidence.
---

# Superpowers: Chrome Devtools

Use a real browser. Treat screenshots, console messages, failed requests, and DOM state as evidence.

## Checklist

- confirm page load and final URL
- inspect visible buttons and disabled states
- click through the user path, one action at a time
- capture console errors
- capture 4xx and 5xx network failures
- verify toast or inline feedback after each mutation
- record exact selectors or text used to drive the page

## VolTrail Defaults

- start at login, not deep-linked protected pages
- verify middleware redirects after each blocked route test
- when a mutation succeeds, confirm it in both UI and API-backed data if possible
- when a page claims blockchain or audit behavior, verify whether the data is real or synthesized
