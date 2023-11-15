import "./alert";
import { Input } from "./input/input";
import { TimeInput } from "./time-input";
import("./details");
import("./locale-picker").then(({ LocalePicker }) => {
  customElements.define("btrix-locale-picker", LocalePicker);
});
import("./account-settings");
import("./config-editor");
import("./orgs-list").then(({ OrgsList }) => {
  customElements.define("btrix-orgs-list", OrgsList);
});
import("./copy-button");
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
import("./numbered-list").then(
  ({ NumberedList, NumberedListItem, NumberedListHeader }) => {
    customElements.define("btrix-numbered-list", NumberedList);
    customElements.define("btrix-numbered-list-item", NumberedListItem);
    customElements.define("btrix-numbered-list-header", NumberedListHeader);
  }
);
import("./pagination").then(({ Pagination }) => {
  customElements.define("btrix-pagination", Pagination);
});
import("./crawl-queue");
import("./exclusion-editor");
import("./crawl-pending-exclusions");
import("./badge");
import("./button");
import("./language-select").then(({ LanguageSelect }) => {
  customElements.define("btrix-language-select", LanguageSelect);
});
import("./tab-list").then(({ Tab, TabList, TabPanel }) => {
  customElements.define("btrix-tab", Tab);
  customElements.define("btrix-tab-list", TabList);
  customElements.define("btrix-tab-panel", TabPanel);
});
import("./desc-list");
import("./checkbox-list");
import("./crawl-list");
import("./workflow-list").then(({ WorkflowListItem, WorkflowList }) => {
  customElements.define("btrix-workflow-list-item", WorkflowListItem);
  customElements.define("btrix-workflow-list", WorkflowList);
});
import("./crawl-logs");
import("./section-heading").then(({ SectionHeading }) => {
  customElements.define("btrix-section-heading", SectionHeading);
});
import("./config-details");
import("./tag-input").then(({ TagInput }) => {
  customElements.define("btrix-tag-input", TagInput);
});
import("./tag").then(({ Tag }) => {
  customElements.define("btrix-tag", Tag);
});
import("./dialog");
import("./data-table");
import("./crawl-status");
import("./crawl-metadata-editor");
import("./observable").then(({ Observable }) => {
  customElements.define("btrix-observable", Observable);
});
import("./combobox");
import("./markdown-editor").then(({ MarkdownEditor }) => {
  customElements.define("btrix-markdown-editor", MarkdownEditor);
});
import("./markdown-viewer").then(({ MarkdownViewer }) => {
  customElements.define("btrix-markdown-viewer", MarkdownViewer);
});
import("./file-list");
import("./collections-add");
import("./code");
import("./pw-strength-alert").then(({ PasswordStrengthAlert }) => {
  customElements.define("btrix-pw-strength-alert", PasswordStrengthAlert);
});
import("./search-combobox").then(({ SearchCombobox }) => {
  customElements.define("btrix-search-combobox", SearchCombobox);
});
import("./meter").then(({ Meter, MeterBar }) => {
  customElements.define("btrix-meter", Meter);
  customElements.define("btrix-meter-bar", MeterBar);
});
customElements.define("btrix-input", Input);
customElements.define("btrix-time-input", TimeInput);
