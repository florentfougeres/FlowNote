import { createContext } from "react";
import type { IconName } from "./Icon";

/**
 * A page's toolbar drawn by the native shell (Liquid Glass buttons) instead of
 * in HTML: each ToolButton registers here, and the shell calls it back.
 */
export interface NativeTool {
  icon: IconName;
  label: string;
  /** A toggle (shown pressed when on); undefined for a plain button. */
  active?: boolean;
  disabled?: boolean;
  /** Tools of a ToolGroup (drawing tools): one of them is chosen. */
  group?: string;
  run: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export interface NativeTools {
  set(id: string, tool: NativeTool): void;
  remove(id: string): void;
}

export const NativeToolsContext = createContext<NativeTools | null>(null);
export const ToolGroupContext = createContext<string | null>(null);
