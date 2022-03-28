import { Home } from "./home";
customElements.define("btrix-home", Home);

import(/* webpackChunkName: "sign-up" */ "./sign-up").then(({ SignUp }) => {
  customElements.define("btrix-sign-up", SignUp);
});
import(/* webpackChunkName: "log-in" */ "./log-in").then(({ LogInPage }) => {
  customElements.define("btrix-log-in", LogInPage);
});
import(/* webpackChunkName: "archives" */ "./archives").then(({ Archives }) => {
  customElements.define("btrix-archives", Archives);
});
import(/* webpackChunkName: "archive" */ "./archive").then(({ Archive }) => {
  customElements.define("btrix-archive", Archive);
});
import(/* webpackChunkName: "crawls" */ "./crawls").then(({ Crawls }) => {
  customElements.define("btrix-crawls", Crawls);
});
import(/* webpackChunkName: "join" */ "./join").then(({ Join }) => {
  customElements.define("btrix-join", Join);
});
import(/* webpackChunkName: "verify" */ "./verify").then(({ Verify }) => {
  customElements.define("btrix-verify", Verify);
});
import(/* webpackChunkName: "reset-password" */ "./reset-password").then(
  ({ ResetPassword }) => {
    customElements.define("btrix-reset-password", ResetPassword);
  }
);
import(/* webpackChunkName: "users-invite" */ "./users-invite").then(
  ({ UsersInvite }) => {
    customElements.define("btrix-users-invite", UsersInvite);
  }
);
import(/* webpackChunkName: "accept-invite" */ "./accept-invite").then(
  ({ AcceptInvite }) => {
    customElements.define("btrix-accept-invite", AcceptInvite);
  }
);
