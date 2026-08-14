import { readFileSync, openSync, readSync, closeSync, fstatSync } from "fs";
import type { TsrpData, TranscriptSegment } from "../types/index.js";

/**
 * Parse MPEG-4 atoms to extract the tsrp (transcript) atom from Voice Memos m4a files.
 *
 * MPEG-4 files are structured as nested "atoms" (also called boxes).
 * Each atom has:
 * - 4 bytes: size (big-endian uint32; 0 = rest of file, 1 = 64-bit extended)
 * - 4 bytes: type (4 ASCII characters)
 * - 8 bytes: extended size (only when size == 1, big-endian uint64)
 * - remaining: data (may contain nested atoms)
 *
 * The transcript is stored at: moov/trak/udta/tsrp
 */

interface Atom {
  type: string;
  size: number;
  dataOffset: number;
  data: Buffer;
}

function readAtom(buffer: Buffer, offset: number): Atom | null {
  if (offset + 8 > buffer.length) {
    return null;
  }

  let size = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);
  let headerSize = 8;

  if (size === 1) {
    // 64-bit extended size (ISO 14496-12 §4.2)
    if (offset + 16 > buffer.length) {
      return null;
    }
    size = Number(buffer.readBigUInt64BE(offset + 8));
    headerSize = 16;
  } else if (size === 0) {
    // Atom extends to end of buffer
    size = buffer.length - offset;
  }

  if (size < headerSize || offset + size > buffer.length) {
    return null;
  }

  return {
    type,
    size,
    dataOffset: offset + headerSize,
    data: buffer.subarray(offset + headerSize, offset + size),
  };
}

function findAtom(buffer: Buffer, type: string, offset = 0): Atom | null {
  let currentOffset = offset;

  while (currentOffset < buffer.length) {
    const atom = readAtom(buffer, currentOffset);
    if (!atom) break;

    if (atom.type === type) {
      return atom;
    }

    currentOffset += atom.size;
  }

  return null;
}

function findNestedAtom(buffer: Buffer, path: string[]): Atom | null {
  let currentBuffer = buffer;
  let currentAtom: Atom | null = null;

  for (const atomType of path) {
    currentAtom = findAtom(currentBuffer, atomType);
    if (!currentAtom) {
      return null;
    }
    currentBuffer = currentAtom.data;
  }

  return currentAtom;
}

export function extractTsrpAtom(filePath: string): TsrpData | null {
  try {
    const buffer = readFileSync(filePath);

    // Navigate to moov/trak/udta/tsrp
    const tsrpAtom = findNestedAtom(buffer, ["moov", "trak", "udta", "tsrp"]);

    if (!tsrpAtom) {
      return null;
    }

    return parseTsrpData(tsrpAtom.data);
  } catch {
    return null;
  }
}

function parseTsrpData(data: Buffer): TsrpData | null {
  try {
    // The tsrp atom data may start with a "tsrp" prefix before the JSON.
    const dataString = data.toString("utf8");
    const jsonStart = dataString.startsWith("tsrp") ? 4 : 0;
    const braceIndex = dataString.indexOf("{", jsonStart);

    if (braceIndex === -1) {
      return null;
    }

    return JSON.parse(dataString.substring(braceIndex)) as TsrpData;
  } catch {
    return null;
  }
}

export function parseTsrpToText(tsrpData: TsrpData): string {
  const { runs } = tsrpData.attributedString;
  const textParts: string[] = [];

  for (const item of runs) {
    if (typeof item === "string") {
      textParts.push(item);
    }
  }

  return textParts.join("");
}

export function parseTsrpToSegments(tsrpData: TsrpData): TranscriptSegment[] {
  const { attributeTable, runs } = tsrpData.attributedString;
  const segments: TranscriptSegment[] = [];

  let currentText = "";
  let currentIndex = -1;

  for (const item of runs) {
    if (typeof item === "string") {
      currentText = item;
    } else if (typeof item === "number") {
      currentIndex = item;
      if (
        currentText &&
        currentIndex >= 0 &&
        currentIndex < attributeTable.length
      ) {
        const timeRange = attributeTable[currentIndex].timeRange;
        segments.push({
          text: currentText,
          start: timeRange[0],
          end: timeRange[1],
        });
      }
      currentText = "";
    }
  }

  return segments;
}

/**
 * Check if a voice memo has an embedded transcript by scanning atom headers
 * without reading the full file into memory. This avoids buffering large
 * mdat payloads (often 30-50 MB each) when only a boolean is needed.
 */
export function hasTranscript(filePath: string): boolean {
  try {
    const fd = openSync(filePath, "r");
    try {
      const fileSize = fstatSync(fd).size;
      return scanForTsrp(fd, fileSize, 0, ["moov", "trak", "udta", "tsrp"]);
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
}

function readAtomHeader(
  fd: number,
  offset: number,
  fileSize: number
): { type: string; size: number; headerSize: number } | null {
  if (offset + 8 > fileSize) return null;

  const buf = Buffer.alloc(16);
  const bytesRead = readSync(
    fd,
    buf,
    0,
    Math.min(16, fileSize - offset),
    offset
  );

  if (bytesRead < 8) return null;

  let size = buf.readUInt32BE(0);
  const type = buf.toString("ascii", 4, 8);
  let headerSize = 8;

  if (size === 1) {
    if (bytesRead < 16 || offset + 16 > fileSize) return null;
    size = Number(buf.readBigUInt64BE(8));
    headerSize = 16;
  } else if (size === 0) {
    size = fileSize - offset;
  }

  if (size < headerSize || offset + size > fileSize) return null;
  return { type, size, headerSize };
}

function readAtomData(
  fd: number,
  offset: number,
  length: number
): Buffer | null {
  const data = Buffer.alloc(length);
  let bytesRead = 0;

  while (bytesRead < length) {
    const count = readSync(
      fd,
      data,
      bytesRead,
      length - bytesRead,
      offset + bytesRead
    );
    if (count === 0) return null;
    bytesRead += count;
  }

  return data;
}

function scanForTsrp(
  fd: number,
  fileSize: number,
  offset: number,
  path: string[]
): boolean {
  if (path.length === 0) return true;

  const [target, ...rest] = path;
  let pos = offset;

  while (pos < fileSize) {
    const header = readAtomHeader(fd, pos, fileSize);
    if (!header) break;

    if (header.type === target) {
      if (rest.length === 0) {
        const data = readAtomData(
          fd,
          pos + header.headerSize,
          header.size - header.headerSize
        );
        return data !== null && parseTsrpData(data) !== null;
      }
      return scanForTsrp(fd, pos + header.size, pos + header.headerSize, rest);
    }
    pos += header.size;
  }

  return false;
}
