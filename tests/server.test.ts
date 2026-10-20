import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "module";

// Mock all dependencies before importing
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock("../src/services/voice-memo-db.js", () => ({
  VoiceMemoDatabase: vi.fn().mockImplementation(() => ({
    listMemos: vi.fn(),
    getMemo: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("../src/services/transcript-extractor.js", () => ({
  TranscriptExtractor: vi.fn().mockImplementation(() => ({
    extractTranscript: vi.fn(),
  })),
}));

vi.mock("../src/services/transcription-service.js", () => ({
  TranscriptionService: vi.fn().mockImplementation(() => ({
    transcribe: vi.fn(),
  })),
}));

import { VoiceMemoMCPServer } from "../src/server.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { VoiceMemoDatabase } from "../src/services/voice-memo-db.js";
import { TranscriptExtractor } from "../src/services/transcript-extractor.js";
import { TranscriptionService } from "../src/services/transcription-service.js";

const MockServer = vi.mocked(Server);

const packageVersion = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;

describe("VoiceMemoMCPServer", () => {
  let mockServerInstance: {
    setRequestHandler: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockServerInstance = {
      setRequestHandler: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
    };

    MockServer.mockImplementation(() => mockServerInstance as never);
  });

  describe("constructor", () => {
    it("should initialize server with correct configuration", () => {
      new VoiceMemoMCPServer();

      expect(Server).toHaveBeenCalledWith(
        {
          name: "apple-voice-memo-mcp",
          version: packageVersion,
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
    });

    it("should initialize database", () => {
      new VoiceMemoMCPServer();
      expect(VoiceMemoDatabase).toHaveBeenCalled();
    });

    it("should initialize transcript extractor", () => {
      new VoiceMemoMCPServer();
      expect(TranscriptExtractor).toHaveBeenCalled();
    });

    it("should initialize transcription service with env var", () => {
      const originalEnv = process.env.VOICE_MEMO_TRANSCRIBER_PATH;
      process.env.VOICE_MEMO_TRANSCRIBER_PATH = "/path/to/transcriber";

      new VoiceMemoMCPServer();

      expect(TranscriptionService).toHaveBeenCalledWith("/path/to/transcriber");

      process.env.VOICE_MEMO_TRANSCRIBER_PATH = originalEnv;
    });

    it("should setup request handlers", () => {
      new VoiceMemoMCPServer();

      // Should set up 2 handlers: ListTools and CallTool
      expect(mockServerInstance.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe("run", () => {
    it("should connect to transport", async () => {
      const server = new VoiceMemoMCPServer();
      await server.run();

      expect(mockServerInstance.connect).toHaveBeenCalled();
    });
  });

  describe("close", () => {
    it("should close database connection", () => {
      const server = new VoiceMemoMCPServer();
      const mockDbInstance = vi.mocked(VoiceMemoDatabase).mock.results[0].value;

      server.close();

      expect(mockDbInstance.close).toHaveBeenCalled();
    });
  });

  describe("request handlers", () => {
    it("should register ListTools handler with 5 tools", async () => {
      new VoiceMemoMCPServer();

      // Get the ListTools handler
      const listToolsHandler =
        mockServerInstance.setRequestHandler.mock.calls[0][1];

      const result = await listToolsHandler();

      expect(result.tools).toHaveLength(5);
      expect(result.tools.map((t: { name: string }) => t.name)).toEqual([
        "list_voice_memos",
        "get_voice_memo",
        "get_audio",
        "get_transcript",
        "transcribe_memo",
      ]);
    });

    it("should handle list_voice_memos tool call", async () => {
      new VoiceMemoMCPServer();
      const mockDbInstance = vi.mocked(VoiceMemoDatabase).mock.results[0].value;
      mockDbInstance.listMemos.mockReturnValue({ memos: [], total: 0 });

      // Get the CallTool handler
      const callToolHandler =
        mockServerInstance.setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "list_voice_memos",
          arguments: { limit: 10 },
        },
      });

      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text)).toHaveProperty("memos");
    });

    it("should handle get_voice_memo tool call", async () => {
      new VoiceMemoMCPServer();
      const mockDbInstance = vi.mocked(VoiceMemoDatabase).mock.results[0].value;
      mockDbInstance.getMemo.mockReturnValue(null);

      const callToolHandler =
        mockServerInstance.setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "get_voice_memo",
          arguments: { id: 1 },
        },
      });

      expect(result.content[0].type).toBe("text");
    });

    it("should handle get_audio tool call", async () => {
      new VoiceMemoMCPServer();
      const mockDbInstance = vi.mocked(VoiceMemoDatabase).mock.results[0].value;
      mockDbInstance.getMemo.mockReturnValue(null);

      const callToolHandler =
        mockServerInstance.setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "get_audio",
          arguments: { id: 1 },
        },
      });

      expect(result.content[0].type).toBe("text");
    });

    it("should handle get_transcript tool call", async () => {
      new VoiceMemoMCPServer();
      const mockDbInstance = vi.mocked(VoiceMemoDatabase).mock.results[0].value;
      mockDbInstance.getMemo.mockReturnValue(null);

      const callToolHandler =
        mockServerInstance.setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "get_transcript",
          arguments: { id: 1 },
        },
      });

      expect(result.content[0].type).toBe("text");
    });

    it("should handle transcribe_memo tool call", async () => {
      new VoiceMemoMCPServer();
      const mockDbInstance = vi.mocked(VoiceMemoDatabase).mock.results[0].value;
      mockDbInstance.getMemo.mockReturnValue(null);

      const callToolHandler =
        mockServerInstance.setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "transcribe_memo",
          arguments: { id: 1 },
        },
      });

      expect(result.content[0].type).toBe("text");
    });

    it("should handle unknown tool", async () => {
      new VoiceMemoMCPServer();

      const callToolHandler =
        mockServerInstance.setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "unknown_tool",
          arguments: {},
        },
      });

      expect(result.content[0].text).toBe("Unknown tool: unknown_tool");
      expect(result.isError).toBe(true);
    });

    it("should handle errors in tool calls", async () => {
      new VoiceMemoMCPServer();
      const mockDbInstance = vi.mocked(VoiceMemoDatabase).mock.results[0].value;
      mockDbInstance.listMemos.mockImplementation(() => {
        throw new Error("Database error");
      });

      const callToolHandler =
        mockServerInstance.setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "list_voice_memos",
          arguments: {},
        },
      });

      expect(result.content[0].text).toBe("Error: Database error");
      expect(result.isError).toBe(true);
    });

    it("should handle non-Error exceptions", async () => {
      new VoiceMemoMCPServer();
      const mockDbInstance = vi.mocked(VoiceMemoDatabase).mock.results[0].value;
      mockDbInstance.listMemos.mockImplementation(() => {
        throw "string error";
      });

      const callToolHandler =
        mockServerInstance.setRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: "list_voice_memos",
          arguments: {},
        },
      });

      expect(result.content[0].text).toBe("Error: Unknown error occurred");
      expect(result.isError).toBe(true);
    });
  });
});
