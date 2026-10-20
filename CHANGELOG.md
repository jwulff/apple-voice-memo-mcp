# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-19

### Fixed
- Transcript detection for Voice Memos recorded on iPhone/iPad. The MP4 parser
  now handles 64-bit extended atom sizes (`size == 1`) and to-end-of-file atoms
  (`size == 0`), so `hasTranscript` and `get_transcript` work for memos whose
  `mdat` atom uses the extended form, which is the default on modern devices.
  (#3, thanks @JP0P and @clawSean)
- `list_voice_memos` no longer fails when `CloudRecordings.db` contains a row
  with a null `ZPATH` (cloud-only or deleted-but-not-purged recordings).
  (#2, thanks @boby-milo)

### Security
- Memo filenames are validated against the Voice Memos recordings directory
  on a path boundary before any read, and the `language` passed to the Swift
  transcription helper must be a BCP 47-shaped tag so it can never be read as
  a flag. (#1, thanks @matteofrassi)

### Fixed (release)
- The server now advertises its real package version over MCP instead of a
  hardcoded `0.1.0`; the value is read from `package.json` at startup.

### Changed
- `hasTranscript` scans atom headers with positioned reads instead of loading
  each m4a into memory, cutting the I/O for `list_voice_memos` from the full
  size of every memo to a few hundred bytes per file. (#3)

## [0.1.1] - 2026-01-12

### Added
- Comprehensive test suite with 99%+ coverage
- CONTRIBUTING.md with development guidelines
- CI/CD workflows for testing and linting

### Fixed
- Timestamps now return local time with timezone offset instead of UTC

## [0.1.0] - 2025-01-08

### Added
- Initial release
- MCP server implementation with 5 tools:
  - `list_voice_memos`: List voice memos with pagination and search
  - `get_voice_memo`: Get detailed metadata for a specific memo
  - `get_audio`: Retrieve audio file path or base64-encoded data
  - `get_transcript`: Extract Apple's built-in transcript from audio files
  - `transcribe_memo`: Transcribe using Apple's SFSpeechRecognizer
- MPEG-4 atom parser for extracting transcripts from M4A files
- Support for multiple macOS Voice Memos database locations
- Core Data timestamp conversion utilities
- Swift helper for SFSpeechRecognizer transcription

### Technical Details
- TypeScript implementation
- MCP SDK integration
- SQLite database access (read-only)
- ESLint and Prettier configuration
- Vitest for testing
