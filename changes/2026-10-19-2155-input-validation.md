# Validate memo paths and language tags before use

PR: jwulff/apple-voice-memo-mcp#1 (external contributor @matteofrassi, with
maintainer follow-up commits)

## Why

`isValidVoiceMemosPath()` existed but was never called, so a filename could
be joined onto the recordings directory unchecked, and the `language` value
reached the Swift helper's argv unvalidated. The contributor's PR wired up
the guard and added a language check; the maintainer review found both
needed tightening before they could land:

- The guard compared with `startsWith()`, which accepts a sibling directory
  such as `Recordings-evil`.
- The language pattern `/^[a-z]{2}(-[A-Z]{2})?$/` rejected locales that
  `SFSpeechRecognizer` supports (`es-419`, `yue-CN`, `wuu-CN`, `hi-Latn`,
  `hi-IN-translit`).
- A new `.m4a` extension filter sat in `getAudioFilePath()`, which runs for
  every database row. Voice Memos stores recordings as both `.m4a` and
  `.qta` (177 of 434 rows in one real `CloudRecordings.db`), so the filter
  would have silently disabled `get_audio`, `get_transcript`, `transcribe`
  and `hasTranscript` for those memos.

## How

- The guard compares on a path boundary with `path.relative()`; the
  recordings directory itself and anything outside it are rejected. The
  check is lexical and deliberately does not resolve symlinks.
- No extension filter. The resolver's contract stays "a file inside the
  recordings directory that exists".
- The language pattern is a BCP 47 shape, `/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/`,
  which covers every locale `SFSpeechRecognizer` reports and still refuses
  any value that could be read as a flag. `spawn()` runs without a shell, so
  the exposure was argument injection, not command injection; the PR title
  and body were reworded to say so.
- Validation happens before the path lookup, so an invalid tag never
  touches the filesystem.

## Validation

- Regression tests: traversal (`../../etc/passwd`), sibling-prefix escape
  (`../Recordings-evil/steal.m4a`), the directory itself, a `.qta`
  recording, nested paths, every accepted and rejected language tag, and an
  assertion that the helper is spawned without a shell and never reached by
  an invalid tag.
- Full suite on the branch (169) and on a merge preview with `main` (172),
  plus lint, Prettier, typecheck and build, all green locally.
- Observed on a real library: the `.qta` share came from
  `select count(*) ... from ZCLOUDRECORDING` on a Sequoia Mac.
