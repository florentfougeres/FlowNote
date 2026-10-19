import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { setGrammarChecker, setSystemSpellcheck, type ParagraphResult } from "./grammar";
import { isTauri } from "../vault/tauriVault";
import { callNative, isNative } from "../vault/nativeVault";
import { usePersistentFlag } from "../hooks/usePersistentFlag";
import type { SpellChecker } from "../SettingsPage";

/**
 * Applies the spell checker chosen in the settings. The returned switch (toolbar
 * button) pauses it without changing the setting.
 */
export function useSpellChecking(chosen: SpellChecker) {
  const [on, setOn] = usePersistentFlag("flownote:spelling", true, ["on", "off"]);
  useEffect(() => {
    const spellChecker = on ? chosen : "off";
    // Grammalecte runs in the Tauri app, and in the native shell (FlowNote Swift).
    const grammalecte = (isTauri() || isNative()) && spellChecker === "grammalecte";
    const check = (paragraphs: string[]) => (isNative() ? callNative<ParagraphResult[]>("grammar_check", { paragraphs }) : invoke<ParagraphResult[]>("grammar_check", { paragraphs }));
    setGrammarChecker(grammalecte ? check : null);
    // Outside the desktop app, the Grammalecte choice falls back to the system checker.
    setSystemSpellcheck(spellChecker === "system" || (spellChecker === "grammalecte" && !isTauri() && !isNative()));
  }, [chosen, on]);
  return [on, () => setOn((current) => !current)] as const;
}
