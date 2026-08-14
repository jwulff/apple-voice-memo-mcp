import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseTsrpToText,
  parseTsrpToSegments,
  extractTsrpAtom,
  hasTranscript,
} from "../../src/utils/mp4-parser.js";
import type { TsrpData } from "../../src/types/index.js";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  fstatSync: vi.fn(),
}));

import { readFileSync, openSync, readSync, closeSync, fstatSync } from "fs";

const mockedReadFileSync = vi.mocked(readFileSync);

function createAtom(type: string, data: Buffer): Buffer {
  const size = data.length + 8;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data]);
}

function createExtendedAtom(type: string, data: Buffer): Buffer {
  const size = data.length + 16;
  const header = Buffer.alloc(16);
  header.writeUInt32BE(1, 0);
  header.write(type, 4, 4, "ascii");
  header.writeBigUInt64BE(BigInt(size), 8);
  return Buffer.concat([header, data]);
}

function createTranscriptFile(
  tsrpData: Buffer,
  leadingAtoms: Buffer[] = []
): Buffer {
  const tsrp = createAtom("tsrp", tsrpData);
  const udta = createAtom("udta", tsrp);
  const trak = createAtom("trak", udta);
  const moov = createAtom("moov", trak);
  return Buffer.concat([...leadingAtoms, moov]);
}

/**
 * Mock fd-based file reads so that openSync/readSync/fstatSync/closeSync
 * behave as if reading from `buf`.
 */
