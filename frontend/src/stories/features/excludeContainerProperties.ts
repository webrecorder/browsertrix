/**
 * Exclude `BtrixElement` and `StorybookOrg` properties from story controls
 */
import { StorybookOrg } from "../decorators/orgDecorator";

import { BtrixElement } from "@/classes/BtrixElement";

const controlOpts = { table: { disable: true } };
const argTypes: Record<string, typeof controlOpts> = {
  api: controlOpts,
  notify: controlOpts,
  navigate: controlOpts,
  localize: controlOpts,
};

Object.getOwnPropertyNames(BtrixElement.prototype).forEach((prop) => {
  if (prop === "constructor") return;

  argTypes[prop] = controlOpts;
});

Object.getOwnPropertyNames(StorybookOrg.prototype).forEach((prop) => {
  if (prop === "constructor") return;

  argTypes[prop] = controlOpts;
});

export { argTypes };
