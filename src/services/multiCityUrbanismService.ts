import { CityConfig, getCityConfig } from '../config/cities';
import { UrbanismLookupResult, AddressSearchResult, ZoneInfo } from './urbanismService';

export class MultiCityUrbanismService {
  private cookieJars: Map<string, string[]> = new Map();
  private sessionInitialized: Map<string, boolean> = new Map();

  private updateCookies(cityId: string, response: Response): void {
    const cookies = response.headers.get('set-cookie');
    if (cookies) {
      const newCookies = cookies.split(',').map((c) => c.split(';')[0].trim());
      const existingCookies = this.cookieJars.get(cityId) || [];
      this.cookieJars.set(cityId, [...existingCookies, ...newCookies]);
      console.log(`Updated ${cityId} cookie jar with ${newCookies.length} cookies`);
    }
  }

  private getCookieHeader(cityId: string): string {
    const cookies = this.cookieJars.get(cityId) || [];
    return cookies.join('; ');
  }

  async initializeSession(cityId: string, config: CityConfig): Promise<void> {
    if (this.sessionInitialized.get(cityId)) {
      console.log(`${cityId} session already initialized, skipping...`);
      return;
    }

    if (!config.urbanismService.requiresAuth) {
      console.log(`${cityId} does not require authentication`);
      this.sessionInitialized.set(cityId, true);
      return;
    }

    const urls = [
      config.urbanismService.baseUrl,
      `${config.urbanismService.baseUrl}/`,
      `${config.urbanismService.baseUrl}/Map`
    ];

    for (const url of urls) {
      try {
        console.log(`Trying to initialize ${cityId} session with URL: ${url}`);
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9,ro;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          ...config.urbanismService.customHeaders
        };

        const response = await fetch(url, { headers });
        console.log(`${cityId} session initialization response status: ${response.status} ${response.statusText}`);

        this.updateCookies(cityId, response);

        if (response.ok) {
          this.sessionInitialized.set(cityId, true);
          console.log(`${cityId} session initialized successfully`);
          return;
        }
      } catch (error) {
        console.warn(`Failed to initialize ${cityId} session with ${url}: ${error}`);
        continue;
      }
    }

