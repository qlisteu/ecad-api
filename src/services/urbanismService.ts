import axios from 'axios';

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
}

export interface UrbanismLookupResult {
  address: string;
  searchResults: AddressSearchResult[];
  selectedAddress: AddressSearchResult | null;
  point: { x: number; y: number } | null;
  zones: ZoneInfo[];
}

export class UrbanismService {
  private readonly baseUrl = 'https://urbanism.pmb.ro/xportalurb';
  private cookieJar: string[] = [];
  private sessionInitialized = false;

  private updateCookies(response: Response): void {
    const cookies = response.headers.get('set-cookie');
    if (cookies) {
      const newCookies = cookies.split(',').map((c) => c.split(';')[0].trim());
      this.cookieJar.push(...newCookies);
      console.log(`Updated cookie jar with ${newCookies.length} cookies`);
    }
  }

  private getCookieHeader(): string {
    return this.cookieJar.join('; ');
  }

  async initializeSession(): Promise<void> {
    if (this.sessionInitialized) {
      console.log('Session already initialized, skipping...');
      return;
    }

    const urls = ['https://urbanism.pmb.ro/', `${this.baseUrl}/`, `${this.baseUrl}/Map`];

    for (const url of urls) {
      try {
        console.log(`Trying to initialize session with URL: ${url}`);
        const headers: Record<string, string> = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9,ro;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
        };

        const response = await fetch(url, { headers });
        console.log(
          `Session initialization response status: ${response.status} ${response.statusText}`,
        );

        this.updateCookies(response);

        if (response.ok) {
          this.sessionInitialized = true;
          console.log('Session initialized successfully');
          return;
        }
      } catch (error) {
        console.warn(`Failed to initialize session with ${url}: ${error}`);
        continue;
      }
    }

