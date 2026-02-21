import axios from "axios";

export interface IEmbeddingService {
  embedTexts(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}

export class OpenAIEmbeddingService implements IEmbeddingService {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = "text-embedding-3-small",
  ) {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY not set");
    }
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];

    const response = await axios.post(
      "https://api.openai.com/v1/embeddings",
      {
        input: texts,
        model: this.model,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.data.map((item: any) => item.embedding as number[]);
  }

  async embedQuery(query: string): Promise<number[]> {
    const [embedding] = await this.embedTexts([query]);
    return embedding || [];
  }
}
