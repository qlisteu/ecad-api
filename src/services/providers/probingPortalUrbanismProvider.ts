import { City } from "../citiesService";
import {
  AddressSearchResult,
  UrbanismLookupResult,
  ZoneInfo,
} from "../urbanismService";
import { UrbanismProvider } from "./urbanismProvider";

type SearchPlan = {
  method: "GET" | "POST";
  pathTemplate: string;
  payloadKey?: "term" | "address" | "query";
};

type FeaturePlan = {
  pathTemplate: string;
};

export type PortalProbeProviderOptions = {
  getSearchCandidates: (city: City) => SearchPlan[];
  getFeatureCandidates: (city: City) => FeaturePlan[];
};

export class ProbingPortalUrbanismProvider implements UrbanismProvider {
  private readonly cookieJars: Map<string, string[]> = new Map();
  private readonly sessionInitialized: Map<string, boolean> = new Map();
  private readonly detectedSearchPlans: Map<string, SearchPlan> = new Map();
  private readonly detectedFeaturePlans: Map<string, FeaturePlan> = new Map();

  constructor(private readonly options: PortalProbeProviderOptions) {}

  async lookupAddress(city: City, address: string): Promise<UrbanismLookupResult> {
    await this.initializeSession(city);

    const searchData = await this.detectSearch(city, address);
    const searchResults = this.normalizeSearchResults(searchData, city.id);
    if (!searchResults.length) {
      return {
        address,
        searchResults: [],
        selectedAddress: null,
        point: null,
        zones: [],
      };
    }

    const selectedAddress = searchResults[0];
    const point = this.parseWktPoint(selectedAddress.Wkt);
    if (!point) {
      return {
        address,
        searchResults,
        selectedAddress,
        point: null,
        zones: [],
      };
    }

    const bbox = this.calculateBbox(point, city.coordinates.defaultBuffer, city);
    const featureData = await this.detectFeatures(city, bbox);
    const zones = this.findZonesForPoint(
      point,
      this.normalizeFeatureCollection(featureData),
    );

    return {
      address,
      searchResults,
      selectedAddress,
      point,
      zones,
    };
  }

  private updateCookies(cityId: string, response: Response): void {
    const cookies = response.headers.get("set-cookie");
    if (!cookies) {
      return;
    }

    const newCookies = cookies.split(",").map((c) => c.split(";")[0].trim());
    const existingCookies = this.cookieJars.get(cityId) || [];
    this.cookieJars.set(cityId, [...existingCookies, ...newCookies]);
  }

  private getCookieHeader(cityId: string): string {
    const cookies = this.cookieJars.get(cityId) || [];
    return cookies.join("; ");
  }

  private async initializeSession(city: City): Promise<void> {
    if (this.sessionInitialized.get(city.id)) {
      return;
    }

    if (!city.urbanismService.requiresAuth) {
      this.sessionInitialized.set(city.id, true);
      return;
    }

    const urls = [
      city.urbanismService.baseUrl,
      `${city.urbanismService.baseUrl}/`,
      `${city.urbanismService.baseUrl}/Map`,
    ];

    for (const url of urls) {
      try {
        const headers: Record<string, string> = {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
          "Accept-Language": "en-US,en;q=0.9,ro;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          ...city.urbanismService.customHeaders,
        };
        const response = await fetch(url, { headers });
        this.updateCookies(city.id, response);
        if (response.ok) {
          this.sessionInitialized.set(city.id, true);
          return;
        }
      } catch (_err) {
        // Keep trying fallback URLs.
      }
    }
  }

