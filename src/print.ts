/**
 * PDF export through the system's print panel (macOS: "PDF" ▸ "Enregistrer au
 * format PDF"), so text stays vector and selectable.
 *
 * - A note is printed as it is shown: the print style sheet hides the app
 *   around the page and lets the page run over several sheets.
 * - Slides, drawings and mind maps are rendered into a sheet container, alone
 *   on the printed pages, with a page size of their own.
 *
 * In the desktop app the panel opens without blocking, so nothing is undone
 * after printing: the container is hidden on screen and emptied by the next
 * export.
 */

function sheetRoot(): HTMLElement {
  let root = document.getElementById("print-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "print-root";
    document.body.append(root);
  }
  return root;
}

function setPageRule(css: string) {
  let style = document.getElementById("print-page") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "print-page";
    document.head.append(style);
  }
  style.textContent = `@media print { ${css} }`;
}

function imagesLoaded(root: HTMLElement) {
  return Promise.all(
    [...root.querySelectorAll("img")].map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
}

async function print(title: string) {
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  // The panel proposes the document title as the file name.
  const previous = document.title;
  document.title = title;
  try {
    await Promise.resolve(window.print() as unknown);
  } finally {
    window.setTimeout(() => (document.title = previous), 1000);
  }
}

/** Prints the open note as shown on screen. */
export async function printNote(title: string) {
  sheetRoot().replaceChildren();
  document.documentElement.dataset.print = "note";
  setPageRule("@page { size: A4; margin: 16mm 18mm; }");
  await print(title);
}

/**
 * Prints slides, one per page of the slide's size. `slides` are Marp
 * `<section>`s, `css` their theme (scoped to `div.marpit`).
 */
export async function printSlides(title: string, slides: string[], css: string) {
  const root = sheetRoot();
  root.className = "print-slides";
  // The theme is kept to the printed slides, away from the app's own previews.
  root.innerHTML = `<style>${css.replace(/div\.marpit/g, "#print-root div.marpit")}</style><div class="marpit">${slides.join("")}</div>`;
  document.documentElement.dataset.print = "sheet";
  // Measured from the first slide (1280×720 by default, or the deck's `size`).
  const first = root.querySelector<HTMLElement>("div.marpit > section");
  const width = first?.offsetWidth || 1280;
  const height = first?.offsetHeight || 720;
  setPageRule(`@page { size: ${width}px ${height}px; margin: 0; }`);
  await imagesLoaded(root);
  await print(title);
}

/** Prints an image (an SVG drawing or mind map) alone, fitted to an A4 page turned its way. */
export async function printImage(title: string, image: Element, width: number, height: number) {
  const root = sheetRoot();
  root.className = "print-image";
  const frame = document.createElement("div");
  frame.className = "print-image-frame";
  frame.append(image);
  root.replaceChildren(frame);
  document.documentElement.dataset.print = "sheet";
  const landscape = width > height;
  setPageRule(`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; } #print-root .print-image-frame { width: ${landscape ? 273 : 186}mm; height: ${landscape ? 186 : 273}mm; }`);
  await imagesLoaded(root);
  await print(title);
}

/**
 * Prints an element of a known size (a mind map) alone, scaled to fill an A4
 * page turned its way (at most twice its size).
 */
export async function printElement(title: string, element: HTMLElement, width: number, height: number) {
  const root = sheetRoot();
  root.className = "print-image";
  const landscape = width > height;
  // The printable area in CSS pixels (96 per inch).
  const px = (mm: number) => (mm * 96) / 25.4;
  const scale = Math.min(px(landscape ? 273 : 186) / width, px(landscape ? 186 : 273) / height, 2);
  Object.assign(element.style, { transform: `scale(${scale})`, transformOrigin: "0 0" });
  const box = document.createElement("div");
  Object.assign(box.style, { width: `${width * scale}px`, height: `${height * scale}px`, overflow: "hidden" });
  box.append(element);
  const frame = document.createElement("div");
  frame.className = "print-image-frame";
  frame.append(box);
  root.replaceChildren(frame);
  document.documentElement.dataset.print = "sheet";
  setPageRule(`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; } #print-root .print-image-frame { width: ${landscape ? 273 : 186}mm; height: ${landscape ? 186 : 273}mm; }`);
  await print(title);
}
