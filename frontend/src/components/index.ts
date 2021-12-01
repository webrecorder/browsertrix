import { Alert } from "./alert";
import("./locale-picker").then(({ LocalePicker }) => {
  customElements.define("btrix-locale-picker", LocalePicker);
});
import("./account-settings").then(({ AccountSettings }) => {
  customElements.define("btrix-account-settings", AccountSettings);
});
import("./archive-invite-form").then(({ ArchiveInviteForm }) => {
  customElements.define("btrix-archive-invite-form", ArchiveInviteForm);
});
import("./invite-form").then(({ InviteForm }) => {
  customElements.define("btrix-invite-form", InviteForm);
});
import("./sign-up-form").then(({ SignUpForm }) => {
  customElements.define("btrix-sign-up-form", SignUpForm);
});

customElements.define("btrix-alert", Alert);
