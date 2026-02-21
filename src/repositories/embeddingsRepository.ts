import { ISupabaseClient } from "../config/supabaseClient";
import { EmbeddingRecord, RetrievedChunk } from "../models/embedding";

export interface IEmbeddingsRepository {
  upsertEmbeddings(records: EmbeddingRecord[]): Promise<void>;
  searchSimilar(
    queryEmbedding: number[],
    zoneCode: string,
    limit: number,
  ): Promise<RetrievedChunk[]>;
}

export class SupabaseEmbeddingsRepository implements IEmbeddingsRepository {
  private readonly table = "embeddings";
  private readonly matchFunction = "match_embeddings";

  constructor(private readonly client: ISupabaseClient) {}

  async upsertEmbeddings(records: EmbeddingRecord[]): Promise<void> {
    if (!records.length) return;

    const { error } = await this.client
      .from(this.table)
      .upsert(
        records.map((r) => ({
          id: r.id,
          zone_code: r.zoneCode,
          source_url: r.sourceUrl,
          chunk: r.chunk,
          embedding: r.embedding,
          start: r.start,
          end: r.end,
        })),
        { onConflict: "id" },
      );

    if (error) {
      throw new Error(`Failed to upsert embeddings: ${error.message}`);
    }
  }

  async searchSimilar(
    queryEmbedding: number[],
    zoneCode: string,
    limit: number,
  ): Promise<RetrievedChunk[]> {
    const { data, error } = await this.client.rpc(this.matchFunction, {
      query_embedding: queryEmbedding,
      match_count: limit,
      zone_code_filter: zoneCode,
    });

    if (error) {
      throw new Error(`Failed to search embeddings: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      chunk: row.chunk,
      score: row.score,
      start: row.start,
      end: row.end,
      sourceUrl: row.source_url,
    }));
  }
}
