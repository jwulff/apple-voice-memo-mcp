import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Mock dependencies
vi.mock("../../src/utils/paths.js", () => ({
  getAudioFilePath: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

import { TranscriptionService } from "../../src/services/transcription-service.js";
import { getAudioFilePath } from "../../src/utils/paths.js";
import { spawn } from "child_process";

const mockedGetAudioFilePath = vi.mocked(getAudioFilePath);
const mockedSpawn = vi.mocked(spawn);

class MockProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

describe("TranscriptionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAudioFilePath.mockReturnValue("/path/to/memo.m4a");
  });

  describe("constructor", () => {
    it("should accept optional swift helper path", () => {
      const service = new TranscriptionService("/path/to/helper");
      expect(service).toBeDefined();
    });

    it("should work without swift helper path", () => {
      const service = new TranscriptionService();
      expect(service).toBeDefined();
    });
  });

  describe("transcribe", () => {
    it("should return error when audio file not found", async () => {
      mockedGetAudioFilePath.mockReturnValue(null);

      const service = new TranscriptionService("/path/to/helper");
      const result = await service.transcribe("nonexistent.m4a");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Audio file not found");
    });

    it("should return error when swift helper not configured", async () => {
      const service = new TranscriptionService();
      const result = await service.transcribe("memo.m4a");

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        "Swift transcription helper not configured"
      );
    });

    it("should run swift transcriber and return JSON result", async () => {
      const mockProcess = new MockProcess();
      mockedSpawn.mockReturnValue(mockProcess as never);

      const service = new TranscriptionService("/path/to/helper");
      const transcribePromise = service.transcribe("memo.m4a", "en-US");

      // Emit JSON output
      mockProcess.stdout.emit(
        "data",
        JSON.stringify({
          text: "Hello world",
          segments: [{ text: "Hello world", start: 0, end: 1 }],
        })
      );
      mockProcess.emit("close", 0);

      const result = await transcribePromise;

      expect(result.success).toBe(true);
      expect(result.transcript).toBe("Hello world");
      expect(result.segments).toHaveLength(1);
      expect(mockedSpawn).toHaveBeenCalledWith("/path/to/helper", [
        "/path/to/memo.m4a",
        "--language",
        "en-US",
        "--json",
      ]);
    });

    it("should handle plain text output", async () => {
      const mockProcess = new MockProcess();
      mockedSpawn.mockReturnValue(mockProcess as never);

      const service = new TranscriptionService("/path/to/helper");
      const transcribePromise = service.transcribe("memo.m4a");

      // Emit plain text output (not JSON)
      mockProcess.stdout.emit("data", "This is plain text output");
      mockProcess.emit("close", 0);

      const result = await transcribePromise;

      expect(result.success).toBe(true);
      expect(result.transcript).toBe("This is plain text output");
      expect(result.segments).toBeUndefined();
    });

    it("should handle non-zero exit code with stderr", async () => {
      const mockProcess = new MockProcess();
      mockedSpawn.mockReturnValue(mockProcess as never);

      const service = new TranscriptionService("/path/to/helper");
      const transcribePromise = service.transcribe("memo.m4a");

      mockProcess.stderr.emit("data", "Speech recognition failed");
      mockProcess.emit("close", 1);

      const result = await transcribePromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Speech recognition failed");
    });

    it("should handle non-zero exit code without stderr", async () => {
      const mockProcess = new MockProcess();
      mockedSpawn.mockReturnValue(mockProcess as never);

      const service = new TranscriptionService("/path/to/helper");
      const transcribePromise = service.transcribe("memo.m4a");

      mockProcess.emit("close", 1);

      const result = await transcribePromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Transcription failed with exit code 1");
    });

    it("should handle process spawn error", async () => {
      const mockProcess = new MockProcess();
      mockedSpawn.mockReturnValue(mockProcess as never);

      const service = new TranscriptionService("/path/to/helper");
      const transcribePromise = service.transcribe("memo.m4a");

      mockProcess.emit("error", new Error("ENOENT: helper not found"));

      const result = await transcribePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to run transcriber");
      expect(result.error).toContain("ENOENT: helper not found");
    });

    it("should use default language if not specified", async () => {
      const mockProcess = new MockProcess();
      mockedSpawn.mockReturnValue(mockProcess as never);

      const service = new TranscriptionService("/path/to/helper");
      const transcribePromise = service.transcribe("memo.m4a");

      mockProcess.stdout.emit("data", "test");
      mockProcess.emit("close", 0);

      await transcribePromise;

      expect(mockedSpawn).toHaveBeenCalledWith("/path/to/helper", [
        "/path/to/memo.m4a",
        "--language",
        "en-US",
        "--json",
      ]);
    });

    it("should handle chunked stdout data", async () => {
      const mockProcess = new MockProcess();
      mockedSpawn.mockReturnValue(mockProcess as never);

      const service = new TranscriptionService("/path/to/helper");
      const transcribePromise = service.transcribe("memo.m4a");

      // Emit data in chunks
      mockProcess.stdout.emit("data", '{"text": "Hello ');
      mockProcess.stdout.emit("data", 'world"}');
      mockProcess.emit("close", 0);

      const result = await transcribePromise;

      expect(result.success).toBe(true);
      expect(result.transcript).toBe("Hello world");
    });
  });

  describe("language validation", () => {
    function runHelper(): MockProcess {
      const mockProcess = new MockProcess();
      mockedSpawn.mockReturnValue(mockProcess as never);
      queueMicrotask(() => {
        mockProcess.stdout.emit("data", '{"text":"ok","segments":[]}');
        mockProcess.emit("close", 0);
      });
      return mockProcess;
    }

    it.each([
      "en-US",
      "en",
      "it-IT",
      "es-419",
      "yue-CN",
      "wuu-CN",
      "hi-Latn",
      "hi-IN-translit",
    ])("accepts %s and passes it to the helper verbatim", async (language) => {
      runHelper();

      const service = new TranscriptionService("/path/to/helper");
      const result = await service.transcribe("memo.m4a", language);

      expect(result.success).toBe(true);
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
      const [, args, options] = mockedSpawn.mock.calls[0];
      expect(args).toEqual([
        "/path/to/memo.m4a",
        "--language",
        language,
        "--json",
      ]);
      // argv must stay literal: never spawn through a shell.
      expect(options).toBeUndefined();
    });

    it.each([
      "--malicious-flag",
      "-x",
      "'; rm -rf /;",
      "en US",
      "en_US",
      "",
      "e",
      "en-",
      "en-US-toolongsubtag",
    ])("rejects %j before the helper is spawned", async (language) => {
      const service = new TranscriptionService("/path/to/helper");
      const result = await service.transcribe("memo.m4a", language);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid language code");
      expect(mockedSpawn).not.toHaveBeenCalled();
    });

    it("rejects an invalid language before checking the audio path", async () => {
      const service = new TranscriptionService("/path/to/helper");
      const result = await service.transcribe("memo.m4a", "--json");

      expect(result.success).toBe(false);
      expect(mockedGetAudioFilePath).not.toHaveBeenCalled();
    });
  });
});
