import { describe, expect, it } from "vitest";
import { ownAttachments, unusedAttachments } from "./attachments";
import { DEFAULT_CONFIG } from "./links";

const files = ["Site.md", "Autre.md", "attachments/a.png", "attachments/b.png", "attachments/c.png", "attachments/d.pdf", "global/e.png", "Plan.canvas"];
const pages: [string, string][] = [
  ["Site.md", "![[a.png]] [devis](attachments/d.pdf) ![[b.png]] ![[e.png]]\n"],
  ["Autre.md", "---\ncover: attachments/b.png\n---\n"],
  ["Plan.canvas", '{"nodes":[]}'],
];

describe("ownAttachments", () => {
  it("keeps the files only this note uses, in its attachment folder", () => {
    expect(ownAttachments("Site.md", pages, files, DEFAULT_CONFIG).sort()).toEqual(["attachments/a.png", "attachments/d.pdf"]);
  });

  it("finds none with an attachment folder for the whole vault", () => {
    expect(ownAttachments("Site.md", pages, files, { ...DEFAULT_CONFIG, attachmentFolderPath: "global" })).toEqual([]);
  });
});

describe("unusedAttachments", () => {
  it("lists the files no page names ", () => {
    expect(unusedAttachments(pages, files)).toEqual(["attachments/c.png"]);
  });
});
