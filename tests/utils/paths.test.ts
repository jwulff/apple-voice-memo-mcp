import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";

vi.mock("os", () => ({
  homedir: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

const mockedHomedir = vi.mocked(homedir);
const mockedExistsSync = vi.mocked(existsSync);

describe("paths utility", () => {
  beforeEach(() => {
    vi.resetModules();
    mockedHomedir.mockReturnValue("/Users/testuser");
    mockedExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getVoiceMemosPath", () => {
    it("should return first existing path (Sonoma/Sequoia)", async () => {
      const expectedPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      mockedExistsSync.mockImplementation((path) => path === expectedPath);

      const { getVoiceMemosPath } = await import("../../src/utils/paths.js");
      const result = getVoiceMemosPath();

      expect(result).toBe(expectedPath);
    });

    it("should return second path if first doesn't exist", async () => {
      const expectedPath = join(
        "/Users/testuser",
        "Library/Application Support/com.apple.voicememos/Recordings"
      );
      mockedExistsSync.mockImplementation((path) => path === expectedPath);

      const { getVoiceMemosPath } = await import("../../src/utils/paths.js");
      const result = getVoiceMemosPath();

      expect(result).toBe(expectedPath);
    });

    it("should return third path if first two don't exist", async () => {
      const expectedPath = join(
        "/Users/testuser",
        "Library/Containers/com.apple.VoiceMemos/Data/Library/Application Support/Recordings"
      );
      mockedExistsSync.mockImplementation((path) => path === expectedPath);

      const { getVoiceMemosPath } = await import("../../src/utils/paths.js");
      const result = getVoiceMemosPath();

      expect(result).toBe(expectedPath);
    });

    it("should return null if no path exists", async () => {
      mockedExistsSync.mockReturnValue(false);

      const { getVoiceMemosPath } = await import("../../src/utils/paths.js");
      const result = getVoiceMemosPath();

      expect(result).toBeNull();
    });
  });

  describe("getDatabasePath", () => {
    it("should return database path when recordings path and db exist", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      const dbPath = join(recordingsPath, "CloudRecordings.db");

      mockedExistsSync.mockImplementation(
        (path) => path === recordingsPath || path === dbPath
      );

      const { getDatabasePath } = await import("../../src/utils/paths.js");
      const result = getDatabasePath();

      expect(result).toBe(dbPath);
    });

    it("should return null when recordings path doesn't exist", async () => {
      mockedExistsSync.mockReturnValue(false);

      const { getDatabasePath } = await import("../../src/utils/paths.js");
      const result = getDatabasePath();

      expect(result).toBeNull();
    });

    it("should return null when db file doesn't exist", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );

      mockedExistsSync.mockImplementation((path) => path === recordingsPath);

      const { getDatabasePath } = await import("../../src/utils/paths.js");
      const result = getDatabasePath();

      expect(result).toBeNull();
    });
  });

  describe("getAudioFilePath", () => {
    it("should return full path when audio file exists", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      const audioPath = join(recordingsPath, "test-memo.m4a");

      mockedExistsSync.mockImplementation(
        (path) => path === recordingsPath || path === audioPath
      );

      const { getAudioFilePath } = await import("../../src/utils/paths.js");
      const result = getAudioFilePath("test-memo.m4a");

      expect(result).toBe(audioPath);
    });

    it("should return null when recordings path doesn't exist", async () => {
      mockedExistsSync.mockReturnValue(false);

      const { getAudioFilePath } = await import("../../src/utils/paths.js");
      const result = getAudioFilePath("test-memo.m4a");

      expect(result).toBeNull();
    });

    it("should return null when audio file doesn't exist", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );

      mockedExistsSync.mockImplementation((path) => path === recordingsPath);

      const { getAudioFilePath } = await import("../../src/utils/paths.js");
      const result = getAudioFilePath("nonexistent.m4a");

      expect(result).toBeNull();
    });

    it("should resolve .qta recordings (Voice Memos uses .m4a and .qta)", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      const audioPath = join(recordingsPath, "20240101 120000-ABCD.qta");

      mockedExistsSync.mockImplementation(
        (path) => path === recordingsPath || path === audioPath
      );

      const { getAudioFilePath } = await import("../../src/utils/paths.js");
      const result = getAudioFilePath("20240101 120000-ABCD.qta");

      expect(result).toBe(audioPath);
    });

    it("should reject traversal outside the recordings directory even when the target exists", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      // Everything "exists" so the guard, not existsSync, is what blocks it.
      mockedExistsSync.mockReturnValue(true);

      const { getAudioFilePath } = await import("../../src/utils/paths.js");

      expect(getAudioFilePath("../../etc/passwd")).toBeNull();
      expect(getAudioFilePath("../../../.ssh/id_rsa.m4a")).toBeNull();
      // join() anchors an absolute-looking name inside the directory rather
      // than letting it escape, so this stays in bounds.
      expect(getAudioFilePath("/etc/passwd")).toBe(
        join(recordingsPath, "etc", "passwd")
      );
    });

    it("should reject a sibling directory that shares the recordings path prefix", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      mockedExistsSync.mockReturnValue(true);

      const { getAudioFilePath } = await import("../../src/utils/paths.js");
      const result = getAudioFilePath("../Recordings-evil/steal.m4a");

      expect(result).toBeNull();
    });

    it("should reject the recordings directory itself", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      mockedExistsSync.mockReturnValue(true);

      const { getAudioFilePath } = await import("../../src/utils/paths.js");

      expect(getAudioFilePath(".")).toBeNull();
      expect(getAudioFilePath("sub/..")).toBeNull();
    });
  });

  describe("isValidVoiceMemosPath", () => {
    it("should return true for paths within recordings directory", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      const validPath = join(recordingsPath, "memo.m4a");

      mockedExistsSync.mockImplementation((path) => path === recordingsPath);

      const { isValidVoiceMemosPath } =
        await import("../../src/utils/paths.js");
      const result = isValidVoiceMemosPath(validPath);

      expect(result).toBe(true);
    });

    it("should return false for paths outside recordings directory", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );

      mockedExistsSync.mockImplementation((path) => path === recordingsPath);

      const { isValidVoiceMemosPath } =
        await import("../../src/utils/paths.js");
      const result = isValidVoiceMemosPath("/etc/passwd");

      expect(result).toBe(false);
    });

    it("should return false when no recordings path exists", async () => {
      mockedExistsSync.mockReturnValue(false);

      const { isValidVoiceMemosPath } =
        await import("../../src/utils/paths.js");
      const result = isValidVoiceMemosPath("/some/path");

      expect(result).toBe(false);
    });

    it("should return false for a sibling directory sharing the prefix", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      mockedExistsSync.mockImplementation((path) => path === recordingsPath);

      const { isValidVoiceMemosPath } =
        await import("../../src/utils/paths.js");

      expect(isValidVoiceMemosPath(`${recordingsPath}-evil/steal.m4a`)).toBe(
        false
      );
      expect(isValidVoiceMemosPath(join(recordingsPath, "..", "x.m4a"))).toBe(
        false
      );
    });

    it("should return false for the recordings directory itself", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      mockedExistsSync.mockImplementation((path) => path === recordingsPath);

      const { isValidVoiceMemosPath } =
        await import("../../src/utils/paths.js");

      expect(isValidVoiceMemosPath(recordingsPath)).toBe(false);
      expect(isValidVoiceMemosPath(`${recordingsPath}/`)).toBe(false);
    });

    it("should return true for nested paths and dot-prefixed names inside the directory", async () => {
      const recordingsPath = join(
        "/Users/testuser",
        "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings"
      );
      mockedExistsSync.mockImplementation((path) => path === recordingsPath);

      const { isValidVoiceMemosPath } =
        await import("../../src/utils/paths.js");

      expect(
        isValidVoiceMemosPath(join(recordingsPath, "sub", "memo.m4a"))
      ).toBe(true);
      expect(isValidVoiceMemosPath(join(recordingsPath, "..memo.m4a"))).toBe(
        true
      );
    });
  });
});
