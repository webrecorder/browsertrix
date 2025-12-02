import { type Bucket } from "./execution-minute-meter";

import { type Color } from "@/features/meters/utils/colors";

export const executionMinuteColors = {
  monthly: {
    foreground: {
      primary: "lime-500",
      border: "lime-700",
    },
    background: {
      primary: "lime-100",
      border: "lime-400",
    },
  },
  gifted: {
    foreground: {
      primary: "blue-500",
      border: "blue-700",
    },
    background: {
      primary: "blue-100",
      border: "blue-400",
    },
  },
  extra: {
    foreground: {
      primary: "violet-500",
      border: "violet-700",
    },
    background: {
      primary: "violet-100",
      border: "violet-400",
    },
  },
} satisfies Record<
  Bucket,
  {
    foreground: { primary: Color; border: Color };
    background: { primary: Color; border: Color };
  }
>;
