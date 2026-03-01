import { City } from "../citiesService";
import { UrbanismLookupResult } from "../urbanismService";

export interface UrbanismProvider {
  lookupAddress(city: City, address: string): Promise<UrbanismLookupResult>;
}
