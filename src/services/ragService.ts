import { IChunkingService, TextChunk } from "./chunkingService";
import { IEmbeddingService } from "./embeddingService";
import { IEmbeddingsRepository } from "../repositories/embeddingsRepository";
import { RetrievedChunk } from "../models/embedding";

export interface IRagService {
  indexDocument(params: {
    zoneCode: string;
    sourceUrl: string;
    fullText: string;
  }): Promise<void>;

  retrieveContext(params: {
    zoneCode: string;
    query: string;
    limit?: number;
  }): Promise<RetrievedChunk[]>;
}

export class RagService implements IRagService {
  constructor(
    private readonly chunkingService: IChunkingService,
    private readonly embeddingService: IEmbeddingService,
    private readonly repository: IEmbeddingsRepository,
  ) {}

  async indexDocument(params: {
    zoneCode: string;
    sourceUrl: string;
    fullText: string;
  }): Promise<void> {
    const { zoneCode, sourceUrl, fullText } = params;
    if (!zoneCode || !sourceUrl || !fullText) return;

    const chunks: TextChunk[] = this.chunkingService.chunk(fullText);
    if (!chunks.length) return;

    console.log(
      `[RAG] Indexing document for zone=${zoneCode}, source=${sourceUrl}, chunks=${chunks.length}`,
    );

    const embeddings = await this.embeddingService.embedTexts(
      chunks.map((c) => c.text),
    );

    console.log(
      `[RAG] Embeddings generated: ${embeddings.length} (expected ${chunks.length})`,
    );

    const records = chunks.map((chunk, idx) => ({
      id: `${zoneCode}:${chunk.start}:${chunk.end}`,
      zoneCode,
      sourceUrl,
      chunk: chunk.text,
      embedding: embeddings[idx] || [],
      start: chunk.start,
      end: chunk.end,
    }));

    console.log(`[RAG] Upserting ${records.length} embedding records...`);
    await this.repository.upsertEmbeddings(records);
    console.log(`[RAG] Upsert completed`);
  }

  async retrieveContext(params: {
    zoneCode: string;
    query: string;
    limit?: number;
  }): Promise<RetrievedChunk[]> {
    const { zoneCode, query, limit = 8 } = params;
    if (!zoneCode || !query) return [];

    console.log(
      `[RAG] Retrieving context for zone=${zoneCode}, query="${query}", k=${limit}`,
    );
    const queryEmbedding = await this.embeddingService.embedQuery(query);
    if (!queryEmbedding.length) return [];

    const results = await this.repository.searchSimilar(
      queryEmbedding,
      zoneCode,
      limit,
    );
    console.log(`[RAG] Retrieved ${results.length} chunks`);
    results.slice(0, 5).forEach((r, idx) => {
      console.log(
        ` [RAG][${idx}] score=${r.score?.toFixed?.(4) ?? r.score} start=${r.start} end=${r.end} text=${(r.chunk || "").slice(0, 160).replace(/\s+/g, " ")}`,
      );
    });
    return results;
  }
}
