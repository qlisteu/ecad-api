import { SupabaseEmbeddingsRepository } from "../src/repositories/embeddingsRepository";
import { ISupabaseClient } from "../src/config/supabaseClient";

const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockRpc = jest.fn();

const supabaseMock = {
  from: () => ({ upsert: mockUpsert }),
  rpc: mockRpc,
} as unknown as ISupabaseClient;

describe("SupabaseEmbeddingsRepository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("upserts records", async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });
    const repo = new SupabaseEmbeddingsRepository(supabaseMock);
    await repo.upsertEmbeddings([
      {
        zoneCode: "Z1",
        sourceUrl: "u",
        chunk: "abc",
        embedding: [1, 2],
        start: 0,
        end: 3,
      },
    ]);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("throws on upsert error", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "fail" } });
    const repo = new SupabaseEmbeddingsRepository(supabaseMock);
    await expect(
      repo.upsertEmbeddings([
        {
          zoneCode: "Z1",
          sourceUrl: "u",
          chunk: "abc",
          embedding: [1, 2],
          start: 0,
          end: 3,
        },
      ]),
    ).rejects.toThrow("fail");
  });

  it("searches similar and maps result", async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { chunk: "c1", score: 0.9, start: 0, end: 3, source_url: "u" },
      ],
      error: null,
    });
    const repo = new SupabaseEmbeddingsRepository(supabaseMock);
    const res = await repo.searchSimilar([1, 2], "Z1", 5);
    expect(mockRpc).toHaveBeenCalledWith("match_embeddings", {
      query_embedding: [1, 2],
      match_count: 5,
      zone_code_filter: "Z1",
    });
    expect(res[0]).toMatchObject({ chunk: "c1", score: 0.9, start: 0, end: 3, sourceUrl: "u" });
  });

  it("throws on rpc error", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "fail" } });
    const repo = new SupabaseEmbeddingsRepository(supabaseMock);
    await expect(repo.searchSimilar([1], "Z", 1)).rejects.toThrow("fail");
  });
});
