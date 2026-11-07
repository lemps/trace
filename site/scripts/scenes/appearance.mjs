// Make it yours: themes with live previews, accent, density, the sidebar's pages,
// and the keyboard shortcut cheat sheet. Starts and ends in Dark.
import { setTheme, sleep } from "../lib/ui.mjs";

export const clip = { segments: [["start+0.3", "done", 1.15]] };

export async function setup(d) {
  await setTheme(d, "Dark");
  await d.click('button[aria-label="Settings"]');
  await sleep(500);
  await d.click("main button", "Appearance");
  await sleep(800);
}

export async function run(d, mark) {
  await sleep(1200);
  await d.click("main button", "Light");
  mark("light");
  await sleep(2200);
  await d.click("main button", "Paper");
  await sleep(1800);
  await d.click("main button", "Midnight");
  await sleep(1600);
  await d.click("main button", "Dark");
  await sleep(1000);
  await d.click("main button", "Rose");
  await sleep(1300);
  await d.click("main button", "Comfortable");
  await sleep(1300);
  await d.click("main button", "Standard");
  await d.click("main button", "Violet");
  await sleep(900);
  await d.click("main button", "Sidebar");
  mark("sidebar");
  await sleep(2000);
  await d.click('button[aria-label="Keyboard shortcuts"]');
  mark("cheat sheet");
  await sleep(3000);
  mark("done");
  await d.key("Escape");
  await sleep(300);
}
