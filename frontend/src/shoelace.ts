/**
 * Cherry-picked Shoelace components
 * https://shoelace.style
 */
import { setBasePath } from "@shoelace-style/shoelace/dist/utilities/base-path.js";
import "@shoelace-style/shoelace/dist/themes/light.css";
import "@shoelace-style/shoelace/dist/components/alert/alert";
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/button/button"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/dialog/dialog"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/form/form"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/icon/icon"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/input/input"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/menu/menu"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/menu-item/menu-item"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/radio/radio"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/radio-group/radio-group"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/select/select"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/spinner/spinner"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab/tab"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab-group/tab-group"
);
import(
  /* webpackChunkName: "shoelace" */ "@shoelace-style/shoelace/dist/components/tab-panel/tab-panel"
);

setBasePath("/shoelace");
