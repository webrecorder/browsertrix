/**
 * Cherry-picked Shoelace components
 * https://shoelace.style
 */
import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";
import { registerIconLibrary } from "@shoelace-style/shoelace/dist/utilities/icon-library.js";
import "@shoelace-style/shoelace/dist/themes/light.css";
console.log("import");
import "@shoelace-style/shoelace/dist/components/alert/alert.js";
import "@shoelace-style/shoelace/dist/components/button/button.js";
import "@shoelace-style/shoelace/dist/components/input/input.js";
import "@shoelace-style/shoelace/dist/components/checkbox/checkbox.js";
import "@shoelace-style/shoelace/dist/components/details/details.js";
import "@shoelace-style/shoelace/dist/components/button-group/button-group.js";
import "@shoelace-style/shoelace/dist/components/radio/radio.js";
import "@shoelace-style/shoelace/dist/components/radio-group/radio-group.js";
import "@shoelace-style/shoelace/dist/components/radio-button/radio-button.js";
import "@shoelace-style/shoelace/dist/components/resize-observer/resize-observer.js";
import "@shoelace-style/shoelace/dist/components/select/select.js";
import "@shoelace-style/shoelace/dist/components/option/option.js";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown.js";
import "@shoelace-style/shoelace/dist/components/switch/switch.js";
import "@shoelace-style/shoelace/dist/components/textarea/textarea.js";
import "@shoelace-style/shoelace/dist/components/mutation-observer/mutation-observer.js";
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/dialog/dialog.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/divider/divider.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/format-bytes/format-bytes.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/format-date/format-date.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/icon/icon.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/menu/menu.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/menu-item/menu-item.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/menu-label/menu-label.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/relative-time/relative-time.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/skeleton/skeleton.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/spinner/spinner.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab/tab.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab-group/tab-group.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tooltip/tooltip.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/popup/popup.js"
);

setBasePath("/shoelace");
registerIconLibrary("app", {
  resolver: (name) => `/assets/icons/${name}.svg`,
});
