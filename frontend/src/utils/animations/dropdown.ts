export const dropdownShow = [
  {
    opacity: 0,
    transform: "scale(0.9)",
  },
  { opacity: 1, scale: 1 },
] satisfies Keyframe[];

export const dropdownHide = [
  { opacity: 1, scale: 1 },
  {
    opacity: 0,
    transform: "scale(0.9)",
  },
] satisfies Keyframe[];

export const dropdownTiming = {
  duration: 100,
  easing: "ease",
} satisfies OptionalEffectTiming;
