import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type BridgeRef, isImage } from "../bridge";
import { basename, dirname, resolveLink } from "../../vault/links";
import { element } from "./dom";
import { rememberImage } from "../imageCopies";

/** Shows in `img` the image at `src`: a web address, or a vault path relative to the note. */
export function showImage(img: HTMLImageElement, src: string, bridge: BridgeRef) {
  if (/^(https?:|data:|blob:)/.test(src)) {
    img.src = src;
    return;
  }
  let path = src;
  try {
    path = decodeURI(src);
  } catch {
    // keep the raw source
  }
  const folder = dirname(bridge.current.notePath);
  const candidate = path.startsWith("/") ? path.slice(1) : [folder, path].filter(Boolean).join("/");
  const normalized: string[] = [];
  for (const part of candidate.split("/")) {
    if (part === "..") normalized.pop();
    else if (part !== ".") normalized.push(part);
  }
  const resolved = resolveLink(normalized.join("/"), bridge.current.files) ?? resolveLink(basename(path), bridge.current.files);
  if (resolved && isImage(resolved)) void bridge.current.loadImage(resolved).then((url) => (img.src = url));
}

/** Markdown images `![alt](path)`: vault paths are relative to the note. */
export function imageView(bridge: BridgeRef): NodeViewRenderer {
  return ({ node }) => {
    const img = element("img");
    const render = (n: PMNode) => {
      img.alt = n.attrs.alt;
      rememberImage(`src:${n.attrs.src}`, img);
      showImage(img, String(n.attrs.src), bridge);
    };
    render(node);
    return {
      dom: img,
      update: (n) => {
        if (n.type !== node.type) return false;
        render(n);
        return true;
      },
    };
  };
}
