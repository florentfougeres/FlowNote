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
    // Grammalecte runs in the desktop app (Tauri) or the native shell (Swift).
    const backend = isTauri() ? "tauri" : isNative() ? "native" : null;
    const grammalecte = backend !== null && spellChecker === "grammalecte";
    setGrammarChecker(
      grammalecte ? (paragraphs) => (backend === "tauri" ? invoke<ParagraphResult[]>("grammar_check", { paragraphs }) : callNative<ParagraphResult[]>("grammar_check", { paragraphs })) : null,
    );
    // Elsewhere, the Grammalecte choice falls back to the system checker.
    setSystemSpellcheck(spellChecker === "system" || (spellChecker === "grammalecte" && backend === null));
  }, [chosen, on]);
  return [on, () => setOn((current) => !current)] as const;
}
