import { spawn } from "child_process";
import { getAudioFilePath } from "../utils/paths.js";
import type { TranscriptionResult, TranscriptSegment } from "../types/index.js";

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
    // Validate language code format (e.g., "en-US", "it-IT", "en")
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
      return {
        success: false,
        error: `Invalid language code: "${language}". Expected format: "en-US" or "en".`,
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
