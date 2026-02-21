export interface EmbeddingRecord {
  id?: string;
  zoneCode: string;
  sourceUrl: string;
  chunk: string;
  embedding: number[];
  start: number;
  end: number;
}

export interface RetrievedChunk {
  chunk: string;
  score: number;
  start: number;
  end: number;
  sourceUrl: string;
}
