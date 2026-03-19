import Database from "better-sqlite3";
import { getDatabasePath, getAudioFilePath } from "../utils/paths.js";
import { coreDataToISO } from "../utils/dates.js";
import { hasTranscript } from "../utils/mp4-parser.js";
import type { VoiceMemo, CloudRecordingRow } from "../types/index.js";

export class VoiceMemoDatabase {
  private db: Database.Database | null = null;
  private dbPath: string | null = null;

  constructor() {
    this.dbPath = getDatabasePath();
  }

  private ensureConnection(): Database.Database {
    if (!this.dbPath) {
      throw new Error(
        "Voice Memos database not found. Ensure Voice Memos app has been opened at least once and Full Disk Access is granted."
      );
    }

    if (!this.db) {
      // Open in read-only mode for safety
      this.db = new Database(this.dbPath, { readonly: true });
    }

    return this.db;
  }

  private rowToVoiceMemo(row: CloudRecordingRow): VoiceMemo {
    const fullPath = getAudioFilePath(row.ZPATH);

    return {
      id: row.Z_PK,
      title: row.ZENCRYPTEDTITLE || row.ZPATH || "Untitled",
      customLabel: row.ZCUSTOMLABEL,
      date: coreDataToISO(row.ZDATE),
      duration: row.ZDURATION,
      path: row.ZPATH || "",
      fullPath: fullPath || "",
      hasTranscript: fullPath ? hasTranscript(fullPath) : false,
    };
  }

  listMemos(
    options: {
      limit?: number;
      offset?: number;
      search?: string;
    } = {}
  ): { memos: VoiceMemo[]; total: number } {
    const db = this.ensureConnection();
    const { limit = 50, offset = 0, search } = options;

    let whereClause = "";
    const params: (string | number)[] = [];

    if (search) {
      whereClause = "WHERE ZCUSTOMLABEL LIKE ? OR ZENCRYPTEDTITLE LIKE ?";
      params.push(`%${search}%`, `%${search}%`);
    }

    // Get total count
    const countStmt = db.prepare(
      `SELECT COUNT(*) as count FROM ZCLOUDRECORDING ${whereClause}`
    );
    const countResult = countStmt.get(...params) as { count: number };
    const total = countResult.count;

    // Get paginated results, ordered by date descending (most recent first)
    const selectStmt = db.prepare(`
      SELECT Z_PK, ZPATH, ZCUSTOMLABEL, ZENCRYPTEDTITLE, ZDATE, ZDURATION
      FROM ZCLOUDRECORDING
      ${whereClause}
      ORDER BY ZDATE DESC
      LIMIT ? OFFSET ?
    `);

    const rows = selectStmt.all(
      ...params,
      limit,
      offset
    ) as CloudRecordingRow[];
    const memos = rows.map((row) => this.rowToVoiceMemo(row));

    return { memos, total };
  }

  getMemo(id: number): VoiceMemo | null {
    const db = this.ensureConnection();

    const stmt = db.prepare(`
      SELECT Z_PK, ZPATH, ZCUSTOMLABEL, ZENCRYPTEDTITLE, ZDATE, ZDURATION
      FROM ZCLOUDRECORDING
      WHERE Z_PK = ?
    `);

    const row = stmt.get(id) as CloudRecordingRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToVoiceMemo(row);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
