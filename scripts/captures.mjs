/**
 * Captures of the in-app documentation (src/docs/images/*.light.webp and
 * *.dark.webp), on the demo vault, in a 1280×800 window at density 2: the
 * pages 1600 px wide, the close-ups (menu-slash, poignee) at full density.
 * Uses the Google Chrome installed on the Mac, through playwright-core.
 *   npm run captures              all of them
 *   npm run captures -- graphe    some of them
 */
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { writeFileSync, mkdirSync } from "node:fs";

const only = process.argv.slice(2);
const out = new URL("../src/docs/images", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const wait = (page, ms) => page.waitForTimeout(ms);

async function openDemo(page) {
  await page.goto(base);
  await page.getByRole("button", { name: /Essayer avec un exemple/ }).click();
  await page.locator(".sidebar-icon[aria-label=\"Accueil\"]").waitFor();
  await wait(page, 1200);
}
/** A view of the sidebar's rows of icons (Accueil, Tâches, Liens, Graphe, Réglages…), by its name. */
const nav = (page, label) => page.locator(`.sidebar-icon[aria-label="${label}"]`).first().click();
const pageRow = (page, label) => page.locator(".page-name", { has: page.locator(".page-label", { hasText: new RegExp(`^${label}$`) }) }).first();
async function expand(page, label) {
  const toggle = pageRow(page, label).locator("xpath=..").locator(".page-toggle");
  if ((await toggle.getAttribute("aria-label")) === "Déplier") await toggle.click();
}
async function openPage(page, label, ms = 1500) {
  await pageRow(page, label).click();
  await wait(page, ms);
}
/** Puts the cursor at the end of a block's text: a click for the focus, then the selection there (ProseMirror reads it). */
async function clickEnd(page, locator) {
  await locator.click();
  await locator.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) if (walker.currentNode.textContent.trim()) last = walker.currentNode;
    const range = document.createRange();
    range.setStart(last, last.textContent.length);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.waitForTimeout(150);
}
/** The mouse out of the way: no handle nor hover state in the picture. */
const rest = (page) => page.mouse.move(1279, 799);

