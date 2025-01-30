import { createContext } from "@lit/context";

import { type ViewState } from "@/utils/APIRouter";

export type ViewStateContext = ViewState | null;

export const viewStateContext = createContext<ViewStateContext>("viewState");
