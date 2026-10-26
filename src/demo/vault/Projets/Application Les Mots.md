---
icon: 📚
tags: [projet, app, les-mots]
client: Librairie Les Mots
statut: devis
budget: 9500
---
# Application Les Mots

Une application web pour réserver un livre à la [[Librairie Les Mots]] et être prévenu quand il arrive. En attente de la réponse au devis.

> [!note] Périmètre du devis
> Réservation, notification par mail, tableau de bord pour la libraire. Pas de paiement.

## Parcours

```flow
st=>start: Le lecteur cherche un livre
cond=>condition: En stock ?
op1=>operation: Réserver en boutique
op2=>operation: Commander chez le distributeur
mail=>inputoutput: Mail « votre livre est arrivé »
e=>end: Retrait en librairie

st->cond
cond(yes)->op1->e
cond(no)->op2->mail->e
```

## Modèle de données

```json
{
  "reservation": {
    "isbn": "9782070360024",
    "lecteur": "sophie@example.com",
    "statut": "commandé",
    "creee_le": "2026-10-20"
  }
}
```

## Estimation

| Lot | Jours |
| --- | ---: |
| Recherche dans le catalogue | 4 |
| Réservation et mails | 6 |
| Tableau de bord | 5 |
| Tests et mise en ligne | 3 |

Voir aussi la grille dans [[Tarifs]].
