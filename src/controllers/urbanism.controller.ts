import { Request, Response } from "express";
import { UrbanismService } from "../services/urbanismService";

export class UrbanismController {
  constructor(private readonly urbanismService: UrbanismService) {}

  public lookupAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log("Received request body:", req.body);
      console.log("Request headers:", req.headers);

      const { address, includeAnalysis } = req.body;

      if (
        !address ||
        typeof address !== "string" ||
        address.trim().length === 0
      ) {
        console.log("Invalid address provided");
        res.status(400).json({ error: "Address is required" });
        return;
      }

      console.log(
        `Looking up address: "${address}" with analysis: ${includeAnalysis}`,
      );

      const result = await this.urbanismService.lookupAddressWithAnalysis(
        address.trim(),
      );

      console.log("Lookup successful, returning result");
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error looking up address:", error);
      res.status(500).json({ error: "Failed to lookup address" });
    }
  };

  public analyzeBuildingDetails = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { zoneCode, buildingType } = req.body;

      if (!zoneCode || !buildingType) {
        res
          .status(400)
          .json({ error: "Zone code and building type are required" });
        return;
      }

      console.log(
        `Analyzing building details for zone: ${zoneCode}, type: ${buildingType}`,
      );

      // First, we need to get the zone info to find the regulament URL
      const address = req.body.address || "dummy address"; // We'll need this for lookup
      const lookupResult = await this.urbanismService.lookupAddress(address);

      const zone = lookupResult.zones.find((z) => z.cod_zona === zoneCode);
      if (!zone || !zone.regulament) {
        res.status(404).json({ error: "Zone or regulament not found" });
        return;
      }

      // Download and analyze PDF
      const pdfText = await this.urbanismService.downloadAndExtractPdfText(
        zone.regulament,
      );
      if (!pdfText) {
        res.status(400).json({ error: "Failed to download or parse PDF" });
        return;
      }

      const details = await this.urbanismService.analyzeBuildingDetails(
        pdfText,
        zoneCode,
        buildingType,
      );

      console.log(`Building details analysis completed for ${zoneCode}`);
      res.status(200).json(details);
    } catch (error: any) {
      console.error("Error analyzing building details:", error);
      res.status(500).json({ error: "Failed to analyze building details" });
    }
  };
}
