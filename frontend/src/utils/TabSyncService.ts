import { nanoid } from "nanoid";

type TabSyncConfig = { tabIds: string[] };

/**
 * Service for syncing data across tabs using `BroadcastChannel`
 */
export default class TabSyncService {
  static storageKey = "btrix.tabSync";

  public tabId = nanoid();
  public channel: BroadcastChannel;
  public get tabCount() {
    return this.getStoredSyncConfig()?.tabIds.length;
  }

  constructor(channelName: string) {
    // Open channel
    this.channel = new BroadcastChannel(channelName);

    // Update number of open tabs
    const syncConfig = this.getStoredSyncConfig() || { tabIds: [] };

    syncConfig.tabIds.push(this.tabId);

    window.localStorage.setItem(
      TabSyncService.storageKey,
      JSON.stringify({
        ...syncConfig,
        // Somewhat arbitrary, but only store latest 20 tabs to keep list managable
        tabIds: syncConfig.tabIds.slice(-20),
      }),
    );

    // Remove tab ID on page unload
    window.addEventListener("unload", () => {
      const syncConfig = this.getStoredSyncConfig();

      if (syncConfig) {
        const tabIds = syncConfig.tabIds.filter((id) => id === this.tabId);

        window.localStorage.setItem(
          TabSyncService.storageKey,
          JSON.stringify({
            ...syncConfig,
            tabIds,
          }),
        );
      }
    });
  }

  private getStoredSyncConfig(): TabSyncConfig | null {
    const storedSyncConfig = window.localStorage.getItem(
      TabSyncService.storageKey,
    );

    if (storedSyncConfig) {
      return JSON.parse(storedSyncConfig) as TabSyncConfig;
    }

    return null;
  }
}
