/**
 * All available analytics tracking events
 */

export enum AnalyticsTrackEvent {
  /**
   * Generic
   */
  PageView = "pageview",
  /**
   * Collections
   */
  CopyShareCollectionLink = "Copy share collection link",
  DownloadPublicCollection = "Download public collection",
  /**
   * Workflows
   */
  ExpandWorkflowFormSection = "Expand workflow form section",
  /**
   * Onboarding
   */
  CompleteOnboardingStep = "Completed onboarding step",
  FinishSetUp = "Finished set up",
  UndoFinishSetUp = "Undo finished set up",
  /**
   * User Guide
   */
  OpenedCrawlingOnePageGuide = "Opened crawling one page guide",
  OpenedCrawlingSocialMediaGuide = "Opened crawling social media guide",
  OpenedCrawlingWebsiteGuide = "Opened crawling website guide",
  ClickSearchGuides = "Clicked search guides",
}
