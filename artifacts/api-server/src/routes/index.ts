import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import geocodeRouter from "./geocode.js";
import tripRouter from "./trip.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(geocodeRouter);
router.use(tripRouter);

export default router;
