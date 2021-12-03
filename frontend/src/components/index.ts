import { Alert } from "./alert";
import(/* webpackPrefetch: true */ "./locale-picker").then(
  ({ LocalePicker }) => {
    customElements.define("btrix-locale-picker", LocalePicker);
  }
);
import(/* webpackPrefetch: true */ "./account-settings").then(
  ({ AccountSettings }) => {
    customElements.define("btrix-account-settings", AccountSettings);
  }
);
import(/* webpackPrefetch: true */ "./invite-form").then(({ InviteForm }) => {
  customElements.define("btrix-invite-form", InviteForm);
});
import(/* webpackPrefetch: true */ "./sign-up-form").then(({ SignUpForm }) => {
  customElements.define("btrix-sign-up-form", SignUpForm);
});

customElements.define("btrix-alert", Alert);
