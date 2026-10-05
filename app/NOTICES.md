# Notices

Prepvela is an independent English-practice app. It bundles no third-party
program code. Two things it does ship need naming: the pre-rendered audio, and
the generated content file.

## Bundled audio — Kokoro-82M (Apache-2.0)

Every `.m4a` under `assets/audio/` (word clips in `vocab/`, one clip per
listening item in `listening/`) was rendered offline from text with
**Kokoro-82M** (kokoro v1.0), English voices `af_heart` and `am_michael`.

- Project: Kokoro-82M by hexgrad, released under the Apache License, Version 2.0.
- Licence text: <https://www.apache.org/licenses/LICENSE-2.0>

Apache-2.0 §4(d) asks that modified files carry prominent notices stating that
they were changed. The bundled `.m4a` files are unmodified rendered output —
nothing was edited after a file was generated — so no per-file notice is
required. The attribution above is given voluntarily, and the full licence text
is at the URL above.

The model weights themselves are **not** bundled: only the audio they produced.
Regenerating a clip needs the model and the licence both.

The listening clips are keyed by `<set>-<part>-<question>` and the word clips by
the word itself, in `assets/audio/index.json`, which is copied verbatim into
`data/bank.js` by `tools/merge_bank.py`.

## Content

`data/bank.js` is generated from `content/parts/*.json` by
`python3 tools/merge_bank.py`. Every sentence in it was written for this app:
ordinary everyday English with Japanese explanations written to match. It
contains no material taken from an existing exam or question bank, and the app
is not affiliated with, endorsed by, or approved by any exam body.

## This app

Prepvela — 独立した英語学習アプリ. Source in this repository.
