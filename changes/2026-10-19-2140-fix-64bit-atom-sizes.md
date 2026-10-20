# Fix transcript detection for m4a files with 64-bit atom sizes

PR: jwulff/apple-voice-memo-mcp#3 (external contributor @JP0P, follow-up commit by their agent @clawSean)

## Why

`hasTranscript()` and `extractTsrpAtom()` returned false/null for every Voice
Memo recorded on a modern iPhone or iPad. Apple writes the `mdat` atom with the
ISO 14496-12 §4.2 extended size form (`size == 1`, real size in the following
uint64), and the parser treated that as a parse failure before it ever reached
`moov/trak/udta/tsrp`. The published 0.1.1 therefore shipped a transcript
feature that did not work for most users; a user reported exactly this on the
PR on 2026-10-19 and had fallen back to transcribing locally with yap/whisper.

Measured on the maintainer's own library of 251 memos: 244 use 64-bit atoms,
`main` detected 0 transcripts, this branch detects 103, and a raw byte search
finds `tsrp` in exactly 103 files. No misses, no false positives.

## How

- `readAtom()` (buffered extractor) and the new `readAtomHeader()` (fd scanner)
  both handle `size == 1` (16-byte header, uint64 size) and `size == 0`
  (atom extends to end of file), and reject any atom smaller than its header
  so `pos` always advances.
- `hasTranscript()` no longer calls `readFileSync` on the whole file. It walks
  atom headers with positioned `readSync` calls (16 bytes per atom) and only
  reads the `tsrp` payload itself, then validates that payload with the same
  `parseTsrpData()` the extractor uses, so the two paths still agree.
- Tests cover a 64-bit `mdat` ahead of `moov`, a malformed extended atom
  smaller than its header, and malformed `tsrp` JSON, for both entry points.

Known pre-existing limitation, unchanged here: both scanners take the first
`trak` and do not backtrack, so a transcript in a second track is still missed.

## Validation

- Local on the PR head (3b0c01c): lint, Prettier, typecheck, build, and
  147/147 vitest all pass.
- Real-file comparison of `main` vs this branch across 251 memos as above.
- Non-author reviews: Claude (2026-07-25, synthetic fixtures + 400-input fuzz)
  and Codex (2026-10-19). Codex verified all 81 normal/extended/zero header
  combinations across the four nesting levels and raised one P2: for a file
  over 2 GiB, `hasTranscript()` now returns true while `extractTsrpAtom()`
  still uses `readFileSync`, which throws `ERR_FS_FILE_TOO_LARGE`, so
  `transcribe_memo` would refuse fallback transcription. Declined here: such
  files already failed detection on `main` (no regression in what works), the
  largest real memo in a 251-file library is 0.5 GiB, and the proper fix is to
  move extraction onto the same fd scanner, tracked as a follow-up issue.
- The one GitHub CI run on this fork branch (2026-08-15) shows "failure" with
  zero jobs and no log; that is a fork-workflow permission artifact, not a
  code failure.
