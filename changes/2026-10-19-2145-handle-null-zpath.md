# Handle null ZPATH rows in CloudRecordings.db

PR: jwulff/apple-voice-memo-mcp#2 (external contributor @boby-milo)

## Why

`ZPATH` is nullable in Apple's `CloudRecordings.db` (cloud-only rows and
deleted-but-not-purged rows). `path.join()` throws `ERR_INVALID_ARG_TYPE` on
`null`, so a single such row made `list_voice_memos` fail for the whole result
set.

## How

- `CloudRecordingRow.ZPATH` is typed `string | null` to match the real schema.
- `getAudioFilePath()` accepts `null` and returns `null`, consistent with its
  existing "cannot resolve" contract.
- `rowToVoiceMemo()` falls back to `"Untitled"` for the title and `""` for
  `path`; `fullPath` and `hasTranscript` were already null-guarded.

## Validation

- Non-author reviews: Claude (2026-07-25) and Codex (2026-10-19), both
  recommending merge.
- Full suite passes on the branch rebased onto current `main`.
- Follow-up: no regression test pins the null-`ZPATH` row; tracked as a
  repo issue.
