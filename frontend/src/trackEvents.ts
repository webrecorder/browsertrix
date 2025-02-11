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
  ExpandWorkflowFormScope = 'Expand workflow form "Scope"',
  ExpandWorkflowFormLimits = 'Expand workflow form "Limits"',
  ExpandWorkflowFormBrowserSettings = 'Expand workflow form "Browser Settings"',
  ExpandWorkflowFormScheduling = 'Expand workflow form "Scheduling"',
  ExpandWorkflowFormMetadata = 'Expand workflow form "Metadata"',
}
