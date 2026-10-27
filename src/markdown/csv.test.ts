import { describe, expect, it } from "vitest";
import { csvRows, pastedTable } from "./csv";

describe("csvRows", () => {
  it("reads quotes and picks the delimiter", () => {
    expect(csvRows('Nom;Prix\n"Pain; complet";3,5\n')).toEqual([
      ["Nom", "Prix"],
      ["Pain; complet", "3,5"],
    ]);
  });
});

describe("pastedTable", () => {
  it("turns cells copied from a spreadsheet into a table", () => {
    expect(pastedTable("Client\tMontant\nMaison Pain\t1 200\nLes Mots\t\n")).toBe(
      "| Client | Montant |\n| --- | --- |\n| Maison Pain | 1 200 |\n| Les Mots |  |\n",
    );
  });

  it("reads a CSV, escaping pipes and line breaks", () => {
    expect(pastedTable('a,b\n"x|y","1\n2"')).toBe("| a | b |\n| --- | --- |\n| x\\|y | 1<br>2 |\n");
  });

  it("leaves prose and single lines alone", () => {
    expect(pastedTable("Bonjour, ça va.\nOui, merci.")).toBeNull();
    expect(pastedTable("a\tb\tc")).toBeNull();
    expect(pastedTable("un, deux\ntrois")).toBeNull();
    expect(pastedTable("- un\n- deux")).toBeNull();
  });
});
