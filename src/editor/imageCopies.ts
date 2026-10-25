/**
 * Images of the vault shown in the editor, kept to copy them: outside the app
 * their address means nothing, so the copied HTML carries the image itself
 * (a `data:` address drawn from the image on screen). Keys: `embed:<target>`
 * for `![[image.png]]`, `src:<src>` for `![](image.png)`.
 */
const shown = new Map<string, WeakRef<HTMLImageElement>>();

export function rememberImage(key: string, img: HTMLImageElement) {
  shown.set(key, new WeakRef(img));
}

/** The image as a `data:` address, or null when it is not loaded (or cannot be read). */
function dataUrl(img: HTMLImageElement | undefined): string | null {
  if (!img?.complete || !img.isConnected) return null;
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    // An image from another site, which the canvas may not read.
    return null;
  }
}

/** In copied HTML, vault images (`<span class="embed">`, `<img src="relative">`) become the images themselves. */
export function inlineVaultImages(root: ParentNode) {
  for (const embed of root.querySelectorAll<HTMLElement>("span.embed[data-target]")) {
    const img = shown.get(`embed:${embed.dataset.target}`)?.deref();
    const url = dataUrl(img);
    if (!url || !img) continue;
    const copy = document.createElement("img");
    copy.src = url;
    copy.alt = img.alt;
    if (img.getAttribute("width")) copy.setAttribute("width", img.getAttribute("width")!);
    embed.replaceWith(copy);
  }
  for (const image of root.querySelectorAll("img")) {
    const src = image.getAttribute("src") ?? "";
    if (/^(https?|data):/i.test(src)) continue;
    const url = dataUrl(shown.get(`src:${src}`)?.deref());
    if (url) image.setAttribute("src", url);
  }
}
