import { City } from "../citiesService";
import {
  PortalProbeProviderOptions,
  ProbingPortalUrbanismProvider,
} from "./probingPortalUrbanismProvider";

const timisoaraOptions: PortalProbeProviderOptions = {
  getSearchCandidates: (city: City) => {
    const configuredSearchUrl = city.urbanismService.searchUrl || "";
    return [
      {
        method: "GET",
        pathTemplate:
          configuredSearchUrl || "/api/v1/urbanism/search?term={address}",
      },
      { method: "GET", pathTemplate: "/api/v1/urbanism/search?term={address}" },
      {
        method: "GET",
        pathTemplate: "/api/v1/urbanism/search?address={address}",
      },
      {
        method: "GET",
        pathTemplate: "/api/v1/urbanism/search?query={address}",
      },
      {
        method: "GET",
        pathTemplate: "/api/urbanism/search?term={address}",
      },
      {
        method: "GET",
        pathTemplate: "/api/urbanism/search?address={address}",
      },
      {
        method: "GET",
        pathTemplate: "/api/urbanism/search?query={address}",
      },
      {
        method: "POST",
        pathTemplate: "/api/v1/urbanism/search",
        payloadKey: "term",
      },
      {
        method: "POST",
        pathTemplate: "/api/v1/urbanism/search",
        payloadKey: "address",
      },
      {
        method: "POST",
        pathTemplate: "/api/v1/urbanism/search",
        payloadKey: "query",
      },
      {
        method: "POST",
        pathTemplate: "/api/urbanism/search",
        payloadKey: "term",
      },
      {
        method: "POST",
        pathTemplate: "/api/urbanism/search",
        payloadKey: "address",
      },
      {
        method: "POST",
        pathTemplate: "/api/urbanism/search",
        payloadKey: "query",
      },
    ];
  },
  getFeatureCandidates: (city: City) => {
    const configuredFeaturesUrl = city.urbanismService.featuresUrl || "";
    return [
      {
        pathTemplate:
          configuredFeaturesUrl || "/api/v1/urbanism/zones?bbox={bbox}",
      },
      { pathTemplate: "/api/v1/urbanism/zones?bbox={bbox}" },
      { pathTemplate: "/api/urbanism/zones?bbox={bbox}" },
      { pathTemplate: "/api/v1/urbanism/features?bbox={bbox}" },
      { pathTemplate: "/api/urbanism/features?bbox={bbox}" },
    ];
  },
};

export class TimisoaraUrbanismProvider extends ProbingPortalUrbanismProvider {
  constructor() {
    super(timisoaraOptions);
  }
}
