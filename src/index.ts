import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import urbanismRoutes from "./routes/urbanism.routes";
import multiCityUrbanismRoutes from "./routes/multiCityUrbanism.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log("Headers:", req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("Body:", req.body);
  }
  next();
});

// Routes
console.log("Loading urbanism routes...");
const urbanismRouter = urbanismRoutes();
console.log("Urbanism routes loaded:", typeof urbanismRouter);
app.use("/api/v0/urbanism", urbanismRouter);
console.log("Urbanism routes registered");

console.log("Loading multi-city urbanism routes...");
const multiCityUrbanismRouter = multiCityUrbanismRoutes();
console.log(
  "Multi-city urbanism routes loaded:",
  typeof multiCityUrbanismRouter,
);
app.use("/api/v0/multi-city-urbanism", multiCityUrbanismRouter);
console.log("Multi-city urbanism routes registered");

// Health check
app.get("/api/v0/health", (_, res) => {
  res.status(200).json({
    status: "ok",
    message: "ECAD API is running",
    timestamp: new Date().toISOString(),
  });
});

// Debug route to see all requests
app.get("/debug", (req, res) => {
  res.status(200).json({
    message: "Debug route works",
    method: req.method,
    url: req.url,
    headers: req.headers,
  });
});

// Catch-all for debugging
app.use("*", (req, res) => {
  console.log(`Catch-all route: ${req.method} ${req.url}`);
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    url: req.url,
    availableRoutes: [
      "/api/v0/health",
      "/api/v0/urbanism/lookup",
      "/api/v0/multi-city-urbanism/counties",
      "/api/v0/multi-city-urbanism/counties/:county/cities",
      "/api/v0/multi-city-urbanism/cities/:cityId",
      "/api/v0/multi-city-urbanism/lookup",
    ],
  });
});

app.listen(PORT, () => {
  console.log(`ECAD API server is running on port ${PORT}`);
});

export default app;
