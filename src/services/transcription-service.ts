import { spawn } from "child_process";
import { getAudioFilePath } from "../utils/paths.js";
import type { TranscriptionResult, TranscriptSegment } from "../types/index.js";

/**
 * Shape of a BCP 47 language tag: a 2-3 letter language followed by any
 * number of 2-8 character alphanumeric subtags. This covers every locale
 * SFSpeechRecognizer reports (including es-419, yue-CN, hi-Latn, and
 * hi-IN-translit) while rejecting anything that could be read as a flag by
 * the Swift helper. spawn() runs without a shell, so a value is never shell
 * interpreted; the exposure is argument injection, not command injection.
 */
const LANGUAGE_CODE_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/**
 * Service for transcribing audio files using Apple's SFSpeechRecognizer.
 *
 * This requires a Swift helper CLI tool to be built and available.
 * The helper uses SFSpeechRecognizer which requires:
 * 1. Speech Recognition permission granted
 * 2. Language packs downloaded via System Settings > Accessibility > Voice Control
 */
export class TranscriptionService {
  private swiftHelperPath: string | null = null;

  constructor(swiftHelperPath?: string) {
    // Default to looking for the helper in the same directory
    this.swiftHelperPath = swiftHelperPath || null;
  }

  async transcribe(
    memoPath: string,
    language: string = "en-US"
  ): Promise<TranscriptionResult> {
    if (!LANGUAGE_CODE_PATTERN.test(language)) {
      return {
        success: false,
        error: `Invalid language code: "${language}". Expected a BCP 47 tag such as "en-US", "en", or "es-419".`,
      };
    }

    const fullPath = getAudioFilePath(memoPath);

    if (!fullPath) {
      return {
        success: false,
        error: `Audio file not found: ${memoPath}`,
      };
    }

    // If no Swift helper is available, return an informative error
    if (!this.swiftHelperPath) {
      return {
        success: false,
        error:
          "Swift transcription helper not configured. " +
          "To use transcription, build the swift-helper and set VOICE_MEMO_TRANSCRIBER_PATH environment variable. " +
          "Alternatively, open the memo in Voice Memos app on macOS Sequoia+ for automatic transcription.",
      };
    }

    return this.runSwiftTranscriber(fullPath, language);
  }

  private async runSwiftTranscriber(
    audioPath: string,
    language: string
  ): Promise<TranscriptionResult> {
    return new Promise((resolve) => {
      const args = [audioPath, "--language", language, "--json"];

      const process = spawn(this.swiftHelperPath!, args);

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          resolve({
            success: false,
            error: stderr || `Transcription failed with exit code ${code}`,
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve({
            success: true,
            transcript: result.text,
            segments: result.segments as TranscriptSegment[],
          });
        } catch {
          // If not JSON, treat stdout as plain text transcript
          resolve({
            success: true,
            transcript: stdout.trim(),
          });
        }
      });

      process.on("error", (err) => {
        resolve({
          success: false,
          error: `Failed to run transcriber: ${err.message}`,
        });
      });
    });
  }
}
