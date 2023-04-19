import { Alert } from "./alert";
import { Input } from "./input/input";
import { TimeInput } from "./time-input";
import("./details").then(({ Details }) => {
  customElements.define("btrix-details", Details);
});
import("./locale-picker").then(({ LocalePicker }) => {
  customElements.define("btrix-locale-picker", LocalePicker);
});
import("./account-settings").then(({ AccountSettings }) => {
  customElements.define("btrix-account-settings", AccountSettings);
});
import("./config-editor").then(({ ConfigEditor }) => {
  customElements.define("btrix-config-editor", ConfigEditor);
});
import("./orgs-list").then(({ OrgsList }) => {
  customElements.define("btrix-orgs-list", OrgsList);
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
import("./button").then(({ Button }) => {
  customElements.define("btrix-button", Button);
});
import("./language-select").then(({ LanguageSelect }) => {
  customElements.define("btrix-language-select", LanguageSelect);
});
import("./tab-list").then(({ Tab, TabList, TabPanel }) => {
  customElements.define("btrix-tab", Tab);
  customElements.define("btrix-tab-list", TabList);
  customElements.define("btrix-tab-panel", TabPanel);
});
import("./desc-list").then(({ DescListItem, DescList }) => {
  customElements.define("btrix-desc-list-item", DescListItem);
  customElements.define("btrix-desc-list", DescList);
});
import("./crawl-list").then(({ CrawlListItem, CrawlList }) => {
  customElements.define("btrix-crawl-list-item", CrawlListItem);
  customElements.define("btrix-crawl-list", CrawlList);
});
import("./workflow-list").then(({ WorkflowListItem, WorkflowList }) => {
  customElements.define("btrix-workflow-list-item", WorkflowListItem);
  customElements.define("btrix-workflow-list", WorkflowList);
});
import("./section-heading").then(({ SectionHeading }) => {
  customElements.define("btrix-section-heading", SectionHeading);
});
import("./config-details").then(({ ConfigDetails }) => {
  customElements.define("btrix-config-details", ConfigDetails);
});
import("./tag-input").then(({ TagInput }) => {
  customElements.define("btrix-tag-input", TagInput);
});
import("./tag").then(({ Tag }) => {
  customElements.define("btrix-tag", Tag);
});
import("./dialog").then(({ Dialog }) => {
  customElements.define("btrix-dialog", Dialog);
});
import("./data-table").then(({ DataTable }) => {
  customElements.define("btrix-data-table", DataTable);
});
import("./crawl-status").then(({ CrawlStatus }) => {
  customElements.define("btrix-crawl-status", CrawlStatus);
});
import("./crawl-metadata-editor").then(({ CrawlMetadataEditor }) => {
  customElements.define("btrix-crawl-metadata-editor", CrawlMetadataEditor);
});
import("./observable").then(({ Observable }) => {
  customElements.define("btrix-observable", Observable);
});
import("./combobox").then(({ Combobox }) => {
  customElements.define("btrix-combobox", Combobox);
});

customElements.define("btrix-alert", Alert);
customElements.define("btrix-input", Input);
customElements.define("btrix-time-input", TimeInput);
