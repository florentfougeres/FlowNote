---
icon: 📋
aliases:
  - CDC Maison Pain
tags: [maison-pain, doc/cahier-des-charges]
version: 3
relu: true
---
# Cahier des charges

Site de la boulangerie [[Maison Pain]], version 3, relue avec Hélène. %%Version 2 : la livraison a été retirée.%%

[TOC]

## Contexte

Maison Pain vend environ 400 pains par jour, dont un quart réservés par téléphone[^tel]. Le téléphone sonne pendant le coup de feu du matin : la réservation en ligne doit **soulager la boutique**, pas ajouter du travail.

> [!info] Chiffres donnés par Hélène
> - 400 pains par jour, 650 le samedi
> - 100 réservations par jour, surtout pour le samedi
> - 3 personnes en boutique le matin

## Objectifs

1. Donner les horaires et le pain du jour en un coup d'œil
2. Permettre de réserver la veille, avant 20 h
3. Laisser Hélène tout modifier seule, depuis son téléphone

Hors du périmètre : ~~la livraison~~, le paiement en ligne (voir la [[Lancement#Décisions|décision du lancement]]).

## Fonctionnalités

### Pages

- **Accueil** : horaires, pain du jour, bouton « Réserver »
- **Nos pains** : la gamme, avec photos
  - pains de tradition
  - pains spéciaux (seigle, épeautre, ==🟢sans gluten==)
  - viennoiseries du week-end
- **La maison** : l'histoire, l'équipe, le fournil
- **Contact** : plan, téléphone, formulaire

### Réservation

Le client choisit ses pains, puis un créneau de retrait. Il reçoit un SMS de rappel la veille au soir[^sms].

> [!warning] Point d'attention
> Un pain réservé et jamais retiré est perdu. Au bout de deux oublis, le numéro est bloqué pour un mois.

#### Créneaux

| Créneau | Du lundi au vendredi | Samedi |
| :--- | :---: | :---: |
| 7 h – 9 h | ✅ | ✅ |
| 11 h – 13 h | ✅ | ✅ |
| 16 h – 19 h | ✅ | ❌ |

### Administration

Hélène se connecte depuis son téléphone pour :

- [ ] changer le pain du jour
- [ ] fermer un créneau complet
- [ ] voir la liste des réservations du lendemain, imprimable

## Contraintes

> [!danger] Accessibilité
> Le site doit respecter le RGAA : contrastes, taille des boutons, navigation au clavier. Beaucoup de clients sont âgés.

> [!question]- Et si le site tombe un samedi matin ?
> Le téléphone reste affiché en haut de chaque page. Les réservations de la veille sont envoyées par mail à 20 h :\
> même sans site, la boutique a sa liste.

> [!success] Hébergement
> Hébergement en France, chez un hébergeur sobre en énergie. Coût prévu : 8 € par mois.

***

## Glossaire

- **Tradition** : pain de tradition française, sans additif, selon le décret de 1993.
- **Coup de feu** : le moment où tout le monde arrive en même temps, entre 7 h 30 et 8 h 30.

[^tel]: Chiffres d'octobre, relevés par Hélène pendant deux semaines.
[^sms]: Le SMS coûte environ 5 centimes.
    On l'envoie seulement si le client a donné son numéro.