const SHOTS = {
  accueil: async (page) => {
    // A few pages opened first: the "Récents" card lists them.
    await expand(page, "Projets");
    await expand(page, "Site Maison Pain");
    for (const label of ["Clients", "Présentation de la maquette", "Journal", "Site Maison Pain"]) await openPage(page, label, 900);
    await nav(page, "Accueil");
    await wait(page, 1200);
  },
  editeur: async (page) => {
    await expand(page, "Projets");
    await openPage(page, "Site Maison Pain");
  },
  "split-view": async (page) => {
    await expand(page, "Projets");
    await openPage(page, "Site Maison Pain");
    await expand(page, "Clients");
    await pageRow(page, "Maison Pain").click({ modifiers: ["Alt"] });
    await wait(page, 1500);
  },
  "menu-slash": {
    clip: true,
    run: async (page) => {
      await expand(page, "Projets");
      await openPage(page, "Site Maison Pain");
      const para = page.locator(".ProseMirror p", { hasText: "Site vitrine de la boulangerie" });
      await clickEnd(page, para);
      await page.keyboard.press("Enter");
      await page.keyboard.type("/");
      await wait(page, 600);
      const box = await para.boundingBox();
      const menu = await page.locator(".slash-menu").boundingBox();
      // The paragraph above, the "/" line, then the menu.
      const top = Math.max(0, Math.min(box.y - 8, menu.y - 90));
      return { x: menu.x - 20, y: top, width: 450, height: 440 };
    },
  },
  poignee: {
    clip: true,
    run: async (page) => {
      await expand(page, "Projets");
      await openPage(page, "Site Maison Pain");
      const item = page.locator(".ProseMirror li", { hasText: "Maquette de la page d'accueil" });
      const heading = page.locator(".ProseMirror h2", { hasText: "Étapes" });
      const box = await item.boundingBox();
      await page.mouse.move(box.x + 200, box.y + 12);
      await wait(page, 500);
      const h = await heading.boundingBox();
      return { x: h.x - 58, y: h.y - 6, width: 400, height: 165 };
    },
  },
  reglages: async (page) => {
    await expand(page, "Projets");
    await nav(page, "Réglages");
    await wait(page, 800);
  },
  "base-tableau": async (page) => {
    await openPage(page, "Clients", 2000);
  },
  "base-kanban": async (page) => {
    await openPage(page, "Clients", 2000);
    await page.getByRole("tab", { name: /Kanban/ }).or(page.locator("button", { hasText: /^Kanban$/ })).first().click();
    await wait(page, 1000);
  },
  "base-calendrier": async (page) => {
    await openPage(page, "Clients", 2000);
    await page.getByRole("tab", { name: /Rendez-vous/ }).or(page.locator("button", { hasText: /^Rendez-vous$/ })).first().click();
    await wait(page, 1000);
  },
  croquis: async (page) => {
    await expand(page, "Projets");
    await expand(page, "Site Maison Pain");
    await openPage(page, "Arborescence", 4000);
  },
  git: async (page) => {
    await expand(page, "Projets");
    await openPage(page, "Site Maison Pain");
    const line = page.locator(".ProseMirror p", { hasText: "Site vitrine de la boulangerie" });
    await clickEnd(page, line);
    await page.keyboard.type(" Mise en ligne prévue en décembre.");
    await wait(page, 2500);
    await page.keyboard.press("Meta+Shift+G");
    await wait(page, 1500);
    await page.getByText("Site Maison Pain.md", { exact: false }).last().click();
    await wait(page, 1200);
  },
  graphe: async (page) => {
    await expand(page, "Projets");
    await nav(page, "Graphe");
    await wait(page, 5000);
  },
  liens: async (page) => {
    await expand(page, "Projets");
    await nav(page, "Liens");
    await wait(page, 1200);
  },
  mindmap: async (page) => {
    await expand(page, "Projets");
    await expand(page, "Identité Vélo Rouge");
    await openPage(page, "Pistes de logo", 2500);
  },
  presentation: async (page) => {
    await expand(page, "Projets");
    await expand(page, "Site Maison Pain");
    await openPage(page, "Présentation de la maquette", 3000);
  },
  tache: async (page) => {
    await nav(page, "Tâches");
    await wait(page, 1200);
    await page.getByText("Photos du fournil").first().click();
    await wait(page, 1500);
  },
  "taches-liste": async (page) => {
    await nav(page, "Tâches");
    await wait(page, 1500);
  },
  "taches-agenda": async (page) => {
    await expand(page, "TaskNotes");
    await expand(page, "Views");
    await openPage(page, "agenda-default", 1500);
  },
  "taches-tableau": async (page) => {
    await expand(page, "TaskNotes");
    await expand(page, "Views");
    await openPage(page, "kanban-default", 1500);
  },
};

// The app, served by Vite on a free port for the time of the captures.
const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: CHROME });
const converter = await browser.newPage();
/** PNG bytes → WebP bytes, through a canvas (width: the size wanted, or the PNG's own). */
async function toWebp(png, width) {
  const url = `data:image/png;base64,${png.toString("base64")}`;
  const data = await converter.evaluate(
    async ({ url, width }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const w = width ?? img.naturalWidth;
      const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/webp", 0.86);
    },
    { url, width },
  );
  return Buffer.from(data.split(",")[1], "base64");
}

let failed = false;
for (const [name, shot] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme, locale: "fr-FR" });
    const page = await context.newPage();
    try {
      await openDemo(page);
      const run = typeof shot === "function" ? shot : shot.run;
      const clip = await run(page);
      if (!clip && name !== "poignee") await rest(page);
      await wait(page, 400);
      const png = await page.screenshot({ type: "png", ...(clip ? { clip } : {}) });
      writeFileSync(`${out}/${name}.${scheme}.webp`, await toWebp(png, clip ? undefined : 1600));
      console.log("ok", name, scheme);
    } catch (error) {
      console.log("ÉCHEC", name, scheme, String(error).split("\n")[0]);
      failed = true;
    }
    await context.close();
  }
}
await browser.close();
await server.close();
if (failed) process.exit(1);
