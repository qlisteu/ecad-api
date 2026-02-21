import axios from "axios";
import { createSupabaseClient } from "../config/supabaseClient";
import { ChunkingService } from "./chunkingService";
import { OpenAIEmbeddingService } from "./embeddingService";
import { SupabaseEmbeddingsRepository } from "../repositories/embeddingsRepository";
import { RagService } from "./ragService";

export interface AddressSearchResult {
  IdMapSearch: string;
  Name: string;
  IconClass: string;
  Wkt: string;
  DataSourceName: string;
}

export interface ZoneInfo {
  feature_id: string;
  zona: string | null;
  subzona: string | null;
  cod_zona: string | null;
  definitie: string | null;
  pot: string | null;
  cut: string | null;
  hmax: string | null;
  hrmax: string | null;
  regulament: string | null;
  regulamentAnalysis?: string | null;
  buildingTypes?: string[];
}

export interface UrbanismLookupResult {
  address: string;
  searchResults: AddressSearchResult[];
  selectedAddress: AddressSearchResult | null;
  point: { x: number; y: number } | null;
  zones: ZoneInfo[];
}

export class UrbanismService {
  private readonly baseUrl = "https://urbanism.pmb.ro/xportalurb";
  private cookieJar: string[] = [];
  private sessionInitialized = false;

  private ragService?: RagService;

  constructor() {
    try {
      const supabaseClient = createSupabaseClient();
      const chunkingService = new ChunkingService();
      const embeddingService = new OpenAIEmbeddingService();
      const repo = new SupabaseEmbeddingsRepository(supabaseClient);
      this.ragService = new RagService(chunkingService, embeddingService, repo);
      console.log("RAG initialized with Supabase client");
    } catch (error) {
      console.warn(
        "RAG setup skipped (missing SUPABASE_URL/SUPABASE_SERVICE_KEY or OPENAI_API_KEY):",
        error,
      );
      this.ragService = undefined;
    }
  }

  private extractKeywordSnippets(
    text: string,
    keywords: string[],
    windowSize: number,
    maxSnippets: number,
  ): string[] {
    const lower = text.toLowerCase();
    const snippets: string[] = [];
    const seen = new Set<number>();
    for (const kw of keywords) {
      let idx = lower.indexOf(kw);
      let safety = 0;
      while (idx !== -1 && safety < 20 && snippets.length < maxSnippets) {
        if (![...seen].some((i) => Math.abs(i - idx) < windowSize / 2)) {
          seen.add(idx);
          const start = Math.max(0, idx - windowSize);
          const end = Math.min(text.length, idx + windowSize);
          snippets.push(text.slice(start, end));
        }
        idx = lower.indexOf(kw, idx + kw.length);
        safety++;
      }
      if (snippets.length >= maxSnippets) break;
    }
    return snippets;
  }

  private updateCookies(response: Response): void {
    const cookies = response.headers.get("set-cookie");
    if (cookies) {
      const newCookies = cookies.split(",").map((c) => c.split(";")[0].trim());
      this.cookieJar.push(...newCookies);
      console.log(`Updated cookie jar with ${newCookies.length} cookies`);
    }
  }

  private getCookieHeader(): string {
    return this.cookieJar.join("; ");
  }

  async initializeSession(): Promise<void> {
    if (this.sessionInitialized) {
      console.log("Session already initialized, skipping...");
      return;
    }

    const urls = [
      "https://urbanism.pmb.ro/",
      `${this.baseUrl}/`,
      `${this.baseUrl}/Map`,
    ];

    for (const url of urls) {
      try {
        console.log(`Trying to initialize session with URL: ${url}`);
        const headers: Record<string, string> = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
          "Accept-Language": "en-US,en;q=0.9,ro;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        };

        const response = await fetch(url, { headers });
        console.log(
          `Session initialization response status: ${response.status} ${response.statusText}`,
        );

        this.updateCookies(response);

        if (response.ok) {
          this.sessionInitialized = true;
          console.log("Session initialized successfully");
          return;
        }
      } catch (error) {
        console.warn(`Failed to initialize session with ${url}: ${error}`);
        continue;
      }
    }

    console.error("Failed to initialize session with all URLs");
  }

