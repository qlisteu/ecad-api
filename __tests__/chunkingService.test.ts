import { ChunkingService } from "../src/services/chunkingService";

describe("ChunkingService", () => {
  const service = new ChunkingService(10, 2);

  it("splits text with overlap", () => {
    const chunks = service.chunk("abcdefghijkl");
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ text: "abcdefghij", start: 0, end: 10 });
    expect(chunks[1]).toMatchObject({ text: "ijkl", start: 8, end: 12 });
  });

  it("returns empty array for empty text", () => {
    expect(service.chunk("")).toEqual([]);
  });
});
