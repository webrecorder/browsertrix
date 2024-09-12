import appState from "./state";

export type AppSettings = {
  registrationEnabled: boolean;
  jwtTokenLifetime: number;
  defaultBehaviorTimeSeconds: number;
  defaultPageLoadTimeSeconds: number;
  maxPagesPerCrawl: number;
  numBrowsers: number;
  maxScale: number;
  billingEnabled: boolean;
  signUpUrl: string;
  salesEmail: string;
  supportEmail: string;
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
      numBrowsers: 1,
      maxScale: 0,
      billingEnabled: false,
      signUpUrl: "",
      salesEmail: "",
      supportEmail: "",
    };
  }
}
