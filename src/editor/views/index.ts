import type { NodeViewRenderer } from "@tiptap/core";
import type { BridgeRef } from "../bridge";
import { calloutView } from "./callout";
import { codeBlockView } from "./codeBlock";
import { imageView } from "./image";
import { listItemView } from "./listItem";
import { rawBlockView } from "./rawBlock";
import { wikilinkView } from "./wikilink";

/**
 * Node views for blocks that need controls outside the editable text, one
 * file each. None of the controls write anything to the file unless they
 * change the content (folding a callout is a view-only state).
 */

export function createNodeViews(bridge: BridgeRef): Record<string, NodeViewRenderer> {
  return {
    listItem: listItemView,
    callout: calloutView,
    codeBlock: codeBlockView,
    rawBlock: rawBlockView,
    wikilink: wikilinkView(bridge),
    image: imageView(bridge),
  };
}
