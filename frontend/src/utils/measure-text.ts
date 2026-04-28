// Some parts of this pulled from Pretext (https://github.com/chenglou/pretext/blob/main/src/measurement.ts)

import { cached } from "./weakCache";

let measureContext:
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | null = null;

export function getMeasureContext():
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D {
  if (measureContext !== null) return measureContext;

  if (typeof OffscreenCanvas !== "undefined") {
    measureContext = new OffscreenCanvas(1, 1).getContext("2d")!;
    return measureContext;
  }

  if (typeof document !== "undefined") {
    measureContext = document.createElement("canvas").getContext("2d")!;
    return measureContext;
  }

  throw new Error(
    "Text measurement requires OffscreenCanvas or a DOM canvas context.",
  );
}

export const measureText = cached(function measureText(
  text: string,
  font: string,
): { width: number | undefined; height: number | undefined } {
  const ctx = getMeasureContext();
  ctx.font = font;
  const metrics = ctx.measureText(text);
  return {
    width: metrics.width,
    height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
  };
});
export function getFontFromElement(element: HTMLElement): string {
  return window.getComputedStyle(element).font;
}
export function measureTextWithElement(
  text: string,
  element: HTMLElement,
  log = false,
) {
  const result = measureText(text, getFontFromElement(element));
  if (log) console.log("measureTextWithElement", { text }, result);
  return result;
}
