/**
 * Cherry-picked Shoelace components
 * https://shoelace.style
 */
import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";
import { registerIconLibrary } from "@shoelace-style/shoelace/dist/utilities/icon-library.js";

import "@shoelace-style/shoelace/dist/themes/light.css";
import "@shoelace-style/shoelace/dist/components/alert/alert";
import "@shoelace-style/shoelace/dist/components/avatar/avatar";
import "@shoelace-style/shoelace/dist/components/button/button";
import "@shoelace-style/shoelace/dist/components/drawer/drawer";
import "@shoelace-style/shoelace/dist/components/icon/icon";
import "@shoelace-style/shoelace/dist/components/icon-button/icon-button";
import "@shoelace-style/shoelace/dist/components/input/input";
import "@shoelace-style/shoelace/dist/components/checkbox/checkbox";
import "@shoelace-style/shoelace/dist/components/details/details";
import "@shoelace-style/shoelace/dist/components/button-group/button-group";
import "@shoelace-style/shoelace/dist/components/image-comparer/image-comparer";
import "@shoelace-style/shoelace/dist/components/radio/radio";
import "@shoelace-style/shoelace/dist/components/radio-group/radio-group";
import "@shoelace-style/shoelace/dist/components/radio-button/radio-button";
import "@shoelace-style/shoelace/dist/components/resize-observer/resize-observer";
import "@shoelace-style/shoelace/dist/components/select/select";
import "@shoelace-style/shoelace/dist/components/option/option";
import "@shoelace-style/shoelace/dist/components/dropdown/dropdown";
import "@shoelace-style/shoelace/dist/components/switch/switch";
import "@shoelace-style/shoelace/dist/components/textarea/textarea";
import "@shoelace-style/shoelace/dist/components/mutation-observer/mutation-observer";
import "@shoelace-style/shoelace/dist/components/progress-bar/progress-bar";
import "@shoelace-style/shoelace/dist/components/progress-ring/progress-ring";
import "@shoelace-style/shoelace/dist/components/visually-hidden/visually-hidden";

import { APP_ICON_LIBRARY } from "./types/shoelace";

import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/breadcrumb/breadcrumb.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/breadcrumb-item/breadcrumb-item.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/dialog/dialog.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/divider/divider.js"
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
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tree/tree.js"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tree-item/tree-item.js"
);

setBasePath("/shoelace");
registerIconLibrary(APP_ICON_LIBRARY, {
  resolver: (name) => `/assets/icons/${name}.svg`,
});
