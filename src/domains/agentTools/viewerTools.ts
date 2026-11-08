import type Anthropic from "@anthropic-ai/sdk";
import { useBrowserStore } from "@/domains/browser/store";
import { useGalleryStore } from "@/domains/gallery/store";
import { browserOpen } from "@/ipc/browser";
import { galleryShow } from "@/ipc/gallery";

// Two ways an agent shows the user something beside its chat: a web page in the
// workspace's Browser tab (its dev server, docs), and a folder of images in its
// Gallery tab. Both check their input backend-side and say what was wrong.

export const OPEN_BROWSER: Anthropic.Tool = {
  name: "open_browser",
  description:
    "Show the user a web page in this workspace's Browser tab in trace, beside your chat: typically the dev server you started (http://localhost:5173) or docs you want them to look at. The page loads in a separate, isolated browser view the user can navigate (address bar, back, forward, reload, open in their own browser). Only http and https URLs; localhost and other loopback addresses open quietly, any other host opens with a notice telling the user you opened it. By default it replaces the page in the tab's current page; pass new_tab to keep that page and open another (up to 8 are kept). You can't read the page back: describe what to look at in your reply.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The full URL, with its scheme, e.g. http://localhost:5173/settings.",
      },
      title: {
        type: "string",
        description: "Optional: what the page's tab is called. Defaults to the page's own title.",
      },
      new_tab: {
        type: "boolean",
        description: "Open in a new page of the Browser tab instead of the current one.",
      },
    },
    required: ["url"],
  },
};

export const SHOW_IMAGES: Anthropic.Tool = {
  name: "show_images",
  description:
    "Show the user a set of images in this workspace's Gallery tab in trace: screenshots you took, charts, icons or renders you generated. Name a folder (its images are shown, and new or removed files appear as they change) or a list of image files. Paths may be absolute or relative to your working folder. Types: png, jpg/jpeg, gif, webp, svg, bmp, avif; files over 25 MB are left out and a set shows at most 2,000 images. The user sees a thumbnail grid and can open each full size, zoom, compare two side by side, and open them from there. Each call adds a new set, listed newest first; you can't read the images back through this tool.",
  input_schema: {
    type: "object",
    properties: {
      paths: {
        type: "array",
        items: { type: "string" },
        description: "A folder, or image files (and folders), to show.",
      },
      title: {
        type: "string",
        description: "Optional: what the set is called. Defaults to the folder's name.",
      },
      recursive: {
        type: "boolean",
        description: "Include images in subfolders too. Defaults to false.",
      },
      glob: {
        type: "string",
        description:
          'Optional: only files matching this pattern, e.g. "*.png" or "shots/**/*.webp" (relative to the folder).',
      },
    },
    required: ["paths"],
  },
};

export const VIEWER_TOOLS: Anthropic.Tool[] = [OPEN_BROWSER, SHOW_IMAGES];

const VIEWER_TOOL_NAMES = new Set(VIEWER_TOOLS.map((t) => t.name));

export function isViewerTool(name: string): boolean {
  return VIEWER_TOOL_NAMES.has(name);
}

type Args = Record<string, unknown>;

function args(input: unknown): Args {
  return typeof input === "object" && input !== null ? (input as Args) : {};
}

const str = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : "");

async function runOpenBrowser(a: Args, caller: string): Promise<string> {
  if (!caller) throw new Error("trace couldn't tell which agent this page is for.");
  const url = str(a, "url");
  if (!url) throw new Error("Give a url to open, e.g. http://localhost:5173.");
  const opened = await browserOpen(caller, url, {
    title: str(a, "title") || null,
    newTab: a.new_tab === true,
    by: "agent",
  });
  const browser = useBrowserStore.getState();
  browser.notify(caller, opened.page.id, opened.reach === "external" ? opened.host : null);
  void browser.reload(caller);
  const where =
    opened.reach === "external" ? ` The user sees a notice that you opened ${opened.host}.` : "";
  return `Opened ${opened.page.url} in the Browser tab (page ${opened.page.id}).${where}`;
}

/** Paths from `paths` (an array, or one string), or the older single `path`. */
function pathsOf(a: Args): string[] {
  const raw = a.paths ?? a.path;
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((p): p is string => typeof p === "string");
  return [];
}

async function runShowImages(a: Args, caller: string): Promise<string> {
  if (!caller) throw new Error("trace couldn't tell which agent these images are for.");
  const paths = pathsOf(a);
  if (paths.length === 0) throw new Error("Give paths: a folder of images, or image files.");
  const { set, listing } = await galleryShow(caller, paths, {
    title: str(a, "title") || null,
    recursive: a.recursive === true,
    glob: str(a, "glob") || null,
  });
  useGalleryStore.getState().notify(caller);
  void useGalleryStore.getState().reload(caller);
  const n = listing.images.length;
  const notes: string[] = [];
  if (listing.truncated) notes.push(`only the first ${n} are shown`);
  if (listing.tooLarge > 0) notes.push(`${listing.tooLarge} over 25 MB were left out`);
  const extra = notes.length ? ` (${notes.join("; ")})` : "";
  return `Showing ${n} image${n === 1 ? "" : "s"} as "${set.title}" in the Gallery tab${extra}. New or removed files in the folder show up there by themselves.`;
}

/** Run `open_browser` or `show_images` for the agent `caller` (its workspace id). */
export function runViewerTool(name: string, input: unknown, caller: string): Promise<string> {
  const a = args(input);
  return name === OPEN_BROWSER.name ? runOpenBrowser(a, caller) : runShowImages(a, caller);
}