  private buildHeaders(
    city: City,
    method: "GET" | "POST",
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...city.urbanismService.customHeaders,
    };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
    }
    const cookieHeader = this.getCookieHeader(city.id);
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }
    return headers;
  }

  private async executeSearchPlan(
    city: City,
    address: string,
    plan: SearchPlan,
  ): Promise<{ ok: boolean; data?: any; reason?: string }> {
    const path = plan.pathTemplate.replace("{address}", encodeURIComponent(address));
    const url = `${city.urbanismService.baseUrl}${path}`;
    const headers = this.buildHeaders(city, plan.method);

    const init: RequestInit = {
      method: plan.method,
      headers,
    };
    if (plan.method === "POST" && plan.payloadKey) {
      init.body = JSON.stringify({ [plan.payloadKey]: address });
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error: any) {
      return { ok: false, reason: `network: ${error?.message || String(error)}` };
    }

    this.updateCookies(city.id, response);
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, reason: `status=${response.status} ${text.slice(0, 140)}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return {
        ok: false,
        reason: `non-json ${contentType} ${text.slice(0, 140)}`,
      };
    }

    try {
      const data = await response.json();
      return { ok: true, data };
    } catch (error: any) {
      return { ok: false, reason: `invalid-json ${error?.message || String(error)}` };
    }
  }

  private async detectSearch(city: City, address: string): Promise<any> {
    const cached = this.detectedSearchPlans.get(city.id);
    if (cached) {
      const cachedResult = await this.executeSearchPlan(city, address, cached);
      if (cachedResult.ok) {
        return cachedResult.data;
      }
    }

    let lastReason = "no candidate worked";
    for (const candidate of this.options.getSearchCandidates(city)) {
      const result = await this.executeSearchPlan(city, address, candidate);
      if (result.ok) {
        this.detectedSearchPlans.set(city.id, candidate);
        return result.data;
      }
      lastReason = result.reason || lastReason;
    }
    throw new Error(`${city.id}: search detection failed (${lastReason})`);
  }

  private async executeFeaturePlan(
    city: City,
    bbox: string,
    plan: FeaturePlan,
  ): Promise<{ ok: boolean; data?: any; reason?: string }> {
    const path = plan.pathTemplate.replace("{bbox}", bbox);
    const url = `${city.urbanismService.baseUrl}${path}`;
    const headers = this.buildHeaders(city, "GET");

    let response: Response;
    try {
      response = await fetch(url, { method: "GET", headers });
    } catch (error: any) {
      return { ok: false, reason: `network: ${error?.message || String(error)}` };
    }

    this.updateCookies(city.id, response);
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, reason: `status=${response.status} ${text.slice(0, 140)}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return {
        ok: false,
        reason: `non-json ${contentType} ${text.slice(0, 140)}`,
      };
    }

    try {
      const data = await response.json();
      return { ok: true, data };
    } catch (error: any) {
      return { ok: false, reason: `invalid-json ${error?.message || String(error)}` };
    }
  }

  private async detectFeatures(city: City, bbox: string): Promise<any> {
    const cached = this.detectedFeaturePlans.get(city.id);
    if (cached) {
      const cachedResult = await this.executeFeaturePlan(city, bbox, cached);
      if (cachedResult.ok) {
        return cachedResult.data;
      }
    }

    let lastReason = "no candidate worked";
    for (const candidate of this.options.getFeatureCandidates(city)) {
      const result = await this.executeFeaturePlan(city, bbox, candidate);
      if (result.ok) {
        this.detectedFeaturePlans.set(city.id, candidate);
        return result.data;
      }
      lastReason = result.reason || lastReason;
    }
    throw new Error(`${city.id}: features detection failed (${lastReason})`);
  }

  private normalizeSearchResults(data: any, cityId: string): AddressSearchResult[] {
    if (Array.isArray(data)) {
      return data.map((item) => ({
        IdMapSearch:
          item.IdMapSearch || item.id || item.Id || item.objectId || "unknown",
        Name:
          item.Name ||
          item.name ||
          item.displayName ||
          item.address ||
          item.label ||
          "Unknown",
        IconClass: item.IconClass || item.icon || "default",
        Wkt: this.resolveWkt(item),
        DataSourceName: item.DataSourceName || item.source || cityId,
      }));
    }

    if (data?.results && Array.isArray(data.results)) {
      return this.normalizeSearchResults(data.results, cityId);
    }

    if (data?.features && Array.isArray(data.features)) {
      return data.features.map((feature: any) => ({
        IdMapSearch: feature.id || feature.properties?.id || "unknown",
        Name:
          feature.properties?.name ||
          feature.properties?.Name ||
          feature.properties?.displayName ||
          feature.properties?.address ||
          "Unknown",
        IconClass: feature.properties?.icon || "default",
        Wkt: feature.geometry ? this.geometryToWkt(feature.geometry) : "",
        DataSourceName: cityId,
      }));
    }

    return [];
  }

  private resolveWkt(item: any): string {
    if (item.Wkt || item.wkt) {
      return item.Wkt || item.wkt;
    }
    if (typeof item.geometry === "string") {
      return item.geometry;
    }
    if (item.geometry && typeof item.geometry === "object") {
      return this.geometryToWkt(item.geometry);
    }

    const x = this.toNumber(item.x ?? item.X ?? item.lon ?? item.lng);
    const y = this.toNumber(item.y ?? item.Y ?? item.lat);
    if (x !== null && y !== null) {
      return `POINT (${x} ${y})`;
    }
    return "";
  }

  private toNumber(value: any): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private geometryToWkt(geometry: any): string {
    if (geometry.type === "Point") {
      const [x, y] = geometry.coordinates;
      return `POINT (${x} ${y})`;
    }
    if (geometry.type === "MultiPoint") {
      const points = geometry.coordinates
        .map(([x, y]: [number, number]) => `(${x} ${y})`)
        .join(",");
      return `MULTIPOINT (${points})`;
    }
    if (geometry.type === "Polygon") {
      const rings = (geometry.coordinates || [])
        .map(
          (ring: [number, number][]) =>
            `(${ring.map(([x, y]) => `${x} ${y}`).join(", ")})`,
        )
        .join(", ");
      return `POLYGON (${rings})`;
    }
    return "";
  }

  private parseWktPoint(wkt: string): { x: number; y: number } | null {
    if (!wkt || typeof wkt !== "string") {
      return null;
    }

    const match = wkt.match(/MULTIPOINT Z \(([-\d.]+)\s+([-\d.]+)\s+[\d.]+\)/);
    if (match) {
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    }

    const multiPointMatch = wkt.match(
      /MULTIPOINT\s*\(\s*\(?\s*([-\d.]+)\s+([-\d.]+)/i,
    );
    if (multiPointMatch) {
      return { x: parseFloat(multiPointMatch[1]), y: parseFloat(multiPointMatch[2]) };
    }

    const pointZMatch = wkt.match(
      /POINT\s+Z\s*\(([-\d.]+)\s+([-\d.]+)\s+[-\d.]+\)/i,
    );
    if (pointZMatch) {
      return { x: parseFloat(pointZMatch[1]), y: parseFloat(pointZMatch[2]) };
    }

    const pointMatch = wkt.match(/POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i);
    if (pointMatch) {
      return { x: parseFloat(pointMatch[1]), y: parseFloat(pointMatch[2]) };
    }

    return null;
  }

  private calculateBbox(
    point: { x: number; y: number },
    buffer: number,
    city: City,
  ): string {
    const minX = point.x - buffer;
    const minY = point.y - buffer;
    const maxX = point.x + buffer;
    const maxY = point.y + buffer;
    if ((city.coordinates?.epsg || "").toUpperCase() === "EPSG:4326") {
      return `${minX},${minY},${maxX},${maxY}`;
    }
    return `${minX},${minY},${maxX},${maxY},EPSG:3844`;
  }

  private normalizeFeatureCollection(data: any): any {
    if (!data) {
      return { type: "FeatureCollection", features: [] };
    }
    if (Array.isArray(data)) {
      return { type: "FeatureCollection", features: data };
    }
    if (Array.isArray(data.features)) {
      return data;
    }
    if (Array.isArray(data.results)) {
      return { type: "FeatureCollection", features: data.results };
    }
    return { type: "FeatureCollection", features: [] };
  }

  private pointInRing(point: { x: number; y: number }, ring: [number, number][]): boolean {
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

  private pointInPolygon(point: { x: number; y: number }, coords: number[][][]): boolean {
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

  private findZonesForPoint(point: { x: number; y: number }, featureCollection: any): ZoneInfo[] {
    const zones: ZoneInfo[] = [];
    for (const feature of featureCollection.features || []) {
      const geom = feature.geometry;
      if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) {
        continue;
      }

      const polygons =
        geom.type === "Polygon"
          ? [geom.coordinates]
          : Array.isArray(geom.coordinates)
            ? geom.coordinates
            : [];

      if (polygons.some((coords: number[][][]) => this.pointInPolygon(point, coords))) {
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
}
