# AGENTS.md - Developer Guidelines for ecad-api

## Project Overview

ecad-api is a TypeScript/Express REST API for urban planning document retrieval and analysis (RAG-based system for urbanism regulations). It uses Supabase for embeddings storage, OpenAI for embeddings, and handles PDF processing.

## Commands

### Build & Run
```bash
npm run build        # Compile TypeScript to dist/
npm run start       # Run production server from dist/
npm run dev         # Run dev server with hot reload (ts-node)
```

### Testing
```bash
npm test            # Run all tests
npm run test:watch  # Run tests in watch mode
jest --testPathPattern=ragService.test.ts  # Run single test file
jest --testNamePattern="indexes document" # Run single test by name
```

### Linting
```bash
npm run lint        # Run ESLint on .ts and .js files
```

### Utilities
```bash
npm run kill-port   # Kill process on port 4000 (Windows)
```

---

## Code Style Guidelines

### TypeScript Configuration
- Target: ES2018, CommonJS modules
- Strict mode enabled (with `noImplicitAny: false`)
- Always use TypeScript types - avoid `any` when possible

### Naming Conventions
- **Classes**: PascalCase (e.g., `UrbanismService`, `RagService`)
- **Interfaces**: PascalCase with `I` prefix (e.g., `IEmbeddingService`)
- **Variables/Functions**: camelCase
- **Files**: kebab-case (e.g., `ragService.ts`, `urbanism.controller.ts`)
- **Constants**: UPPER_SNAKE_CASE for configuration values

### Imports
- Use relative imports for local modules (`../services/...`)
- Use absolute imports for npm packages
- Order: external libs, then internal modules
- Group imports logically, no newline between different groups

```typescript
import axios from "axios";
import { Request, Response } from "express";
import { UrbanismService } from "../services/urbanismService";
import { IRagService } from "./ragService";
```

### Interfaces & Types
- Define interfaces for all service abstractions (e.g., `IEmbeddingService`)
- Use interfaces for input/output DTOs
- Prefer explicit return types for public methods
- Use optional properties with `?` when needed

```typescript
export interface IEmbeddingService {
  embedTexts(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}
```

### Class Structure
- Use dependency injection via constructor
- Mark dependencies as `private readonly`
- Keep services focused (single responsibility)

```typescript
export class RagService implements IRagService {
  constructor(
    private readonly chunkingService: IChunkingService,
    private readonly embeddingService: IEmbeddingService,
    private readonly repository: IEmbeddingsRepository,
  ) {}
}
```

### Error Handling
- Use try/catch blocks in controllers
- Return appropriate HTTP status codes (400, 404, 500)
- Log errors with `console.error()` and meaningful context
- Never expose internal error details to clients

```typescript
try {
  const result = await this.service.doSomething();
  res.status(200).json(result);
} catch (error: any) {
  console.error("Error doing something:", error);
  res.status(500).json({ error: "Failed to do something" });
}
```

### Logging
- Use `console.log()` for operational logging with `[SERVICE]` prefixes
- Include relevant context (parameters, sizes, counts)
- Avoid logging sensitive data

```typescript
console.log(`[RAG] Indexing document for zone=${zoneCode}, chunks=${chunks.length}`);
```

### Testing
- Place tests in `__tests__/` directory
- Use `*.test.ts` naming convention
- Mock dependencies using Jest
- Use `jest.fn()` for mocks and `mockResolvedValueOnce` for async returns

```typescript
const embeddingService: IEmbeddingService = {
  embedTexts: jest.fn(),
  embedQuery: jest.fn(),
};
```

### File Organization
```
src/
  config/       # Configuration (Supabase client, cities)
  controllers/ # Express route handlers
  models/       # Data models/types
  repositories/ # Data access layer
  routes/      # Express route definitions
  services/     # Business logic (can have subdirs like providers/)
__tests__/      # Jest test files
```

### Express Routes
- Use async handlers
- Validate input early, return 400 for invalid input
- Return JSON responses

```typescript
public lookupAddress = async (req: Request, res: Response): Promise<void> => {
  const { address } = req.body;
  if (!address || typeof address !== "string") {
    res.status(400).json({ error: "Address is required" });
    return;
  }
  // ...
};
```

### Async/Await
- Always await async functions
- Handle empty/null cases explicitly
- Don't leave unhandled promises

---

## Environment Variables

Required in `.env`:
- `OPENAI_API_KEY` - OpenAI API key for embeddings
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key

---

## API Endpoints

- `POST /api/urbanism/lookup` - Lookup address for urbanism info
- `POST /api/urbanism/building-details` - Get building regulations
- `POST /api/multi-city/lookup` - Multi-city urbanism lookup
