---
tags: [veille, a11y]
---
# Accessibilité

Ce que je vérifie avant chaque mise en ligne. Le [[Cahier des charges#Contraintes]] de Maison Pain l'exige.

> [!check] Avant la mise en ligne
> - [ ] Contraste de 4,5:1 au moins pour le texte
> - [ ] Tout se fait au clavier, le focus est visible
> - [ ] Chaque image a un texte alternatif
> - [ ] Les boutons font 44 × 44 px au moins
> - [ ] La page reste lisible zoomée à 200 %

> [!bug] Erreur fréquente
> Un bouton fait avec un `<div>` : pas de focus, pas de `Entrée`. Toujours un `<button>`.

Référence : [RGAA 4.1](https://accessibilite.numerique.gouv.fr).
