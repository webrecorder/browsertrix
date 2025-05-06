import { tw } from "@/utils/tailwind";

export const headerClasses = [
  tw`z-10 flex flex-wrap gap-2 lg:sticky lg:top-3`,
  tw`before:pointer-events-none before:absolute before:-top-3 before:-z-10 before:h-12 before:w-full before:bg-gradient-to-b before:from-white before:to-white/0`,
];