  async searchAddress(
    address: string,
    retryCount: number = 0,
  ): Promise<AddressSearchResult[]> {
    console.log("Starting address search...");
    const encodedAddress = encodeURIComponent(address);
    const url = `${this.baseUrl}/Map/MapSearch?searchText=${encodedAddress}&idMap=2&idMapSearch=%5B3%2C4%5D&filter%5Bfilters%5D%5B0%5D%5Bvalue%5D=${encodedAddress}&filter%5Bfilters%5D%5B0%5D%5Bfield%5D=Name&filter%5Bfilters%5D%5B0%5D%5Boperator%5D=contains&filter%5Bfilters%5D%5B0%5D%5BignoreCase%5D=true&filter%5Blogic%5D=and`;

    console.log(`Searching address with URL: ${url}`);

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9,ro-RO;q=0.8,ro;q=0.7",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      Connection: "keep-alive",
      Referer: "https://urbanism.pmb.ro/xportalurb/general/xpsw.js",
      "x-app": "6",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    console.log("Making fetch request...");
    const response = await fetch(url, { headers });
    console.log(`Response status: ${response.status} ${response.statusText}`);

    this.updateCookies(response);

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `Address search failed. Status: ${response.status}. Response body: ${text.substring(0, 500)}`,
      );
      throw new Error(`Address search failed: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    console.log(`Response content-type: ${contentType}`);

    if (
      !contentType ||
      (contentType && !contentType.includes("application/json"))
    ) {
      const text = await response.text();
      console.error(
        `Expected JSON but got ${contentType}. Response body: ${text.substring(0, 500)}`,
      );

      if (
        contentType &&
        contentType.includes("text/html") &&
        text.includes("UrbOnLine")
      ) {
        if (retryCount < 2) {
          console.log("Got UrbOnLine page, trying to initialize session...");
          await this.initializeSession();
          return this.searchAddress(address, retryCount + 1);
        } else {
          console.error("Max retries reached for UrbOnLine page");
        }
      }

      throw new Error(`Expected JSON response but got ${contentType}`);
    }

    const data = (await response.json()) as any;
    console.log(
      `Successfully parsed JSON response with ${Array.isArray(data) ? data.length : 0} items`,
    );
    return data as AddressSearchResult[];
  }

  parseWktPoint(wkt: string): { x: number; y: number } | null {
    const match = wkt.match(/MULTIPOINT Z \(([-\d.]+)\s+([-\d.]+)\s+[\d.]+\)/);
    if (!match) {
      return null;
    }
    return {
      x: parseFloat(match[1]),
      y: parseFloat(match[2]),
    };
  }

  calculateBbox(point: { x: number; y: number }, buffer: number = 700): string {
    const minX = point.x - buffer;
    const minY = point.y - buffer;
    const maxX = point.x + buffer;
    const maxY = point.y + buffer;
    return `${minX},${minY},${maxX},${maxY},EPSG:3844`;
  }

  async getFeatures(bbox: string): Promise<any> {
    console.log("Fetching features...");
    const url = `${this.baseUrl}/map/getfeature?layer=8&srs=EPSG:3844&bbox=${bbox}&idMap=1`;

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9,ro-RO;q=0.8,ro;q=0.7",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      Connection: "keep-alive",
      Referer: "https://urbanism.pmb.ro/xportalurb/general/xpsw.js",
      "x-app": "6",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    const response = await fetch(url, { headers });
    console.log(
      `Features response status: ${response.status} ${response.statusText}`,
    );

    this.updateCookies(response);

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `Feature fetch failed. Status: ${response.status}. Response body: ${text.substring(0, 500)}`,
      );
      throw new Error(`Feature fetch failed: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    console.log(`Features response content-type: ${contentType}`);

    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error(
        `Expected JSON but got ${contentType}. Response body: ${text.substring(0, 500)}`,
      );
      throw new Error(`Expected JSON response but got ${contentType}`);
    }

