import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export interface City {
  id: string;
  name: string;
  county: string;
  requiresAuth: boolean;
  urbanismService: {
    baseUrl: string;
    searchUrl: string;
    featuresUrl: string;
    requiresAuth: boolean;
    customHeaders?: Record<string, string>;
  };
  coordinates: {
    epsg: string;
    defaultBuffer: number;
  };
}

export interface County {
  name: string;
  cities: City[];
}

export interface CitiesData {
  counties: County[];
}

class CitiesService {
  private citiesData: CitiesData | null = null;

  constructor() {
    this.loadCitiesData();
  }

  private loadCitiesData(): void {
    try {
      // Try multiple possible paths
      const possiblePaths = [
        join(__dirname, "..", "config", "cities.json"),
        join(process.cwd(), "src", "config", "cities.json"),
        join(process.cwd(), "dist", "config", "cities.json"),
        "src/config/cities.json",
        "./src/config/cities.json",
      ];

      let filePath = "";
      let fileContent = "";

      for (const path of possiblePaths) {
        try {
          console.log("Trying path:", path);
          fileContent = readFileSync(path, "utf8");
          // Remove BOM if present
          if (fileContent.charCodeAt(0) === 0xfeff) {
            fileContent = fileContent.slice(1);
          }
          filePath = path;
          console.log("Successfully loaded from:", path);
          break;
        } catch (e) {
          console.log("Failed to load from:", path, e);
          continue;
        }
      }

      if (!fileContent) {
        throw new Error("Could not find cities.json in any location");
      }

      this.citiesData = JSON.parse(fileContent) as CitiesData;
      console.log("Cities data loaded successfully from:", filePath);
      console.log("Counties loaded:", this.citiesData.counties.length);
    } catch (error) {
      console.error("Failed to load cities data:", error);
      this.citiesData = null;
    }
  }

  public getCounties(): County[] {
    return this.citiesData?.counties || [];
  }

  public getCitiesByCounty(countyName: string): City[] {
    const county = this.citiesData?.counties.find((c) => c.name === countyName);
    return county?.cities || [];
  }

  public getCityById(cityId: string): City | undefined {
    for (const county of this.citiesData?.counties || []) {
      const city = county.cities.find((c) => c.id === cityId);
      if (city) return city;
    }
    return undefined;
  }

  public getAllCounties(): string[] {
    return this.citiesData?.counties.map((c) => c.name) || [];
  }

  public getAllCities(): City[] {
    const allCities: City[] = [];
    for (const county of this.citiesData?.counties || []) {
      allCities.push(...county.cities);
    }
    return allCities;
  }
}

export const citiesService = new CitiesService();
