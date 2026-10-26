---
icon: 📓
---
# Journal

Une note par jour, quand il y a quelque chose à dire. Le modèle [[Modèles/Journal|Journal]] les commence.

```dataview
TABLE WITHOUT ID file.link AS "Jour", humeur AS "Humeur"
FROM "Journal"
SORT file.name DESC
LIMIT 10
```

Les idées notées dans le journal :

```dataview
LIST
FROM #idée
WHERE file.name != this.file.name
```
