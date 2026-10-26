/**
 * Markdown samples written the way people write in Obsidian. `STYLE_BLOCKS` must
 * survive re-serialization byte for byte, even when the block is edited elsewhere.
 */

export const FULL_NOTE = `---
tags: [projet, carnet]
aliases:
  - Mon Carnet
created: 2026-10-13
---

# Titre principal

Un paragraphe avec du **gras**, de l'_italique_, du ~~barré~~, du ==surligné== et du \`code\`.
Il continue sur une deuxième ligne avec un [[Lien wiki]] et un [[Note#Section|alias]].

![[image.png]]

Un tag #idee/produit et un lien [Obsidian](https://obsidian.md "Site").
Un commentaire %%caché%% et des maths $e^{i\\pi} + 1 = 0$.

## Listes

- Premier
- Deuxième avec **gras**
  - Imbriqué
  - Encore
- Troisième

* Puces étoile
* Deuxième

1. Un
2. Deux
3. Trois

- [ ] Tâche à faire
- [x] Tâche faite
  - [ ] Sous-tâche

> Une citation
> sur deux lignes

> [!note] Un callout
> Avec du contenu.

> [!warning]- Toggle replié
> Contenu caché.
>
> - avec une liste

\`\`\`ts
const x = 1;
\`\`\`

~~~python
print("tilde")
~~~

$$
\\int_0^1 x\\,dx
$$

| A | B |
|---|---|
| 1 | 2 |

Une note de bas de page[^1].

[^1]: La note.

<div class="custom">HTML</div>

***

Fin du document avec une ligne coupée\\
et la suite.
`;

export const NO_FRONTMATTER = `Juste un paragraphe.

Et un autre sans saut de ligne final.`;

export const EMPTY_NOTE = ``;

export const ONLY_FRONTMATTER = `---
title: vide
---
`;

export const WEIRD_SPACING = `

# Titre précédé de lignes vides
Paragraphe collé au titre.



Paragraphe après trois lignes vides.

- liste
`;

/** Blocks that may be rewritten differently but must keep their meaning. */
export const MEANING_BLOCKS = ["Du `code coupé\nsur deux lignes` dans une phrase.", "> Citation\nligne paresseuse sans chevron"];

/** Blocks that the serializer must reproduce exactly. */
export const STYLE_BLOCKS = [
  "Un paragraphe avec du **gras**, de l'_italique_, du ~~barré~~, du ==surligné== et du `code`.",
  "Du __gras souligné__ et de l'*italique étoilé*.",
  "Un [[Lien wiki]], un [[Note#Section|alias]] et un embed ![[image.png]].",
  "Un lien [Obsidian](https://obsidian.md) et une URL nue https://example.com et <https://auto.link>.",
  "Un tag #idee/produit et un commentaire %%caché%%.",
  "Des maths $x^2$ et du ``code avec ` backtick``.",
  "# Titre 1",
  "### Titre 3",
  "Titre setext\n===",
  "- Premier\n- Deuxième\n  - Imbriqué\n- Troisième",
  "* Étoile\n* Deux",
  "1. Un\n2. Deux\n3. Trois",
  "1) Un\n2) Deux",
  "1. Un\n1. Un aussi",
  "- [ ] À faire\n- [x] Fait\n  - [ ] Sous-tâche",
  "- Paragraphe\n\n- Liste aérée",
  "> Une citation\n> sur deux lignes",
  "> [!note] Un callout\n> Avec du contenu.",
  "> [!warning]- Toggle replié\n> Contenu caché.\n>\n> - avec une liste",
  "> [!tip]+ Ouvert par défaut\n> Texte.",
  "```ts\nconst x = 1;\n```",
  "~~~python\nprint(\"tilde\")\n~~~",
  "````md\n```\nfence imbriquée\n```\n````",
  "---",
  "***",
  "| A | B |\n|---|---|\n| 1 | 2 |",
  "$$\nx\n$$",
  "<div>html</div>",
  "Ligne coupée\\\net la suite.",
  "Un texte avec a_b_c et 2*3 et [crochets] littéraux.",
  // Layouts found in real vaults.
  "- Parent\n\t- Enfant indenté par tabulation\n\t\t- Petit-enfant",
  "- Parent\n    - Enfant indenté par 4 espaces",
  "1.  Deux espaces après le marqueur\n2.  Suite",
  "- Serré\n- Puis aéré\n\n- Fin",
  " * Puce indentée\n * Deuxième",
  "```sh \necho espace après la fence\n```",
  "Un [lien](https://fr.wikipedia.org/wiki/Paris_(France)) avec parenthèses.",
  "Ligne avec espace final \nsuite indentée",
  "## Titre avec espace final ",
  "Titre setext\nsur deux lignes\n---",
  "*Issu de [l'article ](https://example.com) en italique.*",
];
