import { Alert } from "./alert";
import { Input } from "./input/input";
import("./details").then(({ Details }) => {
  customElements.define("btrix-details", Details);
});
import("./locale-picker").then(({ LocalePicker }) => {
  customElements.define("btrix-locale-picker", LocalePicker);
});
import("./account-settings").then(({ AccountSettings }) => {
  customElements.define("btrix-account-settings", AccountSettings);
});
import("./archive-invite-form").then(({ ArchiveInviteForm }) => {
  customElements.define("btrix-archive-invite-form", ArchiveInviteForm);
});
import("./config-editor").then(({ ConfigEditor }) => {
  customElements.define("btrix-config-editor", ConfigEditor);
});
import("./archives-list").then(({ ArchivesList }) => {
  customElements.define("btrix-archives-list", ArchivesList);
});
import("./copy-button").then(({ CopyButton }) => {
  customElements.define("btrix-copy-button", CopyButton);
});
import("./invite-form").then(({ InviteForm }) => {
  customElements.define("btrix-invite-form", InviteForm);
});
import("./profile-browser").then(({ ProfileBrowser }) => {
  customElements.define("btrix-profile-browser", ProfileBrowser);
});
import("./relative-duration").then(({ RelativeDuration }) => {
  customElements.define("btrix-relative-duration", RelativeDuration);
});
import("./sign-up-form").then(({ SignUpForm }) => {
  customElements.define("btrix-sign-up-form", SignUpForm);
});
import("./not-found").then(({ NotFound }) => {
  customElements.define("btrix-not-found", NotFound);
});
import("./screencast").then(({ Screencast: Screencast }) => {
  customElements.define("btrix-screencast", Screencast);
});
import("./select-browser-profile").then(({ SelectBrowserProfile }) => {
  customElements.define("btrix-select-browser-profile", SelectBrowserProfile);
});
import("./queue-exclusion-form").then(({ QueueExclusionForm }) => {
  customElements.define("btrix-queue-exclusion-form", QueueExclusionForm);
});
import("./queue-exclusion-table").then(({ QueueExclusionTable }) => {
  customElements.define("btrix-queue-exclusion-table", QueueExclusionTable);
});
import("./numbered-list").then(({ NumberedList }) => {
  customElements.define("btrix-numbered-list", NumberedList);
});
import("./pagination").then(({ Pagination }) => {
  customElements.define("btrix-pagination", Pagination);
});
import("./crawl-queue").then(({ CrawlQueue }) => {
  customElements.define("btrix-crawl-queue", CrawlQueue);
});
import("./exclusion-editor").then(({ ExclusionEditor }) => {
  customElements.define("btrix-exclusion-editor", ExclusionEditor);
});
import("./crawl-pending-exclusions").then(({ CrawlPendingExclusions }) => {
  customElements.define(
    "btrix-crawl-pending-exclusions",
    CrawlPendingExclusions
  );
});
import("./badge").then(({ Badge }) => {
  customElements.define("btrix-badge", Badge);
});
import("./icon-button").then(({ IconButton }) => {
  customElements.define("btrix-icon-button", IconButton);
});
import("./language-select").then(({ LanguageSelect }) => {
  customElements.define("btrix-language-select", LanguageSelect);
});

customElements.define("btrix-alert", Alert);
customElements.define("btrix-input", Input);
