import { Alert } from "./alert";
import { Input } from "./input/input";
import("./locale-picker").then(({ LocalePicker }) => {
  customElements.define("btrix-locale-picker", LocalePicker);
});
import("./account-settings").then(({ AccountSettings }) => {
  customElements.define("btrix-account-settings", AccountSettings);
});
import("./archive-invite-form").then(({ ArchiveInviteForm }) => {
  customElements.define("btrix-archive-invite-form", ArchiveInviteForm);
});
import("./copy-button").then(({ CopyButton }) => {
  customElements.define("btrix-copy-button", CopyButton);
});
import("./invite-form").then(({ InviteForm }) => {
  customElements.define("btrix-invite-form", InviteForm);
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

customElements.define("btrix-alert", Alert);
customElements.define("btrix-input", Input);
