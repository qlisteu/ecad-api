import { RagService } from "../src/services/ragService";
import { IChunkingService, TextChunk } from "../src/services/chunkingService";
import { IEmbeddingService } from "../src/services/embeddingService";
import { IEmbeddingsRepository } from "../src/repositories/embeddingsRepository";

describe("RagService", () => {
  const chunkingService: IChunkingService = {
    chunk: jest.fn(),
  };
  const embeddingService: IEmbeddingService = {
    embedTexts: jest.fn(),
    embedQuery: jest.fn(),
  };
  const repository: IEmbeddingsRepository = {
    upsertEmbeddings: jest.fn(),
    searchSimilar: jest.fn(),
  };

  const service = new RagService(chunkingService, embeddingService, repository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("indexes document with chunking and embeddings", async () => {
    (chunkingService.chunk as jest.Mock).mockReturnValueOnce([
      { text: "a", start: 0, end: 1 },
      { text: "b", start: 1, end: 2 },
    ] as TextChunk[]);
    (embeddingService.embedTexts as jest.Mock).mockResolvedValueOnce([
      [0.1],
      [0.2],
    ]);

    await service.indexDocument({
      zoneCode: "Z1",
      sourceUrl: "u",
      fullText: "ab",
    });

    expect(chunkingService.chunk).toHaveBeenCalledWith("ab");
    expect(embeddingService.embedTexts).toHaveBeenCalledWith(["a", "b"]);
    expect(repository.upsertEmbeddings).toHaveBeenCalledWith([
      {
        id: "Z1:0:1",
        zoneCode: "Z1",
        sourceUrl: "u",
        chunk: "a",
        embedding: [0.1],
        start: 0,
        end: 1,
      },
      {
        id: "Z1:1:2",
        zoneCode: "Z1",
        sourceUrl: "u",
        chunk: "b",
        embedding: [0.2],
        start: 1,
        end: 2,
      },
    ]);
  });

  it("returns empty when no query embedding", async () => {
    (embeddingService.embedQuery as jest.Mock).mockResolvedValueOnce([]);
    const res = await service.retrieveContext({ zoneCode: "Z1", query: "q" });
    expect(res).toEqual([]);
    expect(repository.searchSimilar).not.toHaveBeenCalled();
  });

  it("retrieves context via repo", async () => {
    (embeddingService.embedQuery as jest.Mock).mockResolvedValueOnce([1]);
    (repository.searchSimilar as jest.Mock).mockResolvedValueOnce([
      { chunk: "c1", score: 0.9, start: 0, end: 3, sourceUrl: "u" },
    ]);

    const res = await service.retrieveContext({
      zoneCode: "Z1",
      query: "q",
      limit: 3,
    });

    expect(repository.searchSimilar).toHaveBeenCalledWith([1], "Z1", 3);
    expect(res[0]).toMatchObject({ chunk: "c1", score: 0.9 });
  });
});
