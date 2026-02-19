import { Router } from "express";
import { UrbanismController } from "../controllers/urbanism.controller";
import { urbanismService } from "../services/urbanismService";

function createUrbanismRouter(): Router {
  const router = Router();
  const urbanismController = new UrbanismController(urbanismService);

  router.post("/lookup", (req, res, _next) => {
    console.log("Route handler called for /lookup");
    console.log("Request body in route:", req.body);
    urbanismController.lookupAddress(req, res);
  });

  router.post("/analyze-building-details", (req, res, _next) => {
    console.log("Route handler called for /analyze-building-details");
    console.log("Request body in route:", req.body);
    urbanismController.analyzeBuildingDetails(req, res);
  });

  return router;
}

export default createUrbanismRouter;
