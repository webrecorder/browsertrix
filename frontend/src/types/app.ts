export type AppSettings = {
  registrationEnabled: boolean;
  jwtTokenLifetime: number;
  defaultBehaviorTimeSeconds: number;
  defaultPageLoadTimeSeconds: number;
  maxPagesPerCrawl: number;
  maxScale: number;
  billingEnabled: boolean;
  signUpUrl: string;
  salesEmail: string;
  supportEmail: string;
  localesEnabled?: string[];
};
