import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { VoiceMemoDatabase } from "./services/voice-memo-db.js";
import { TranscriptExtractor } from "./services/transcript-extractor.js";
import { TranscriptionService } from "./services/transcription-service.js";
import { VERSION } from "./version.js";

import {
  listMemos,
  listMemosSchema,
  listMemosToolDefinition,
} from "./tools/list-memos.js";
import {
  getMemo,
  getMemoSchema,
  getMemoToolDefinition,
} from "./tools/get-memo.js";
import {
  getAudio,
  getAudioSchema,
  getAudioToolDefinition,
} from "./tools/get-audio.js";
import {
  getTranscript,
  getTranscriptSchema,
  getTranscriptToolDefinition,
} from "./tools/get-transcript.js";
import {
  transcribeMemo,
  transcribeSchema,
  transcribeToolDefinition,
} from "./tools/transcribe.js";

export class VoiceMemoMCPServer {
  private server: Server;
  private db: VoiceMemoDatabase;
  private transcriptExtractor: TranscriptExtractor;
  private transcriptionService: TranscriptionService;

  constructor() {
    this.server = new Server(
      {
        name: "apple-voice-memo-mcp",
        version: VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.db = new VoiceMemoDatabase();
    this.transcriptExtractor = new TranscriptExtractor();
    this.transcriptionService = new TranscriptionService(
      process.env.VOICE_MEMO_TRANSCRIBER_PATH
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        listMemosToolDefinition,
        getMemoToolDefinition,
        getAudioToolDefinition,
        getTranscriptToolDefinition,
        transcribeToolDefinition,
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list_voice_memos": {
            const input = listMemosSchema.parse(args);
            const result = await listMemos(input, this.db);
            return { content: [{ type: "text", text: result }] };
          }

          case "get_voice_memo": {
            const input = getMemoSchema.parse(args);
            const result = await getMemo(input, this.db);
            return { content: [{ type: "text", text: result }] };
          }

          case "get_audio": {
            const input = getAudioSchema.parse(args);
            const result = await getAudio(input, this.db);
            return { content: [{ type: "text", text: result }] };
          }

          case "get_transcript": {
            const input = getTranscriptSchema.parse(args);
            const result = await getTranscript(
              input,
              this.db,
              this.transcriptExtractor
            );
            return { content: [{ type: "text", text: result }] };
          }

          case "transcribe_memo": {
            const input = transcribeSchema.parse(args);
            const result = await transcribeMemo(
              input,
              this.db,
              this.transcriptionService
            );
            return { content: [{ type: "text", text: result }] };
          }

          default:
            return {
              content: [{ type: "text", text: `Unknown tool: ${name}` }],
              isError: true,
            };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  close(): void {
    this.db.close();
  }
}
