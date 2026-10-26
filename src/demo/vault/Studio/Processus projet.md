---
icon: 🧭
tags: [studio, méthode]
---
# Processus projet

Comment se déroule un projet, du premier appel à la mise en ligne.

## Les étapes

```flow
st=>start: Premier appel
op1=>operation: Atelier de lancement
op2=>operation: Moodboard
cond1=>condition: Validé ?
op3=>operation: Maquettes
cond2=>condition: Validées ?
op4=>operation: Développement
e=>end: Mise en ligne

st->op1->op2->cond1
cond1(yes)->op3->cond2
cond1(no)->op2
cond2(yes)->op4->e
cond2(no)->op3
```

## Planning type d'un site vitrine

```mermaid
gantt
  dateFormat YYYY-MM-DD
  axisFormat %d/%m
  section Conception
    Lancement        :a1, 2026-11-02, 1d
    Moodboard        :a2, after a1, 3d
    Maquettes        :a3, after a2, 5d
  section Réalisation
    Développement    :b1, after a3, 8d
    Recette          :b2, after b1, 2d
  section Livraison
    Formation        :c1, after b2, 1d
```

## Échanges avec le client

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Studio
  C->>S: Demande
  S->>C: Devis
  C->>S: Acompte (30 %)
  S->>C: Maquettes
  C->>S: Retours
  S->>C: Mise en ligne
  C->>S: Solde
```

> [!example] Modèles
> Les réunions se notent avec le modèle [[Réunion]], les comptes rendus avec [[Compte rendu]].
