import { homedir } from "os";
import { join, relative, isAbsolute, sep } from "path";
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

export function getAudioFilePath(filename: string): string | null {
  const recordingsPath = getVoiceMemosPath();
  if (!recordingsPath) {
    return null;
  }

  const audioPath = join(recordingsPath, filename);

  // Prevent directory traversal: the resolved path must stay inside the
  // Voice Memos recordings directory. There is deliberately no extension
  // check here: Voice Memos stores recordings as both .m4a and .qta, and
  // this resolver runs for every database row.
  if (!isValidVoiceMemosPath(audioPath)) {
    return null;
  }

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

  // Compare on a path boundary, not a string prefix: a plain startsWith()
  // check accepts sibling directories such as "Recordings-evil". The check
  // is lexical and does not resolve symlinks.
  const rel = relative(recordingsPath, join(path));
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
}
