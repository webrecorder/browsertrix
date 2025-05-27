import { ROUTES } from "@/routes";
import APIRouter from "@/utils/APIRouter";
import { cached } from "@/utils/weakCache";

const router = new APIRouter(ROUTES);

export const urlForName = cached(router.urlForName);

export default router;
