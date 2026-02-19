import { Router } from "express";
import { UrbanismController } from "../controllers/urbanism.controller";
import { urbanismService } from "../services/urbanismService";

function createUrbanismRouter(): Router {
  const router = Router();
  const urbanismController = new UrbanismController(urbanismService);

  router.post("/lookup", (req, res, next) => {
    console.log("Route handler called for /lookup");
    console.log("Request body in route:", req.body);
    urbanismController.lookupAddress(req, res);
  });

  return router;
}

export default createUrbanismRouter;
