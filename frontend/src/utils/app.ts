import appState, { AppStateService } from "./state";

import { translatedLocales } from "@/types/localization";

export type AppSettings = {
  defaultBehaviorTimeSeconds: number;
  defaultPageLoadTimeSeconds: number;
  maxPagesPerCrawl: number;
  numBrowsersPerInstance: number;
  maxBrowserWindows: number;
  salesEmail: string;
  supportEmail: string;
  localesEnabled?: readonly string[];
  pausedExpiryMinutes?: number;
  rateLimitDurationMinutes?: number;
};

const fallbackSettings = {
  defaultBehaviorTimeSeconds: 0,
  defaultPageLoadTimeSeconds: 0,
  maxPagesPerCrawl: 0,
  numBrowsersPerInstance: 1,
  maxBrowserWindows: 4,
  salesEmail: "",
  supportEmail: "",
  localesEnabled: translatedLocales,
} satisfies AppSettings;

export async function getAppSettings(): Promise<AppSettings> {
  if (appState.settings) {
    return appState.settings;
  }

  let data: AppSettings = fallbackSettings;

  try {
    const resp = await fetch("/api/settings", {
      headers: { "Content-Type": "application/json" },
    });

    if (resp.status === 200) {
      data = (await resp.json()) as AppSettings;

      AppStateService.updateSettings(data);
    } else {
      console.debug(resp);
    }
  } catch (err) {
    console.error(err);
  }

  return data;
}