function mockFdReads(buf: Buffer): void {
  const fd = 42;
  (openSync as ReturnType<typeof vi.fn>).mockReturnValue(fd);
  (fstatSync as ReturnType<typeof vi.fn>).mockReturnValue({ size: buf.length });
  (closeSync as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  (readSync as ReturnType<typeof vi.fn>).mockImplementation(
    (
      _fd: number,
      target: Buffer,
      tOffset: number,
      length: number,
      position: number
    ) => {
      const end = Math.min(position + length, buf.length);
      const copied = buf.copy(target, tOffset, position, end);
      return copied;
    }
  );
}

describe("mp4-parser utility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockTsrpData: TsrpData = {
    attributedString: {
      attributeTable: [
        { timeRange: [0.0, 0.5] },
        { timeRange: [0.5, 1.0] },
        { timeRange: [1.0, 1.5] },
      ],
      runs: ["Hello", 0, " ", 1, "World", 2],
    },
    locale: {
      identifier: "en_US",
      current: 0,
    },
  };

  describe("parseTsrpToText", () => {
    it("should extract text from tsrp data", () => {
      const text = parseTsrpToText(mockTsrpData);
      expect(text).toBe("Hello World");
    });

    it("should handle empty runs", () => {
      const emptyData: TsrpData = {
        attributedString: {
          attributeTable: [],
          runs: [],
        },
        locale: { identifier: "en_US", current: 0 },
      };
      expect(parseTsrpToText(emptyData)).toBe("");
    });

    it("should handle runs with only numbers", () => {
      const dataWithOnlyNumbers: TsrpData = {
        attributedString: {
          attributeTable: [{ timeRange: [0.0, 1.0] }],
          runs: [0, 1, 2],
        },
        locale: { identifier: "en_US", current: 0 },
      };
      expect(parseTsrpToText(dataWithOnlyNumbers)).toBe("");
    });
  });

  describe("parseTsrpToSegments", () => {
    it("should extract timestamped segments from tsrp data", () => {
      const segments = parseTsrpToSegments(mockTsrpData);

      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: "Hello", start: 0.0, end: 0.5 });
      expect(segments[1]).toEqual({ text: " ", start: 0.5, end: 1.0 });
      expect(segments[2]).toEqual({ text: "World", start: 1.0, end: 1.5 });
    });

    it("should handle empty data", () => {
      const emptyData: TsrpData = {
        attributedString: {
          attributeTable: [],
          runs: [],
        },
        locale: { identifier: "en_US", current: 0 },
      };
      expect(parseTsrpToSegments(emptyData)).toEqual([]);
    });

    it("should handle index out of bounds", () => {
      const dataWithBadIndex: TsrpData = {
        attributedString: {
          attributeTable: [{ timeRange: [0.0, 1.0] }],
          runs: ["Text", 5], // index 5 is out of bounds
        },
        locale: { identifier: "en_US", current: 0 },
      };
      expect(parseTsrpToSegments(dataWithBadIndex)).toEqual([]);
    });

    it("should handle negative index", () => {
      const dataWithNegativeIndex: TsrpData = {
        attributedString: {
          attributeTable: [{ timeRange: [0.0, 1.0] }],
          runs: ["Text", -1],
        },
        locale: { identifier: "en_US", current: 0 },
      };
      expect(parseTsrpToSegments(dataWithNegativeIndex)).toEqual([]);
    });
  });

  describe("extractTsrpAtom", () => {
    it("should return null when file read fails", () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });

      const result = extractTsrpAtom("/nonexistent/file.m4a");
      expect(result).toBeNull();
    });

    it("should return null when buffer is too small", () => {
      mockedReadFileSync.mockReturnValue(Buffer.from([0, 0, 0, 0]));

      const result = extractTsrpAtom("/path/to/file.m4a");
      expect(result).toBeNull();
    });

    it("should return null when moov atom not found", () => {
      const fakeAtom = createAtom("ftyp", Buffer.from("M4A "));
      mockedReadFileSync.mockReturnValue(fakeAtom);

      const result = extractTsrpAtom("/path/to/file.m4a");
      expect(result).toBeNull();
    });

    it("should return null when trak atom not found in moov", () => {
      const moovContent = createAtom("meta", Buffer.from("test"));
      const moovAtom = createAtom("moov", moovContent);
      mockedReadFileSync.mockReturnValue(moovAtom);

      const result = extractTsrpAtom("/path/to/file.m4a");
      expect(result).toBeNull();
    });

    it("should return null when udta atom not found in trak", () => {
      const trakContent = createAtom("mdia", Buffer.from("test"));
      const moovContent = createAtom("trak", trakContent);
      const moovAtom = createAtom("moov", moovContent);
      mockedReadFileSync.mockReturnValue(moovAtom);

      const result = extractTsrpAtom("/path/to/file.m4a");
      expect(result).toBeNull();
    });

    it("should return null when tsrp atom not found in udta", () => {
      const udtaContent = createAtom("name", Buffer.from("test"));
      const trakContent = createAtom("udta", udtaContent);
      const moovContent = createAtom("trak", trakContent);
      const moovAtom = createAtom("moov", moovContent);
      mockedReadFileSync.mockReturnValue(moovAtom);

      const result = extractTsrpAtom("/path/to/file.m4a");
      expect(result).toBeNull();
    });

    it("should return null when tsrp has no JSON brace", () => {
      const tsrpContent = Buffer.from("tsrpno json here");
      const udtaContent = createAtom("tsrp", tsrpContent);
      const trakContent = createAtom("udta", udtaContent);
      const moovContent = createAtom("trak", trakContent);
      const moovAtom = createAtom("moov", moovContent);
      mockedReadFileSync.mockReturnValue(moovAtom);

      const result = extractTsrpAtom("/path/to/file.m4a");
      expect(result).toBeNull();
    });

    it("should return null when JSON is invalid", () => {
      const tsrpContent = Buffer.from("tsrp{invalid json}");
      const udtaContent = createAtom("tsrp", tsrpContent);
      const trakContent = createAtom("udta", udtaContent);
      const moovContent = createAtom("trak", trakContent);
      const moovAtom = createAtom("moov", moovContent);
      mockedReadFileSync.mockReturnValue(moovAtom);

      const result = extractTsrpAtom("/path/to/file.m4a");
      expect(result).toBeNull();
    });

    it("should parse valid tsrp JSON", () => {
      const tsrpJson = JSON.stringify({
        attributedString: {
          attributeTable: [{ timeRange: [0.0, 1.0] }],
          runs: ["Hello", 0],
        },
        locale: { identifier: "en_US", current: 0 },
      });
      const tsrpContent = Buffer.from("tsrp" + tsrpJson);
      const udtaContent = createAtom("tsrp", tsrpContent);
      const trakContent = createAtom("udta", udtaContent);
      const moovContent = createAtom("trak", trakContent);
      const moovAtom = createAtom("moov", moovContent);
      mockedReadFileSync.mockReturnValue(moovAtom);

      const result = extractTsrpAtom("/path/to/file.m4a");

      expect(result).not.toBeNull();
      expect(result?.attributedString.runs).toContain("Hello");
      expect(result?.locale.identifier).toBe("en_US");
    });

    it("should handle tsrp without prefix", () => {
      const tsrpJson = JSON.stringify({
        attributedString: {
          attributeTable: [],
          runs: ["Test"],
        },
        locale: { identifier: "en_US", current: 0 },
      });
      const tsrpContent = Buffer.from(tsrpJson);
      const udtaContent = createAtom("tsrp", tsrpContent);
      const trakContent = createAtom("udta", udtaContent);
      const moovContent = createAtom("trak", trakContent);
      const moovAtom = createAtom("moov", moovContent);
      mockedReadFileSync.mockReturnValue(moovAtom);

      const result = extractTsrpAtom("/path/to/file.m4a");

      expect(result).not.toBeNull();
      expect(result?.attributedString.runs).toContain("Test");
    });

    it("should handle atom with size smaller than 8", () => {
      // Create malformed atom with size 4 (less than minimum 8)
      const malformedBuffer = Buffer.alloc(20);
      malformedBuffer.writeUInt32BE(4, 0); // size too small
      malformedBuffer.write("moov", 4, 4, "ascii");
      mockedReadFileSync.mockReturnValue(malformedBuffer);

      const result = extractTsrpAtom("/path/to/file.m4a");
      expect(result).toBeNull();
    });
  });

  describe("hasTranscript", () => {
    it("should return true when tsrp atom exists", () => {
      const tsrpJson = JSON.stringify({
        attributedString: {
          attributeTable: [],
          runs: ["Test"],
        },
        locale: { identifier: "en_US", current: 0 },
      });

      const tsrpContent = Buffer.from(tsrpJson);
      const udtaContent = createAtom("tsrp", tsrpContent);
      const trakContent = createAtom("udta", udtaContent);
      const moovContent = createAtom("trak", trakContent);
      const moovAtom = createAtom("moov", moovContent);

      mockFdReads(moovAtom);

      expect(hasTranscript("/path/to/file.m4a")).toBe(true);
    });

    it("should detect and extract a transcript after a 64-bit mdat atom", () => {
      const tsrpJson = JSON.stringify({
        attributedString: {
          attributeTable: [{ timeRange: [0, 1] }],
          runs: ["Extended", 0],
        },
        locale: { identifier: "en_US", current: 0 },
      });
      const file = createTranscriptFile(Buffer.from(tsrpJson), [
        createExtendedAtom("mdat", Buffer.from("audio data")),
      ]);

      mockedReadFileSync.mockReturnValue(file);
      mockFdReads(file);

      expect(hasTranscript("/path/to/extended.m4a")).toBe(true);
      expect(
        extractTsrpAtom("/path/to/extended.m4a")?.attributedString.runs
      ).toContain("Extended");
    });

    it("should return false when tsrp JSON is malformed", () => {
      const file = createTranscriptFile(Buffer.from("tsrp{invalid json}"));
      mockedReadFileSync.mockReturnValue(file);
      mockFdReads(file);

      expect(hasTranscript("/path/to/malformed.m4a")).toBe(false);
      expect(extractTsrpAtom("/path/to/malformed.m4a")).toBeNull();
    });

    it("should reject a 64-bit atom smaller than its header", () => {
      const malformed = Buffer.alloc(16);
      malformed.writeUInt32BE(1, 0);
      malformed.write("moov", 4, 4, "ascii");
      malformed.writeBigUInt64BE(8n, 8);
      mockedReadFileSync.mockReturnValue(malformed);
      mockFdReads(malformed);

      expect(hasTranscript("/path/to/malformed-extended.m4a")).toBe(false);
      expect(extractTsrpAtom("/path/to/malformed-extended.m4a")).toBeNull();
    });

    it("should return false when tsrp atom doesn't exist", () => {
      const buf = Buffer.from([0, 0, 0, 8, 0x66, 0x74, 0x79, 0x70]);
      mockFdReads(buf);

      expect(hasTranscript("/path/to/file.m4a")).toBe(false);
    });

    it("should return false when file doesn't exist", () => {
      (openSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("ENOENT");
      });

      expect(hasTranscript("/nonexistent/file.m4a")).toBe(false);
    });
  });
});
