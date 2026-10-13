/** ProseMirror JSON, as produced by `Node.toJSON()` and accepted by `schema.nodeFromJSON()`. */
export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMJSON[];
  text?: string;
  marks?: PMMark[];
}
