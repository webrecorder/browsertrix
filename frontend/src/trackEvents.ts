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
   * Trial
   */
  TrialOpenedUserGuide = "[Trial] Opened user guide",
  TrialCreatedWorkflow = "[Trial] Created workflow",
  TrialReplayedCrawledItem = "[Trial] Replayed crawled item",
  TrialVisitedBillingTab = "[Trial] Visited billing tab",
  /**
   * User Guide
   */
  OpenedCrawlingOnePageGuide = "Opened crawling one page guide",
  OpenedCrawlingSocialMediaGuide = "Opened crawling social media guide",
  OpenedCrawlingWebsiteGuide = "Opened crawling website guide",
}
