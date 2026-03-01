import { City } from "../citiesService";
import {
  PortalProbeProviderOptions,
  ProbingPortalUrbanismProvider,
} from "./probingPortalUrbanismProvider";

const bucharestOptions: PortalProbeProviderOptions = {
  getSearchCandidates: (city: City) => {
    const configuredSearchUrl = city.urbanismService.searchUrl || "";
    return [
      {
        method: "GET",
        pathTemplate:
          configuredSearchUrl ||
          "/Map/MapSearch?searchText={address}&idMap=2&idMapSearch=%5B3%2C4%5D&filter%5Bfilters%5D%5B0%5D%5Bvalue%5D={address}&filter%5Bfilters%5D%5B0%5D%5Bfield%5D=Name&filter%5Bfilters%5D%5B0%5D%5Boperator%5D=contains&filter%5Bfilters%5D%5B0%5D%5BignoreCase%5D=true&filter%5Blogic%5D=and",
      },
      {
        method: "GET",
        pathTemplate:
          "/Map/MapSearch?searchText={address}&idMap=2&idMapSearch=%5B3%2C4%5D&filter%5Bfilters%5D%5B0%5D%5Bvalue%5D={address}&filter%5Bfilters%5D%5B0%5D%5Bfield%5D=Name&filter%5Bfilters%5D%5B0%5D%5Boperator%5D=contains&filter%5Bfilters%5D%5B0%5D%5BignoreCase%5D=true&filter%5Blogic%5D=and",
      },
    ];
  },
  getFeatureCandidates: (city: City) => {
    const configuredFeaturesUrl = city.urbanismService.featuresUrl || "";
    return [
      {
        pathTemplate:
          configuredFeaturesUrl ||
          "/map/getfeature?layer=8&srs=EPSG:3844&bbox={bbox}&idMap=1",
      },
      {
        pathTemplate:
          "/map/getfeature?layer=8&srs=EPSG:3844&bbox={bbox}&idMap=1",
      },
    ];
  },
};

export class BucharestUrbanismProvider extends ProbingPortalUrbanismProvider {
  constructor() {
    super(bucharestOptions);
  }
}
