import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

// Voice Memos locations have changed across macOS versions
const VOICE_MEMOS_PATHS = [
  // macOS Sonoma/Sequoia (current)
  "Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings",
  // Older macOS versions
  "Library/Application Support/com.apple.voicememos/Recordings",
  // Container-based location
  "Library/Containers/com.apple.VoiceMemos/Data/Library/Application Support/Recordings",
];

const DB_FILENAME = "CloudRecordings.db";

export function getVoiceMemosPath(): string | null {
  const home = homedir();

  for (const relativePath of VOICE_MEMOS_PATHS) {
    const fullPath = join(home, relativePath);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

export function getDatabasePath(): string | null {
  const recordingsPath = getVoiceMemosPath();
  if (!recordingsPath) {
    return null;
  }

  const dbPath = join(recordingsPath, DB_FILENAME);
  if (existsSync(dbPath)) {
    return dbPath;
  }

  return null;
}

export function getAudioFilePath(filename: string | null): string | null {
  if (!filename) {
    return null;
  }
  const recordingsPath = getVoiceMemosPath();
  if (!recordingsPath) {
    return null;
  }

  const audioPath = join(recordingsPath, filename);
  if (existsSync(audioPath)) {
    return audioPath;
  }

  return null;
}

export function isValidVoiceMemosPath(path: string): boolean {
  const recordingsPath = getVoiceMemosPath();
  if (!recordingsPath) {
    return false;
  }

  // Ensure the path is within the Voice Memos directory (prevent directory traversal)
  const normalizedPath = join(path);
  return normalizedPath.startsWith(recordingsPath);
}
