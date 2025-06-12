import appState from "./state";

import { translatedLocales } from "@/types/localization";

export type AppSettings = {
  registrationEnabled: boolean;
  jwtTokenLifetime: number;
  defaultBehaviorTimeSeconds: number;
  defaultPageLoadTimeSeconds: number;
  maxPagesPerCrawl: number;
  numBrowsersPerInstance: number;
  maxBrowserWindows: number;
  billingEnabled: boolean;
  signUpUrl: string;
  salesEmail: string;
  supportEmail: string;
  localesEnabled?: readonly string[];
};

export async function getAppSettings(): Promise<AppSettings> {
  if (appState.settings) {
    return appState.settings;
  }

  const resp = await fetch("/api/settings", {
    headers: { "Content-Type": "application/json" },
  });

  if (resp.status === 200) {
    return (await resp.json()) as AppSettings;
  } else {
    console.debug(resp);

    return {
      registrationEnabled: false,
      jwtTokenLifetime: 0,
      defaultBehaviorTimeSeconds: 0,
      defaultPageLoadTimeSeconds: 0,
      maxPagesPerCrawl: 0,
      numBrowsersPerInstance: 1,
      maxBrowserWindows: 4,
      billingEnabled: false,
      signUpUrl: "",
      salesEmail: "",
      supportEmail: "",
      localesEnabled: translatedLocales,
    };
  }
}