    console.error('Failed to initialize session with all URLs');
  }

  async searchAddress(address: string, retryCount: number = 0): Promise<AddressSearchResult[]> {
    console.log('Starting address search...');
    const encodedAddress = encodeURIComponent(address);
    const url = `${this.baseUrl}/Map/MapSearch?searchText=${encodedAddress}&idMap=2&idMapSearch=%5B3%2C4%5D&filter%5Bfilters%5D%5B0%5D%5Bvalue%5D=${encodedAddress}&filter%5Bfilters%5D%5B0%5D%5Bfield%5D=Name&filter%5Bfilters%5D%5B0%5D%5Boperator%5D=contains&filter%5Bfilters%5D%5B0%5D%5BignoreCase%5D=true&filter%5Blogic%5D=and`;

    console.log(`Searching address with URL: ${url}`);

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9,ro-RO;q=0.8,ro;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      Connection: 'keep-alive',
      Referer: 'https://urbanism.pmb.ro/xportalurb/general/xpsw.js',
      'x-app': '6',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    console.log('Making fetch request...');
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

    const contentType = response.headers.get('content-type');
    console.log(`Response content-type: ${contentType}`);

    if (!contentType || (contentType && !contentType.includes('application/json'))) {
      const text = await response.text();
      console.error(
        `Expected JSON but got ${contentType}. Response body: ${text.substring(0, 500)}`,
      );

      if (contentType && contentType.includes('text/html') && text.includes('UrbOnLine')) {
        if (retryCount < 2) {
          console.log('Got UrbOnLine page, trying to initialize session...');
          await this.initializeSession();
          return this.searchAddress(address, retryCount + 1);
        } else {
          console.error('Max retries reached for UrbOnLine page');
        }
      }

      throw new Error(`Expected JSON response but got ${contentType}`);
    }

    const data = await response.json() as any;
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
    console.log('Fetching features...');
    const url = `${this.baseUrl}/map/getfeature?layer=8&srs=EPSG:3844&bbox=${bbox}&idMap=1`;

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9,ro-RO;q=0.8,ro;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      Connection: 'keep-alive',
      Referer: 'https://urbanism.pmb.ro/xportalurb/general/xpsw.js',
      'x-app': '6',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };

    const cookieHeader = this.getCookieHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    const response = await fetch(url, { headers });
    console.log(`Features response status: ${response.status} ${response.statusText}`);

    this.updateCookies(response);

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `Feature fetch failed. Status: ${response.status}. Response body: ${text.substring(0, 500)}`,
      );
      throw new Error(`Feature fetch failed: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    console.log(`Features response content-type: ${contentType}`);

    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(
        `Expected JSON but got ${contentType}. Response body: ${text.substring(0, 500)}`,
      );
      throw new Error(`Expected JSON response but got ${contentType}`);
    }

    const data = await response.json() as any;
    console.log(`Successfully parsed features JSON with ${data?.features?.length || 0} features`);
    return data;
  }

  pointInRing(point: { x: number; y: number }, ring: [number, number][]): boolean {
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

  pointInPolygon(point: { x: number; y: number }, coords: number[][][]): boolean {
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

  findZonesForPoint(point: { x: number; y: number }, featureCollection: any): ZoneInfo[] {
    const zones: ZoneInfo[] = [];

    for (const feature of featureCollection.features || []) {
      const geom = feature.geometry;
      if (!geom || geom.type !== 'Polygon') {
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
      console.log('No cookies found, initializing session...');
      await this.initializeSession();
    }

    console.log('Step 1: Searching address...');
    const searchResults = await this.searchAddress(address);
    console.log('Search results found:', searchResults.length);

    if (searchResults.length === 0) {
      console.log('No search results found, returning empty result');
      return {
        address,
        searchResults: [],
        selectedAddress: null,
        point: null,
        zones: [],
      };
    }

    console.log('Step 2: Parsing WKT point...');
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

    console.log('Step 3: Calculating bbox and fetching features...');
    const bbox = this.calculateBbox(point);
    console.log('Calculated bbox:', bbox);
    
    const featureCollection = await this.getFeatures(bbox);
    console.log('Features fetched');

    console.log('Step 4: Finding zones for point...');
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
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(Buffer.from(response.data));

      console.log(`Extracted ${pdfData.text.length} characters from PDF`);
      return pdfData.text;
    } catch (error) {
      console.error(`Failed to download/parse PDF: ${error}`);
      return '';
    }
  }

  async analyzeZoneRegulations(pdfText: string, codZona: string): Promise<string> {
    if (!pdfText || !codZona) {
      return '';
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY not set');
      return '';
    }

    try {
      console.log(`Analyzing regulations for zone: ${codZona}`);

      const truncatedText = pdfText.substring(0, 15000);

      const prompt = `Analizează următorul regulament de urbanism și extrage TOATE informațiile specifice pentru zona "${codZona}".

Regulament:
${truncatedText}

Te rog să extragi și să formatezi clar:
1. Utilizări admise (ce se poate construi)
2. Utilizări interzise (ce NU se poate construi)
3. Condiții de amplasare și conformare a clădirilor
4. Reguli pentru parcele (dimensiuni minime, forme)
5. Reguli pentru spații verzi și împrejmuiri
6. Orice alte restricții sau cerințe specifice pentru zona ${codZona}

Răspunde în română, concis și structurat.`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'Ești un expert în urbanism și reglementări de construcții din România.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const analysis = response.data.choices[0].message.content;
      console.log(`Successfully analyzed regulations for ${codZona}`);
      return analysis;
    } catch (error) {
      console.error(`Failed to analyze regulations: ${error}`);
      return '';
    }
  }

  async lookupAddressWithAnalysis(address: string): Promise<UrbanismLookupResult> {
    const result = await this.lookupAddress(address);

    for (const zone of result.zones) {
      if (zone.regulament && zone.cod_zona) {
        try {
          const pdfText = await this.downloadAndExtractPdfText(zone.regulament);
          if (pdfText) {
            zone.regulamentAnalysis = await this.analyzeZoneRegulations(pdfText, zone.cod_zona);
          }
        } catch (error) {
          console.error(`Failed to analyze zone ${zone.cod_zona}: ${error}`);
        }
      }
    }

    return result;
  }
}

export const urbanismService = new UrbanismService();
