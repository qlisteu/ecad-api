import { Request, Response } from "express";
import { multiCityUrbanismService } from "../services/multiCityUrbanismService";
import { citiesService } from "../services/citiesService";

export class MultiCityUrbanismController {
  public lookupAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log("Multi-city request received:", req.body);

      const { address, cityId, includeAnalysis } = req.body;

      if (
        !address ||
        typeof address !== "string" ||
        address.trim().length === 0
      ) {
        console.log("Invalid address provided");
        res.status(400).json({ error: "Address is required" });
        return;
      }

      if (!cityId || typeof cityId !== "string") {
        console.log("City ID is required");
        res.status(400).json({ error: "City ID is required" });
        return;
      }

      console.log(
        `Looking up address: "${address}" in city: "${cityId}" with analysis: ${includeAnalysis}`,
      );

      // For now, we'll use the basic lookup without analysis
      // Analysis can be added later when we have PDF processing for other cities
      const result = await multiCityUrbanismService.lookupAddress(
        cityId,
        address.trim(),
      );

      console.log("Multi-city lookup successful, returning result");
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error looking up address in multi-city service:", error);
      res.status(500).json({ error: "Failed to lookup address" });
    }
  };

  public getCounties = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log("getCounties called");
      const counties = citiesService.getCounties();
      console.log("Counties retrieved:", counties?.length || 0);

      if (!counties) {
        console.log("Counties is null/undefined");
        res.status(500).json({ error: "Failed to load counties data" });
        return;
      }

      res.status(200).json(counties);
    } catch (error: any) {
      console.error("Error getting counties:", error);
      res
        .status(500)
        .json({ error: "Failed to get counties", details: error.message });
    }
  };

  public getCitiesByCounty = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { county } = req.params;

      if (!county || typeof county !== "string") {
        res.status(400).json({ error: "County name is required" });
        return;
      }

      const cities = citiesService.getCitiesByCounty(county);
      res.status(200).json(cities);
    } catch (error: any) {
      console.error("Error getting cities by county:", error);
      res.status(500).json({ error: "Failed to get cities" });
    }
  };

  public getCityInfo = async (req: Request, res: Response): Promise<void> => {
    try {
      const { cityId } = req.params;

      if (!cityId || typeof cityId !== "string") {
        res.status(400).json({ error: "City ID is required" });
        return;
      }

      const cityConfig = citiesService.getCityById(cityId);
      if (!cityConfig) {
        res.status(404).json({ error: "City not found" });
        return;
      }

      // Return city info without sensitive data
      const cityInfo = {
        id: cityConfig.id,
        name: cityConfig.name,
        county: cityConfig.county,
        coordinates: cityConfig.coordinates,
        requiresAuth: cityConfig.urbanismService.requiresAuth,
      };

      res.status(200).json(cityInfo);
    } catch (error: any) {
      console.error("Error getting city info:", error);
      res.status(500).json({ error: "Failed to get city info" });
    }
  };
}
