export interface VoiceMemo {
  id: number;
  title: string;
  customLabel: string | null;
  date: string; // ISO 8601
  duration: number; // seconds
  path: string; // filename
  fullPath: string; // absolute path
  hasTranscript: boolean;
}

export interface VoiceMemoListResult {
  memos: VoiceMemo[];
  total: number;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  segments?: TranscriptSegment[];
  locale: string;
}

export interface AudioResult {
  path: string;
  mimeType: string;
  base64?: string;
}

export interface TranscriptionResult {
  success: boolean;
  transcript?: string;
  segments?: TranscriptSegment[];
  error?: string;
}

// Raw database row from CloudRecordings.db
export interface CloudRecordingRow {
  Z_PK: number;
  ZPATH: string | null;
  ZCUSTOMLABEL: string | null;
  ZENCRYPTEDTITLE: string | null;
  ZDATE: number; // Core Data timestamp
  ZDURATION: number;
}

// tsrp atom JSON structure
export interface TsrpData {
  attributedString: {
    attributeTable: Array<{ timeRange: [number, number] }>;
    runs: Array<string | number>;
  };
  locale: {
    identifier: string;
    current: number;
  };
}
