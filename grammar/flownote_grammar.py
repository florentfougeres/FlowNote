# FlowNote grammar companion: French grammar and spelling checking with Grammalecte.
#
# Copyright (C) 2026 Florent Fougères
#
# This program is free software: you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation, either version 3 of the License, or (at your option) any later
# version. It is distributed WITHOUT ANY WARRANTY; see the GNU General Public
# License (LICENSE.txt, shipped with Grammalecte) for details.
#
# It runs as a separate process next to FlowNote (which talks to it through
# stdin/stdout) and is not part of FlowNote's MIT-licensed code.
#
# Protocol: one JSON object per line on stdin, one JSON answer per line on stdout.
#   {"id": 1, "paragraphs": ["texte…", …]}
#   → {"id": 1, "results": [{"grammar": [...], "spelling": [...]}, …]}
# A first line {"ready": true} is written once Grammalecte is loaded.

import json
import sys

import grammalecte

# Typographic rules flag every straight apostrophe or missing non-breaking space:
# too noisy for notes.
DISABLED_OPTIONS = ["typo", "apos", "nbsp", "esp", "unit"]


def grammar_error(error):
    return {
        "start": error["nStart"],
        "end": error["nEnd"],
        "message": error.get("sMessage", ""),
        "suggestions": list(error.get("aSuggestions", []))[:8],
        "rule": error.get("sRuleId", ""),
    }


def spelling_error(error):
    return {
        "start": error["nStart"],
        "end": error["nEnd"],
        "word": error.get("sValue", ""),
        "suggestions": list(error.get("aSuggestions", []))[:8],
    }


def main():
    checker = grammalecte.GrammarChecker("fr")
    engine = checker.getGCEngine()
    options = dict(engine.getOptions())
    for name in DISABLED_OPTIONS:
        options[name] = False
    engine.setOptions(options)
    checker.getParagraphErrors("Initialisation.")  # loads the rules once

    out = sys.stdout
    out.write(json.dumps({"ready": True}) + "\n")
    out.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            results = []
            for paragraph in request.get("paragraphs", []):
                grammar, spelling = checker.getParagraphErrors(paragraph, bSpellSugg=True)
                results.append({
                    "grammar": [grammar_error(e) for e in grammar],
                    "spelling": [spelling_error(e) for e in spelling],
                })
            answer = {"id": request.get("id"), "results": results}
        except Exception as error:  # an answer is always written, so the app never waits forever
            answer = {"id": None, "error": str(error)}
        out.write(json.dumps(answer, ensure_ascii=False) + "\n")
        out.flush()


if __name__ == "__main__":
    main()
