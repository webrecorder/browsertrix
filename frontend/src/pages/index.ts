import(/* webpackPrefetch: true */ "./sign-up").then(({ SignUp }) => {
  customElements.define("btrix-sign-up", SignUp);
});
import(/* webpackPrefetch: true */ "./log-in").then(({ LogInPage }) => {
  customElements.define("btrix-log-in", LogInPage);
});
import(/* webpackPrefetch: true */ "./archives").then(({ Archives }) => {
  customElements.define("btrix-archives", Archives);
});
import(/* webpackPrefetch: true */ "./archive").then(({ Archive }) => {
  customElements.define("btrix-archive", Archive);
});

import("./join").then(({ Join }) => {
  customElements.define("btrix-join", Join);
});
import("./verify").then(({ Verify }) => {
  customElements.define("btrix-verify", Verify);
});
import("./reset-password").then(({ ResetPassword }) => {
  customElements.define("btrix-reset-password", ResetPassword);
});
