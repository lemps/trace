import { isCard, isPlainBox } from "./boxLook";
import type { Rendered } from "./renderDocument";

// The print copy's last steps before printing: wait for what it draws, line it
// up with the page, and keep small drawn boxes on one page.

/** How long to wait for images and fonts: inside `usePrintPdf`'s overall 5 s. */
const SETTLE_MS = 4000;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves once `root` is laid out and its images are decoded and fonts loaded,
 * or after `ms`. A broken image counts as done: it prints as the browser draws
 * it. There's no frame `load` event to wait on any more.
 */
export async function settle(root: ShadowRoot, ms = SETTLE_MS): Promise<void> {
  await nextFrame();
  await nextFrame();
  const images = Array.from(root.querySelectorAll("img"), (img) =>
    img.decode().catch(() => undefined)
  );
  const fonts = document.fonts.ready.then(() => undefined);
  await Promise.race([Promise.all([...images, fonts]), delay(ms)]);
}

/**
 * The page and body wrappers start at the page margin, where the sheet's header
 * line does. A document's own body margin (`margin: 0 auto`, the 8px a browser
 * adds) only moved it off that line, so it goes. Its padding goes too when the
 * box draws nothing (white or no background, no border or shadow): then it was
 * only space on top of the page margin. A tinted, bordered or dark body keeps
 * its padding, which is what keeps its text off its own edges.
 */
function alignToPage(box: HTMLElement): void {
  box.style.setProperty("margin", "0", "important");
  if (isPlainBox(getComputedStyle(box))) box.style.setProperty("padding", "0", "important");
}

/**
 * Small drawn boxes (cards, callouts, stat tiles: `boxLook.isCard`) are kept on
 * one page, so the engine moves one to the next page rather than slicing it.
 * Measured first and marked after, so reading never waits on a fresh layout.
 */
function keepCardsWhole(body: HTMLElement): void {
  const cards = Array.from(body.querySelectorAll("*")).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && isCard(getComputedStyle(el), el.getBoundingClientRect().height)
  );
  for (const card of cards) card.style.setProperty("break-inside", "avoid");
}

/** Fit the rendered copy to paper (above). */
export function fitToPaper({ page, body }: Rendered): void {
  alignToPage(page);
  alignToPage(body);
  keepCardsWhole(body);
}
