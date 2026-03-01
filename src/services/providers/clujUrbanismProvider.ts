import { City } from "../citiesService";
import {
  AddressSearchResult,
  UrbanismLookupResult,
  ZoneInfo,
} from "../urbanismService";
import { UrbanismProvider } from "./urbanismProvider";

interface GeocodeCandidate {
  location: { x: number; y: number; spatialReference?: { wkid?: number } };
  address: string;
  attributes?: Record<string, any>;
}

export class ClujUrbanismProvider implements UrbanismProvider {
  private readonly geocodeUrl =
    "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
  private readonly regulationUrl =
    "https://gis.primariaclujnapoca.ro/Public/pageForRequest/getXMLContent.jsp";
  private readonly regulationCache: Map<string, string> = new Map();

  private getIdentifyUrl(city: City): string {
    if (!city.arcgis?.identifyUrl) {
      throw new Error("Cluj identifyUrl missing in city configuration");
    }
    return city.arcgis.identifyUrl;
  }

  private async geocode(
    address: string,
    city: City,
  ): Promise<GeocodeCandidate | null> {
    const buildParams = (
      singleLine: string,
      opts?: { withLocation?: boolean; withExtent?: boolean; withCategory?: boolean },
    ) => {
      const withLocation = opts?.withLocation ?? true;
      const withExtent = opts?.withExtent ?? true;
      const withCategory = opts?.withCategory ?? true;

      const params = new URLSearchParams({
        SingleLine: singleLine,
        f: "json",
        outSR: JSON.stringify({ wkid: city.arcgis?.spatialReference ?? 31700 }),
        outFields: "Addr_type,Match_addr,StAddr,City",
        maxLocations: "10",
        countryCode: "RO",
      });

      if (withCategory) {
        params.set("category", "Address,Street Address");
      }

      if (withLocation && city.arcgis?.location) {
        params.set(
          "location",
          JSON.stringify({
            x: city.arcgis.location.x,
            y: city.arcgis.location.y,
            spatialReference: {
              wkid: city.arcgis.location.spatialReference ?? 31700,
            },
          }),
        );
      }

      if (withExtent && city.arcgis?.searchExtent) {
        params.set("searchExtent", JSON.stringify(city.arcgis.searchExtent));
      }

      return params;
    };

    const runGeocode = async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `Cluj geocode failed: ${response.status} ${response.statusText} body=${text.slice(0, 200)}`,
        );
      }
      const data = (await response.json()) as any;
      const cands: GeocodeCandidate[] = data?.candidates || [];
      console.log(`[CLUJ][geocode] candidates=${cands.length}`);
      return cands;
    };

    const queries = [
      address,
      `${address}, Cluj-Napoca`,
      `${address}, Cluj-Napoca, România`,
      `Strada ${address}, Cluj-Napoca`,
    ];

    const dedupedQueries = [...new Set(queries.map((q) => q.trim()))].filter(
      (q) => q.length > 0,
    );

    let candidates: GeocodeCandidate[] = [];
    const allCandidates: GeocodeCandidate[] = [];
    for (const q of dedupedQueries) {
      const strictParams = buildParams(q, {
        withLocation: true,
        withExtent: true,
        withCategory: true,
      });
      candidates = await runGeocode(`${this.geocodeUrl}?${strictParams.toString()}`);
      if (candidates.length) {
        allCandidates.push(...candidates);
      }

      const relaxedParams = buildParams(q, {
        withLocation: false,
        withExtent: false,
        withCategory: true,
      });
      candidates = await runGeocode(
        `${this.geocodeUrl}?${relaxedParams.toString()}`,
      );
      if (candidates.length) {
        allCandidates.push(...candidates);
      }

      const broadParams = buildParams(q, {
        withLocation: false,
        withExtent: false,
        withCategory: false,
      });
      candidates = await runGeocode(`${this.geocodeUrl}?${broadParams.toString()}`);
      if (candidates.length) {
        allCandidates.push(...candidates);
      }
    }

    if (!allCandidates.length) {
      return null;
    }
    candidates = allCandidates;

    const inExtent = (c: GeocodeCandidate, margin: number = 0): boolean => {
      const ext = city.arcgis?.searchExtent;
      if (!ext) return true;
      const { x, y } = c.location;
      return (
        x >= ext.xmin - margin &&
        x <= ext.xmax + margin &&
        y >= ext.ymin - margin &&
        y <= ext.ymax + margin
      );
    };

    const inCityStrict = (c: GeocodeCandidate): boolean => {
      const cityName = (c.attributes?.City || c.address || "").toLowerCase();
      return cityName.includes("cluj-napoca");
    };

    const inCityLoose = (c: GeocodeCandidate): boolean => {
      const cityName = (c.attributes?.City || c.address || "").toLowerCase();
      return cityName.includes("cluj-napoca") || cityName.includes("cluj");
    };

    const inputTokens = address
      .toLowerCase()
      .split(/[^a-zA-Z0-9ăâîșşțţ]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);

    const hasInputToken = (c: GeocodeCandidate): boolean => {
      const hay = `${c.address || ""} ${c.attributes?.City || ""}`.toLowerCase();
      return inputTokens.some((token) => hay.includes(token));
    };

    const normalized = candidates.filter((c) => c?.location?.x && c?.location?.y);
    const uniqueCandidates = Array.from(
      new Map(
        normalized.map((c) => [`${c.location.x}|${c.location.y}|${c.address}`, c]),
      ).values(),
    );

    const candidateScore = (c: GeocodeCandidate): number => {
      let score = 0;
      const geocodeScore = Number((c as any).score || 0);
      score += geocodeScore;
      if (inCityStrict(c)) score += 300;
      else if (inCityLoose(c)) score += 180;
      if (inExtent(c)) score += 120;
      else if (inExtent(c, 1500)) score += 50;
      if (hasInputToken(c)) score += 220;
      if (!/strada|calea|bd\.?|bulevard|aleea/i.test(c.address || "")) score -= 20;
      return score;
    };

    uniqueCandidates.sort((a, b) => candidateScore(b) - candidateScore(a));
    if (uniqueCandidates.length) {
      return uniqueCandidates[0];
    }

    console.warn(`[CLUJ][geocode] no candidate matched filters`);
    return null;
  }

  private cleanValue(value: any): string | null {
    if (value === undefined || value === null) return null;
    const asString = String(value).trim();
    if (!asString || asString.toLowerCase() === "null") return null;
    return asString;
  }

  private normalizeRegulationText(xml: string): string {
    return xml
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractIndicatorsFromRegulationText(
    regulationText: string,
  ): Pick<ZoneInfo, "pot" | "cut" | "hmax" | "hrmax"> {
    const result: Pick<ZoneInfo, "pot" | "cut" | "hmax" | "hrmax"> = {
      pot: null,
      cut: null,
      hmax: null,
      hrmax: null,
    };

    const potMatch = regulationText.match(
      /P\.?\s*O\.?\s*T\.?\s*maxim\s*=?\s*([0-9]+(?:[.,][0-9]+)?\s*%?)/i,
    );
    if (potMatch) {
      result.pot = potMatch[1].trim();
    }

    const cutMatch = regulationText.match(
      /C\.?\s*U\.?\s*T\.?\s*maxim\s*=?\s*([0-9]+(?:[.,][0-9]+)?)/i,
    );
    if (cutMatch) {
      result.cut = cutMatch[1].trim();
    }

    const heightMatches = Array.from(
      regulationText.matchAll(
        /[IiÎî]n[aă]l[țt]imea[^.]{0,160}?nu va dep[aă][șs]i\s*([0-9]+(?:[.,][0-9]+)?\s*m)/gi,
      ),
    );
    if (heightMatches[0]?.[1]) {
      result.hmax = heightMatches[0][1].trim();
    }
    if (heightMatches[1]?.[1]) {
      result.hrmax = heightMatches[1][1].trim();
    }

    return result;
  }

  private async getRegulationTextByUtr(utr: string): Promise<string | null> {
    const utrKey = utr.toLowerCase();
    const cached = this.regulationCache.get(utrKey);
    if (cached !== undefined) {
      return cached;
    }

    const params = new URLSearchParams({
      msg: "getXMLContentTOTAL",
      idStrat: "0",
      den_strat: "null",
      den_regulament: utrKey,
    });

    const url = `${this.regulationUrl}?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        Accept: "text/xml,application/xml,text/plain,*/*",
        Referer: "https://gis.primariaclujnapoca.ro/Public/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
      },
    });

    if (!response.ok) {
      this.regulationCache.set(utrKey, "");
      return null;
    }

    const xml = await response.text();
    const text = this.normalizeRegulationText(xml);
    this.regulationCache.set(utrKey, text);
    return text || null;
  }

  private buildMapExtent(x: number, y: number, buffer: number): string {
    const minX = x - buffer;
    const minY = y - buffer;
    const maxX = x + buffer;
    const maxY = y + buffer;
    return `${minX},${minY},${maxX},${maxY}`;
  }

  private async identify(
    city: City,
    point: { x: number; y: number },
  ): Promise<ZoneInfo[]> {
    const tolerance = city.arcgis?.tolerance ?? 1;
    const layerId = city.arcgis?.layerId ?? 11;
    const layerDefs = city.arcgis?.layerDefs;
    const imageDisplay = city.arcgis?.imageDisplay ?? "400,400,96";

    const params = new URLSearchParams({
      f: "json",
      tolerance: `${tolerance}`,
      returnGeometry: "true",
      returnFieldName: "false",
      returnUnformattedValues: "false",
      imageDisplay,
      geometry: JSON.stringify({
        x: point.x,
        y: point.y,
        spatialReference: { wkid: city.arcgis?.spatialReference ?? 31700 },
      }),
      geometryType: "esriGeometryPoint",
      sr: `${city.arcgis?.spatialReference ?? 31700}`,
      mapExtent: this.buildMapExtent(
        point.x,
        point.y,
        city.coordinates.defaultBuffer,
      ),
      layers: `all:${layerId}`,
    });

    if (layerDefs && Object.keys(layerDefs).length > 0) {
      params.set("layerDefs", JSON.stringify(layerDefs));
    }

    const identifyUrl = this.getIdentifyUrl(city);
    const fullUrl = `${identifyUrl}?${params.toString()}`;
    const response = await fetch(fullUrl, {
      headers: {
        Accept: "application/json",
        Referer: "https://gis.primariaclujnapoca.ro/Public/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Cluj identify failed: ${response.status} ${response.statusText} url=${fullUrl} body=${text.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as any;
    const results = data?.results || [];

    if (!results.length) {
      return [];
    }

    const mapped = await Promise.all(
      results.map(async (r: any) => {
        const props = r.attributes || {};
        const pot = this.cleanValue(props.introRT_potcut);
        const cut = this.cleanValue(props.cut);
        const hmax = this.cleanValue(props.hmax ?? props.HMAX);
        const hrmax = this.cleanValue(props.hrmax ?? props.HRMAX);
        const definitie = this.cleanValue(props.UTR_afisare || props.obs);

        const utrCode = this.cleanValue(
          props.utr || props.utr_pug || props.utr_puz || props.utr_pud || props.tip,
        );
        const regulationText = utrCode
          ? await this.getRegulationTextByUtr(utrCode)
          : null;
        const regulationUrl = utrCode
          ? `${this.regulationUrl}?msg=getXMLContentTOTAL&idStrat=0&den_strat=null&den_regulament=${encodeURIComponent(utrCode.toLowerCase())}`
          : null;
        const extracted = regulationText
          ? this.extractIndicatorsFromRegulationText(regulationText)
          : { pot: null, cut: null, hmax: null, hrmax: null };

        return {
          feature_id: String(props.OBJECTID ?? r.layerId ?? ""),
          zona: props.utr_pug || props.utr_puz || props.utr || props.UTR_afisare || null,
          subzona: props.tip || null,
          cod_zona: props.utr || props.utr_pug || props.utr_puz || null,
          definitie: definitie,
          pot: pot || extracted.pot,
          cut: cut || extracted.cut,
          hmax: hmax || extracted.hmax,
          hrmax: hrmax || extracted.hrmax,
          regulament: regulationUrl || props.doc_urb || null,
          regulamentAnalysis: regulationText || null,
        } as ZoneInfo;
      }),
    );

    return mapped;
  }

  async lookupAddress(
    city: City,
    address: string,
  ): Promise<UrbanismLookupResult> {
    const geocoded = await this.geocode(address, city);
    if (!geocoded) {
      return {
        address,
        searchResults: [],
        selectedAddress: null,
        point: null,
        zones: [],
      };
    }

    const point = {
      x: geocoded.location.x,
      y: geocoded.location.y,
    };

    const searchResults: AddressSearchResult[] = [
      {
        IdMapSearch: geocoded.attributes?.ResultID || geocoded.address,
        Name: geocoded.address,
        IconClass: "default",
        Wkt: `POINT (${point.x} ${point.y})`,
        DataSourceName: city.id,
      },
    ];

    const zones = await this.identify(city, point);

    return {
      address,
      searchResults,
      selectedAddress: searchResults[0],
      point,
      zones,
    };
  }
}
