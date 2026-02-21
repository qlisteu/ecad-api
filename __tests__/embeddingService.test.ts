import axios from "axios";
import { OpenAIEmbeddingService } from "../src/services/embeddingService";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("OpenAIEmbeddingService", () => {
  const apiKey = "test-key";
  const service = new OpenAIEmbeddingService(apiKey, "text-embedding-3-small");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns embeddings array", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: [
          { embedding: [1, 2, 3] },
          { embedding: [4, 5, 6] },
        ],
      },
    } as any);

    const result = await service.embedTexts(["a", "b"]);
    expect(result).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      { input: ["a", "b"], model: "text-embedding-3-small" },
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("returns empty array when no texts", async () => {
    const result = await service.embedTexts([]);
    expect(result).toEqual([]);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("embeds query via embedTexts", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: [
          { embedding: [9, 9] },
        ],
      },
    } as any);

    const result = await service.embedQuery("hello");
    expect(result).toEqual([9, 9]);
  });
});
