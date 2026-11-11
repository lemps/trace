// What a box looks like, from its computed style: whether it draws anything of
// its own (a background, a border, a shadow). The print copy uses it twice:
// a plain <body> loses its padding so the text lines up with the sheet's header
// line, and a small drawn box (a card, a callout) is kept whole on one page.
// Pure, over the few computed properties it reads, so it's tested on objects.

type Side = "Top" | "Right" | "Bottom" | "Left";

/** The computed properties read here; a CSSStyleDeclaration has them all. */
export type BoxLook = {
  backgroundColor: string;
  backgroundImage: string;
  boxShadow: string;
} & { [K in `border${Side}Width` | `border${Side}Style`]: string };

const SIDES: readonly Side[] = ["Top", "Right", "Bottom", "Left"];

/** Whether a computed colour paints nothing (`transparent`, or alpha 0 in any syntax). */
export function isTransparent(color: string): boolean {
  const c = color.trim().toLowerCase();
  const zero = String.raw`\s*0(?:\.0*)?%?\s*\)$`;
  return (
    c === "transparent" ||
    // rgba(r, g, b, 0): the fourth of four comma-separated values.
    new RegExp(String.raw`^rgba?\([^,]+,[^,]+,[^,]+,${zero}`).test(c) ||
    // rgb(r g b / 0), oklch(l c h / 0), color(srgb r g b / 0)
    new RegExp(`/${zero}`).test(c)
  );
}

/** Whether a computed colour is opaque white: on paper, the same as no background. */
export function isWhite(color: string): boolean {
  const c = color.replace(/\s+/g, "").toLowerCase();
  return (
    c === "white" ||
    c === "#fff" ||
    c === "#ffffff" ||
    c === "rgb(255,255,255)" ||
    c === "rgba(255,255,255,1)" ||
    c === "color(srgb111)" ||
    /^oklch\((?:1|100%)0(?:\.0*)?(?:0|none)?/.test(c)
  );
}

/** Whether any side has a border that draws. */
export function hasBorder(look: BoxLook): boolean {
  return SIDES.some((s) => {
    const style = look[`border${s}Style`];
    return Number.parseFloat(look[`border${s}Width`]) > 0 && style !== "none" && style !== "hidden";
  });
}

/** A box that draws nothing of its own on white paper: its padding is only space. */
export function isPlainBox(look: BoxLook): boolean {
  const bg = look.backgroundColor;
  return (
    (isTransparent(bg) || isWhite(bg)) &&
    look.backgroundImage === "none" &&
    look.boxShadow === "none" &&
    !hasBorder(look)
  );
}

/**
 * The tallest box kept whole, in CSS px: about 40% of an A4 page's text height
 * (≈1007px less the 0.6in margins). Keeping a box whole can leave the space it
 * didn't fit in blank, so a tall one may break rather than leave most of a page.
 */
export const CARD_MAX_PX = 400;

/** Block-level displays a card is drawn with. Tables break between rows instead. */
const CARD_DISPLAYS = new Set(["block", "flow-root", "flex", "grid", "list-item"]);

/**
 * A drawn block (a card, a callout, a stat tile) small enough to keep on one
 * page, which the document hasn't given a break rule of its own. Found by how it
 * looks, never by class name.
 */
export function isCard(
  look: BoxLook & { display: string; breakInside: string },
  heightPx: number
): boolean {
  return (
    CARD_DISPLAYS.has(look.display) &&
    (look.breakInside === "auto" || look.breakInside === "") &&
    heightPx > 0 &&
    heightPx <= CARD_MAX_PX &&
    !isPlainBox(look)
  );
}
