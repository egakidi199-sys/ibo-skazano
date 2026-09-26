import { toBlob } from "html-to-image";

const POSTCARD_WIDTH_PX = 1080;
const POSTCARD_HEIGHT_PX = 1350;
const CAPTURE_SCALE = 4;

/** Открытка вёрстается в этом CSS-размере, а захватывается с pixelRatio ×4 — итог 1080×1350. */
export const POSTCARD_CSS_WIDTH = POSTCARD_WIDTH_PX / CAPTURE_SCALE;
export const POSTCARD_CSS_HEIGHT = POSTCARD_HEIGHT_PX / CAPTURE_SCALE;

export async function renderPostcardPng(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, {
    width: POSTCARD_CSS_WIDTH,
    height: POSTCARD_CSS_HEIGHT,
    pixelRatio: CAPTURE_SCALE,
    cacheBust: true,
  });
  if (!blob) {
    throw new Error("Не удалось отрендерить открытку");
  }
  return blob;
}
