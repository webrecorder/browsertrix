import { scrimToBottom } from "./scrim";

import { tw } from "@/utils/tailwind";

export const stickyHeader = [
  tw`z-10 lg:sticky lg:top-3`,
  scrimToBottom,
  tw`before:-top-3`,
];
