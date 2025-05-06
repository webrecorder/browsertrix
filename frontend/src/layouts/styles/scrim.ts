import { tw } from "@/utils/tailwind";

const scrim = tw`before:pointer-events-none before:absolute before:-z-10`;

export const scrimToBottom = [
  scrim,
  tw`before:to-[var(--btrix-overflow-scroll-scrim-color)]/0 before:h-[var(--btrix-overflow-scrim-size)] before:w-full before:bg-gradient-to-b before:from-[var(--btrix-overflow-scroll-scrim-color)]`,
];