    const data = (await response.json()) as any;
    console.log(
      `Successfully parsed features JSON with ${data?.features?.length || 0} features`,
    );
    return data;
  }

  pointInRing(
    point: { x: number; y: number },
    ring: [number, number][],
  ): boolean {
    const { x, y } = point;
    let inside = false;
    const n = ring.length;

    for (let i = 0; i < n; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % n];

      const dx = x2 - x1;
      const dy = y2 - y1;
      const dxp = x - x1;
      const dyp = y - y1;
      const cross = dx * dyp - dy * dxp;

      if (Math.abs(cross) < 1e-9) {
        if (
          Math.min(x1, x2) - 1e-9 <= x &&
          x <= Math.max(x1, x2) + 1e-9 &&
          Math.min(y1, y2) - 1e-9 <= y &&
          y <= Math.max(y1, y2) + 1e-9
        ) {
          return true;
        }
      }

      if (y1 > y !== y2 > y) {
        const xinters = ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;
        if (x <= xinters) {
          inside = !inside;
        }
      }
    }

    return inside;
  }

  pointInPolygon(
    point: { x: number; y: number },
    coords: number[][][],
  ): boolean {
    const outer = coords[0].map((p) => [p[0], p[1]] as [number, number]);
    if (!this.pointInRing(point, outer)) {
      return false;
    }

    for (let i = 1; i < coords.length; i++) {
      const hole = coords[i].map((p) => [p[0], p[1]] as [number, number]);
      if (this.pointInRing(point, hole)) {
        return false;
      }
    }

    return true;
  }

  findZonesForPoint(
    point: { x: number; y: number },
    featureCollection: any,
  ): ZoneInfo[] {
    const zones: ZoneInfo[] = [];

    for (const feature of featureCollection.features || []) {
      const geom = feature.geometry;
      if (!geom || geom.type !== "Polygon") {
        continue;
      }

      if (this.pointInPolygon(point, geom.coordinates)) {
        const props = feature.properties || {};
        zones.push({
          feature_id: feature.id,
          zona: props.zona,
          subzona: props.subzona,
          cod_zona: props.cod_zona,
          definitie: props.definitie,
          pot: props.pot,
          cut: props.cut,
          hmax: props.hmax,
          hrmax: props.hrmax,
          regulament: props.regulament,
        });
      }
    }

    return zones;
  }

  async lookupAddress(address: string): Promise<UrbanismLookupResult> {
    console.log(`Looking up address: ${address}`);

    if (this.cookieJar.length === 0) {
      console.log("No cookies found, initializing session...");
      await this.initializeSession();
    }

    console.log("Step 1: Searching address...");
    const searchResults = await this.searchAddress(address);
    console.log("Search results found:", searchResults.length);

    if (searchResults.length === 0) {
      console.log("No search results found, returning empty result");
      return {
        address,
        searchResults: [],
        selectedAddress: null,
        point: null,
        zones: [],
      };
    }

    console.log("Step 2: Parsing WKT point...");
    const selectedAddress = searchResults[0];
    const point = this.parseWktPoint(selectedAddress.Wkt);

    if (!point) {
      console.warn(`Could not parse WKT point from: ${selectedAddress.Wkt}`);
      return {
        address,
        searchResults,
        selectedAddress,
        point: null,
        zones: [],
      };
    }

    console.log(`Point (EPSG:3844): ${point.x}, ${point.y}`);

    console.log("Step 3: Calculating bbox and fetching features...");
    const bbox = this.calculateBbox(point);
    console.log("Calculated bbox:", bbox);

    const featureCollection = await this.getFeatures(bbox);
    console.log("Features fetched");

    console.log("Step 4: Finding zones for point...");
    const zones = this.findZonesForPoint(point, featureCollection);
    console.log(`Found ${zones.length} zones for address: ${address}`);

    return {
      address,
      searchResults,
      selectedAddress,
      point,
      zones,
    };
  }

  async downloadAndExtractPdfText(pdfUrl: string): Promise<string> {
    try {
      console.log(`Downloading PDF from: ${pdfUrl}`);

      const response = await axios.get(pdfUrl, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      const pdfParse = (await import("pdf-parse")).default;
      const pdfData = await pdfParse(Buffer.from(response.data));

      console.log(`Extracted ${pdfData.text.length} characters from PDF`);
      return pdfData.text;
    } catch (error) {
      console.error(`Failed to download/parse PDF: ${error}`);
      return "";
    }
  }

  async callOpenAIWithRetry(
    prompt: string,
    maxTokens: number = 500,
    maxRetries: number = 3,
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not set");
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`OpenAI attempt ${attempt}/${maxRetries}`);

        const response = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4.1",
            messages: [
              {
                role: "system",
                content:
                  "Ești un expert în urbanism și reglementări de construcții din România. Extrage informații precise din documente și returnează DOAR JSON valid.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_tokens: maxTokens,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        );

        console.log(`Raw OpenAI response: "${response.data}"`);
        return response.data.choices[0].message.content;
      } catch (error: any) {
        console.error(
          `OpenAI attempt ${attempt} failed:`,
          error.response?.status,
          error.response?.data?.error?.message || error.message,
        );

        if (error.response?.status === 429 && attempt < maxRetries) {
          // Extract the exact wait time from OpenAI error message
          const errorMessage = error.response?.data?.error?.message || "";
          const waitTimeMatch = errorMessage.match(/try again in (\d+)ms/);

          if (waitTimeMatch) {
            const exactWaitTime = parseInt(waitTimeMatch[1]) + 100; // Add 100ms buffer
            console.log(
              `Rate limited. Waiting ${exactWaitTime}ms before retry (as requested by OpenAI)...`,
            );
            await new Promise((resolve) => setTimeout(resolve, exactWaitTime));
          } else {
            // Fallback to exponential backoff if we can't extract the time
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(
              `Rate limited. Could not extract wait time. Using exponential backoff: ${waitTime / 1000}s...`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
          continue;
        }

        if (attempt === maxRetries) {
          throw error;
        }

        // For other errors, wait a bit and retry
        if (attempt < maxRetries) {
          console.log(`Waiting 1s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error("Max retries exceeded");
  }

  async extractBuildingTypes(
    pdfText: string,
    codZona: string,
  ): Promise<string[]> {
    if (!pdfText || !codZona) {
      return [];
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY not set");
      return [];
    }

    try {
      console.log(`Extracting building types for zone: ${codZona}`);

      const truncatedText = pdfText.substring(0, 80000);

      const prompt = `Analizează următorul regulament de urbanism pentru zona "${codZona}" și extrage TOATE tipurile de construcții permise.

Regulament:
${truncatedText}

Te rog să identifici și să listezi TOATE tipurile de construcții/exploatări permise în această zonă. Răspunde DOAR cu un array JSON valid, cu string-uri simple.

Exemplu de format:
["locuințe individuale", "locuințe colective", "spații comerciale sub 250mp", "birouri", "restaurant", "cafenea", "servicii", "anexe gospodărești"]

Important:
- Returnează DOAR array-ul JSON, fără alt text
- Fiecare element trebuie să fie un tip de construcție permis
- Dacă nu găsești informații, returnează array gol: []`;

      const analysis = await this.callOpenAIWithRetry(prompt, 800);
      const analysisText =
        typeof analysis === "string" ? analysis : JSON.stringify(analysis);
      console.log(`Raw OpenAI response (building types): "${analysisText}"`);
      console.log(`Successfully extracted building types for ${codZona}`);

      // Clean the response - remove markdown formatting if present
      let cleaned = analysisText.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/```json\s*/, "").replace(/```\s*$/, "");
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/```\s*/, "").replace(/```\s*$/, "");
      }

      // Parse JSON array
      try {
        const buildingTypes = JSON.parse(cleaned);
        return Array.isArray(buildingTypes) ? buildingTypes : [];
      } catch (parseError) {
        console.error("Failed to parse building types JSON:", parseError);
        console.error("Cleaned building types content:", cleaned);
        return [];
      }
    } catch (error) {
      console.error(`Failed to extract building types: ${error}`);
      return [];
    }
  }

  async analyzeBuildingDetails(
    pdfText: string,
    codZona: string,
    buildingType: string,
    sourceUrl?: string,
  ): Promise<{
    pot: string;
    cut: string;
    suprafataMinima: string;
    distantaLimite: string;
    deschidereStrada: string;
  }> {
    if (!pdfText || !codZona || !buildingType) {
      return {
        pot: "??",
        cut: "??",
        suprafataMinima: "??",
        distantaLimite: "??",
        deschidereStrada: "??",
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OPENAI_API_KEY not set");
      return {
        pot: "??",
        cut: "??",
        suprafataMinima: "??",
        distantaLimite: "??",
        deschidereStrada: "??",
      };
    }

    try {
      console.log(
        `Analyzing building details for zone: ${codZona}, type: ${buildingType}`,
      );
      console.log(`PDF text length: ${pdfText.length} characters`);

      // RAG: index document (idempotent via deterministic IDs) if available
      if (this.ragService && sourceUrl) {
        try {
          await this.ragService.indexDocument({
            zoneCode: codZona,
            sourceUrl,
            fullText: pdfText,
          });
        } catch (e) {
          console.warn("RAG index failed, falling back to raw text:", e);
        }
      } else {
        console.log(
          "RAG disabled or missing sourceUrl; using fallback context",
        );
      }

      let contextText = "";
      if (this.ragService) {
        try {
          const retrieved = await this.ragService.retrieveContext({
            zoneCode: codZona,
            query: `zona ${codZona}; tip constructie: ${buildingType}; sinonime: locuinte individuale, locuințe individuale, locuinte unifamiliale, locuinte insiruite, locuinte izolata, locuinta; caut POT, P.O.T, procent ocupare teren, CUT, C.U.T, coeficient utilizare teren, suprafata minima parcela, suprafata minima lot, distanta la limite, retrageri, alinieri, deschidere la strada, front stradal`,
            limit: 30,
          });
          console.log(`RAG retrieved ${retrieved.length} chunks`);

          // Focus on chunks that mention the target fields
          const fieldKeywords: Record<string, string[]> = {
            pot: ["pot", "procent", "ocupare"],
            cut: ["cut", "coeficient", "utilizare"],
            suprafataMinima: ["supraf", "parcela", "lot"],
            distantaLimite: ["dist", "retrag", "aliniere"],
            deschidereStrada: ["deschidere", "front", "stradal"],
          };

          const hasNumberUnit = (text: string) => {
            const t = text.toLowerCase();
            return /\d/.test(t) && /(\%|mp\b|ml\b|m\b)/.test(t);
          };

          const focusChunks = retrieved.filter((c) => {
            const t = (c.chunk || "").toLowerCase();
            return (
              fieldKeywords.pot.some((k) => t.includes(k)) ||
              fieldKeywords.cut.some((k) => t.includes(k)) ||
              fieldKeywords.suprafataMinima.some((k) => t.includes(k)) ||
              fieldKeywords.distantaLimite.some((k) => t.includes(k)) ||
              fieldKeywords.deschidereStrada.some((k) => t.includes(k))
            );
          });

          const numericChunks = retrieved.filter((c) =>
            hasNumberUnit(c.chunk || ""),
          );

          const combined = [
            ...focusChunks,
            ...numericChunks.filter((c) => !focusChunks.includes(c)),
            ...retrieved,
          ];
          const seenRefs = new Set<string>();
          const dedup = combined.filter((c) => {
            const ref = `${c.start}:${c.end}`;
            if (seenRefs.has(ref)) return false;
            seenRefs.add(ref);
            return true;
          });

          const topFocus = dedup.slice(0, 40);
          contextText = topFocus.map((c) => c.chunk).join("\n---\n");
          console.log(
            `RAG focus chunks: ${topFocus.length} (from ${retrieved.length}), focus hits: ${focusChunks.length}, numeric hits: ${numericChunks.length}`,
          );
          topFocus.slice(0, 5).forEach((c, idx) => {
            const txt = (c.chunk || "").slice(0, 160).replace(/\s+/g, " ");
            console.log(
              ` [RAG][focus ${idx}] start=${c.start} end=${c.end} text=${txt}`,
            );
          });
        } catch (e) {
          console.warn(
            "RAG retrieval failed, falling back to truncated text:",
            e,
          );
        }
      }

      // Fallback to truncated PDF if no context from RAG
      if (!contextText) {
        const truncatedText = pdfText.substring(0, 20000);
        console.log(
          `Using fallback truncated text length: ${truncatedText.length} characters`,
        );
        contextText = truncatedText;
      }

      // Add a local keyword window around the first occurrence of zone code to boost relevance
      const zoneIndex = pdfText.toLowerCase().indexOf(codZona.toLowerCase());
      if (zoneIndex >= 0) {
        const window = 2000;
        const start = Math.max(0, zoneIndex - window);
        const end = Math.min(pdfText.length, zoneIndex + window);
        const snippet = pdfText.slice(start, end);
        contextText += `\n---\n[snippet-${codZona}]:\n${snippet}`;
        console.log(
          `Appended zone snippet around index ${zoneIndex} (len=${snippet.length})`,
        );
      }

      // Add keyword-based snippets for POT/CUT/retrageri/front stradal
      const keywords = [
        "pot",
        "cut",
        "procent",
        "coeficient",
        "retrag",
        "distanta",
        "distanțe",
        "aliniere",
        "deschidere",
        "front",
        "parcela",
        "lot",
      ];
      const lower = pdfText.toLowerCase();
      const snippets: string[] = [];
      const seen = new Set<number>();
      const windowSize = 500;
      for (const kw of keywords) {
        let idx = lower.indexOf(kw);
        let safety = 0;
        while (idx !== -1 && safety < 5) {
          if (!Array.from(seen).some((i) => Math.abs(i - idx) < 200)) {
            seen.add(idx);
            const start = Math.max(0, idx - windowSize);
            const end = Math.min(pdfText.length, idx + windowSize);
            snippets.push(pdfText.slice(start, end));
          }
          idx = lower.indexOf(kw, idx + kw.length);
          safety++;
          if (snippets.length >= 8) break;
        }
        if (snippets.length >= 8) break;
      }
      if (snippets.length) {
        console.log(`[RAG] Added ${snippets.length} keyword snippets`);
        contextText += `\n---\n[keyword-snippets]:\n${snippets.join("\n---\n")}`;
      }

      const prompt = `Analizează contextul de mai jos (extras din regulamentul zonei "${codZona}") și extrage informațiile SPECIFICE pentru construcțiile de tip "${buildingType}".

Context relevant:
${contextText}

Extrage următoarele informații SPECIFICE pentru "${buildingType}" în zona ${codZona}:
1. POT (Procent de Ocupare a Terenului)
2. CUT (Coeficient de Utilizare a Terenului)
3. Suprafața minimă de parcelă construibilă
4. Distanța față de limitele proprietății
5. Deschiderea minimă la stradă

Important:
- Returnează DOAR obiectul JSON valid, cu aceste 5 câmpuri exact
- Caută valori numerice și unități (%, mp, ml, m). Dacă sunt mai multe variante, alege valoarea maximă dacă e un plafon sau cea explicită pentru categoria respectivă.
- Dacă o informație nu există clar în regulament, folosește "??"
- Nu inventa valori; extrage doar ce este menționat în context

Răspunde DOAR cu un obiect JSON valid:
{
  "pot": "40%",
  "cut": "0.8",
  "suprafataMinima": "150mp",
  "distantaLimite": "3m",
  "deschidereStrada": "12m"
}`;

      console.log("Sending request to OpenAI...");

      const analysis = await this.callOpenAIWithRetry(prompt, 800);
      console.log(`Raw OpenAI response: "${analysis}"`);
      console.log(`Successfully analyzed building details for ${codZona}`);

      // Clean the response - remove markdown formatting if present
      let cleanedAnalysis = analysis.trim();
      console.log(`Cleaned analysis: "${cleanedAnalysis}"`);

      if (cleanedAnalysis.startsWith("```json")) {
        cleanedAnalysis = cleanedAnalysis
          .replace(/```json\s*/, "")
          .replace(/```\s*$/, "");
        console.log(`Removed markdown, final: "${cleanedAnalysis}"`);
      } else if (cleanedAnalysis.startsWith("```")) {
        cleanedAnalysis = cleanedAnalysis
          .replace(/```\s*/, "")
          .replace(/```\s*$/, "");
        console.log(`Removed simple markdown, final: "${cleanedAnalysis}"`);
      }

      // Parse JSON object
      try {
        const details = JSON.parse(cleanedAnalysis);
        console.log("Successfully parsed JSON:", details);
        return {
          pot: details.pot || "??",
          cut: details.cut || "??",
          suprafataMinima: details.suprafataMinima || "??",
          distantaLimite: details.distantaLimite || "??",
          deschidereStrada: details.deschidereStrada || "??",
        };
      } catch (parseError) {
        console.error("Failed to parse building details JSON:", parseError);
        console.error("Cleaned analysis content:", cleanedAnalysis);
        return {
          pot: "??",
          cut: "??",
          suprafataMinima: "??",
          distantaLimite: "??",
          deschidereStrada: "??",
        };
      }
    } catch (error) {
      console.error(`Failed to analyze building details: ${error}`);
      return {
        pot: "??",
        cut: "??",
        suprafataMinima: "??",
        distantaLimite: "??",
        deschidereStrada: "??",
      };
    }
  }

  async lookupAddressWithAnalysis(
    address: string,
  ): Promise<UrbanismLookupResult> {
    const result = await this.lookupAddress(address);

    for (const zone of result.zones) {
      if (zone.regulament && zone.cod_zona) {
        try {
          const pdfText = await this.downloadAndExtractPdfText(zone.regulament);
          if (pdfText) {
            // Extract building types and store them in a new field
            zone.buildingTypes = await this.extractBuildingTypes(
              pdfText,
              zone.cod_zona,
            );
          }
        } catch (error) {
          console.error(`Failed to analyze zone ${zone.cod_zona}: ${error}`);
          zone.buildingTypes = [];
        }
      }
    }

    return result;
  }
}

export const urbanismService = new UrbanismService();
