---
icon: 🧩
tags: [studio, code]
---
# Snippets

Les bouts de code que je recopie de projet en projet.

## CSS : une grille qui s'adapte

```css
.grille {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1.5rem;
}
```

## TypeScript : formater un prix

```typescript
export function prix(montant: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(montant);
}
```

## Python : renommer les photos d'un client

```python
from pathlib import Path

for i, photo in enumerate(sorted(Path("photos").glob("*.jpg")), start=1):
    photo.rename(photo.with_name(f"maison-pain-{i:02}.jpg"))
```

## Bash : mettre en ligne

```bash
npm run build && rsync -avz --delete dist/ studio@serveur:/var/www/maison-pain/
```

## HTML : un bouton accessible

<button type="button" style="padding: 10px 18px; border-radius: 8px; border: 0; background: #3f5e4b; color: white">Réserver</button>

```html
<button type="button" aria-label="Réserver votre pain">Réserver</button>
```

Raccourci à retenir : <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>P</kbd> ouvre la palette de commandes. H<sub>2</sub>O, 10<sup>3</sup>.
