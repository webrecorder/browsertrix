import { ROUTES } from "@/routes";
import APIRouter from "@/utils/APIRouter";

const router = new APIRouter(ROUTES);

export const { urlForName } = router;

export default router;
