---
icon: 📊
tags: [studio, compta]
objectif: 60000
---
# Comptabilité 2026

## Chiffre d'affaires

```plotly
data:
  - type: bar
    name: Facturé
    x: [Janv., Févr., Mars, Avr., Mai, Juin, Juil., Août, Sept., Oct.]
    y: [3800, 4200, 6100, 5200, 4800, 7300, 2100, 900, 6400, 5600]
  - type: scatter
    mode: lines+markers
    name: Objectif mensuel
    x: [Janv., Févr., Mars, Avr., Mai, Juin, Juil., Août, Sept., Oct.]
    y: [5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000]
layout:
  title: Chiffre d'affaires mensuel (€ HT)
```

## Répartition par type de projet

```plotly
data:
  - type: pie
    hole: 0.45
    labels: [Sites, Identités, Applications, Maintenance]
    values: [24500, 11200, 6800, 3900]
layout:
  title: 2026, en € HT
```

## Clients

```dataview
TABLE statut AS "Statut", ville AS "Ville", montant AS "Montant (€ HT)"
FROM "Clients"
WHERE montant > 0
SORT montant DESC
```

Par statut :

```dataview
LIST ville
FROM "Clients"
GROUP BY statut
```

## Tâches de la semaine

Toutes les tâches du vault à faire d'ici sept jours, la plus urgente d'abord :

```tasks
not done
due before in 7 days
sort by due
```

Les plus prioritaires, par projet :

```tasks
not done
priority is above medium
group by filename
```

Les tâches ouvertes des projets :

```dataview
TASK
FROM #projet
WHERE !completed
GROUP BY file.link
LIMIT 12
```
