import { backend, hasBackend } from "../platform";
import { useEffect } from "react";
import { setGrammarChecker, setSystemSpellcheck, type ParagraphResult } from "./grammar";
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
    const grammalecte = hasBackend() && spellChecker === "grammalecte";
    setGrammarChecker(grammalecte ? (paragraphs) => backend<ParagraphResult[]>("grammar_check", { paragraphs }) : null);
    // Outside the desktop app, the Grammalecte choice falls back to the system checker.
    setSystemSpellcheck(spellChecker === "system" || (spellChecker === "grammalecte" && !hasBackend()));
  }, [chosen, on]);
  return [on, () => setOn((current) => !current)] as const;
}
