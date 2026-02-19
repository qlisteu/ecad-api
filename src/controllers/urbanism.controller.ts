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

      const result = includeAnalysis
        ? await this.urbanismService.lookupAddressWithAnalysis(address.trim())
        : await this.urbanismService.lookupAddress(address.trim());

      console.log("Lookup successful, returning result");
      res.status(200).json(result);
    } catch (error: any) {
      console.error("Error looking up address:", error);
      res.status(500).json({ error: "Failed to lookup address" });
    }
  };
}