    console.error(`Failed to initialize ${cityId} session with all URLs`);
  }

  async searchAddress(cityId: string, address: string, config: CityConfig, retryCount: number = 0): Promise<AddressSearchResult[]> {
    console.log(`Searching address in ${cityId}...`);
    
    const searchUrl = config.urbanismService.searchUrl
      .replace('{address}', encodeURIComponent(address));

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...config.urbanismService.customHeaders
    };

    const cookieHeader = this.getCookieHeader(cityId);
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    console.log(`Making search request to: ${config.urbanismService.baseUrl}${searchUrl}`);

    const response = await fetch(`${config.urbanismService.baseUrl}${searchUrl}`, { headers });
    console.log(`${cityId} search response status: ${response.status}`);

    this.updateCookies(cityId, response);

    if (!response.ok) {
      const text = await response.text();
      console.error(`${cityId} address search failed. Status: ${response.status}. Body: ${text.substring(0, 500)}`);
      
      // Try to initialize session and retry if it looks like a session issue
      if (text.includes('login') || text.includes('session') || text.includes('auth')) {
        if (retryCount < 2) {
          console.log(`${cityId} session issue detected, reinitializing...`);
          await this.initializeSession(cityId, config);
          return this.searchAddress(cityId, address, config, retryCount + 1);
        }
      }
      
      throw new Error(`${cityId} address search failed: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`${cityId} Expected JSON but got ${contentType}. Body: ${text.substring(0, 500)}`);
      throw new Error(`${cityId} Expected JSON response but got ${contentType}`);
    }

    const data = await response.json() as any;
    console.log(`${cityId} Successfully parsed search response with ${Array.isArray(data) ? data.length : 0} items`);
    
    // Normalize response format to match expected structure
    return this.normalizeSearchResults(data, cityId);
  }

  private normalizeSearchResults(data: any, cityId: string): AddressSearchResult[] {
    // Different cities might return data in different formats
    // This method normalizes them to the expected format
    
    if (Array.isArray(data)) {
      // If it's already an array, assume it's in the right format
      return data.map(item => ({
        IdMapSearch: item.IdMapSearch || item.id || item.Id,
        Name: item.Name || item.name || item.displayName,
        IconClass: item.IconClass || item.icon || 'default',
        Wkt: item.Wkt || item.geometry || item.wkt,
        DataSourceName: item.DataSourceName || item.source || cityId
      }));
    }
    
    // Handle other response formats
    if (data.results && Array.isArray(data.results)) {
      return this.normalizeSearchResults(data.results, cityId);
    }
    
    if (data.features && Array.isArray(data.features)) {
      return data.features.map((feature: any) => ({
        IdMapSearch: feature.id,
        Name: feature.properties?.name || feature.properties?.Name || feature.properties?.displayName || 'Unknown',
        IconClass: feature.properties?.icon || 'default',
        Wkt: feature.geometry ? this.geometryToWkt(feature.geometry) : '',
        DataSourceName: cityId
      }));
    }
    
    console.warn(`${cityId}: Unknown response format, returning empty array`);
    return [];
  }

  private geometryToWkt(geometry: any): string {
    // Convert GeoJSON geometry to WKT format
    if (geometry.type === 'Point') {
      const [x, y] = geometry.coordinates;
      return `POINT (${x} ${y})`;
    }
    if (geometry.type === 'MultiPoint') {
      const points = geometry.coordinates.map(([x, y]) => `(${x} ${y})`).join(',');
      return `MULTIPOINT (${points})`;
    }
    return '';
  }

  parseWktPoint(wkt: string): { x: number; y: number } | null {
    const match = wkt.match(/MULTIPOINT Z \(([-\d.]+)\s+([-\d.]+)\s+[\d.]+\)/);
    if (!match) {
      // Try regular point format
      const pointMatch = wkt.match(/POINT \(([-\d.]+)\s+([-\d.]+)\)/);
      if (pointMatch) {
        return {
          x: parseFloat(pointMatch[1]),
          y: parseFloat(pointMatch[2]),
        };
      }
      return null;
    }
    return {
      x: parseFloat(match[1]),
      y: parseFloat(match[2]),
    };
  }

  calculateBbox(point: { x: number; y: number }, buffer: number): string {
    const minX = point.x - buffer;
    const minY = point.y - buffer;
    const maxX = point.x + buffer;
    const maxY = point.y + buffer;
    return `${minX},${minY},${maxX},${maxY},EPSG:3844`;
  }

  async getFeatures(cityId: string, bbox: string, config: CityConfig): Promise<any> {
    console.log(`Fetching features for ${cityId}...`);
    
    const featuresUrl = config.urbanismService.featuresUrl
      .replace('{bbox}', bbox);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...config.urbanismService.customHeaders
    };

    const cookieHeader = this.getCookieHeader(cityId);
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    console.log(`Making features request to: ${config.urbanismService.baseUrl}${featuresUrl}`);

    const response = await fetch(`${config.urbanismService.baseUrl}${featuresUrl}`, { headers });
    console.log(`${cityId} features response status: ${response.status}`);

    this.updateCookies(cityId, response);

    if (!response.ok) {
      const text = await response.text();
      console.error(`${cityId} Feature fetch failed. Status: ${response.status}. Body: ${text.substring(0, 500)}`);
      throw new Error(`${cityId} Feature fetch failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    console.log(`${cityId} Successfully parsed features JSON with ${data?.features?.length || 0} features`);
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
          zona: props.zona || props.zone || props.ZONA,
          subzona: props.subzona || props.subzone || props.SUBZONA,
          cod_zona: props.cod_zona || props.zoneCode || props.COD_ZONA,
          definitie: props.definitie || props.definition || props.DEFINITIE,
          pot: props.pot || props.POT,
          cut: props.cut || props.CUT,
          hmax: props.hmax || props.HMAX,
          hrmax: props.hrmax || props.HRMAX,
          regulament: props.regulament || props.regulation || props.REGULAMENT,
        });
      }
    }

    return zones;
  }

  async lookupAddress(cityId: string, address: string): Promise<UrbanismLookupResult> {
    console.log(`Looking up address: ${address} in ${cityId}`);

    const config = getCityConfig(cityId);
    if (!config) {
      throw new Error(`City configuration not found for: ${cityId}`);
    }

    if (config.urbanismService.requiresAuth && !this.sessionInitialized.get(cityId)) {
      console.log(`No session found for ${cityId}, initializing...`);
      await this.initializeSession(cityId, config);
    }

    console.log(`Step 1: Searching address in ${cityId}...`);
    const searchResults = await this.searchAddress(cityId, address, config);
    console.log(`${cityId} Search results found:`, searchResults.length);

    if (searchResults.length === 0) {
      console.log(`No search results found for ${cityId}, returning empty result`);
      return {
        address,
        searchResults: [],
        selectedAddress: null,
        point: null,
        zones: [],
      };
    }

    console.log(`Step 2: Parsing WKT point for ${cityId}...`);
    const selectedAddress = searchResults[0];
    const point = this.parseWktPoint(selectedAddress.Wkt);

    if (!point) {
      console.warn(`${cityId}: Could not parse WKT point from: ${selectedAddress.Wkt}`);
      return {
        address,
        searchResults,
        selectedAddress,
        point: null,
        zones: [],
      };
    }

    console.log(`${cityId} Point (${config.coordinates.epsg}): ${point.x}, ${point.y}`);

    console.log(`Step 3: Calculating bbox and fetching features for ${cityId}...`);
    const bbox = this.calculateBbox(point, config.coordinates.defaultBuffer);
    console.log(`${cityId} Calculated bbox:`, bbox);
    
    const featureCollection = await this.getFeatures(cityId, bbox, config);
    console.log(`${cityId} Features fetched`);

    console.log(`Step 4: Finding zones for point in ${cityId}...`);
    const zones = this.findZonesForPoint(point, featureCollection);
    console.log(`${cityId} Found ${zones.length} zones for address: ${address}`);

    return {
      address,
      searchResults,
      selectedAddress,
      point,
      zones,
    };
  }
}

export const multiCityUrbanismService = new MultiCityUrbanismService();
