import { Router } from "express";
import { MultiCityUrbanismController } from "../controllers/multiCityUrbanism.controller";

function createMultiCityUrbanismRouter(): Router {
  const router = Router();
  const controller = new MultiCityUrbanismController();

  router.post("/lookup", (req, res, _next) => {
    console.log("Multi-city route handler called for /lookup");
    console.log("Request body in multi-city route:", req.body);
    controller.lookupAddress(req, res);
  });

  router.get("/counties", controller.getCounties);
  router.get("/counties/:county/cities", controller.getCitiesByCounty);
  router.get("/cities/:cityId", controller.getCityInfo);

  return router;
}

export default createMultiCityUrbanismRouter;
