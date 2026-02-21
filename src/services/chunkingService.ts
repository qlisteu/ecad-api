export interface TextChunk {
  text: string;
  start: number;
  end: number;
}

export interface IChunkingService {
  chunk(text: string, chunkSize?: number, overlap?: number): TextChunk[];
}

export class ChunkingService implements IChunkingService {
  constructor(
    private readonly defaultChunkSize = 800,
    private readonly defaultOverlap = 120,
  ) {}

  chunk(text: string, chunkSize = this.defaultChunkSize, overlap = this.defaultOverlap): TextChunk[] {
    if (!text) return [];
    const safeChunkSize = Math.max(1, chunkSize);
    const safeOverlap = Math.max(0, Math.min(overlap, safeChunkSize - 1));

    const chunks: TextChunk[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(text.length, start + safeChunkSize);
      chunks.push({ text: text.slice(start, end), start, end });
      if (end === text.length) break;
      start = end - safeOverlap;
    }

    return chunks;
  }
}
