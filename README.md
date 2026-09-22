# App JDR — Lanceur de dés

Application **front-only** (HTML / CSS / JavaScript, sans build ni dépendance) destinée à être hébergée sur **GitHub Pages**.

## Fonctionnalités

- Lancer **X dés à X faces** : de 1 à 100 dés, de 2 à 100 faces (raccourcis d4, d6, d8, d10, d12, d20, d100).
- **Colorer les dés avant le lancer** : sélectionner une couleur dans la palette (8 couleurs), cliquer sur les dés à marquer. Les couleurs sont conservées après le lancer, et les résultats sont regroupés par couleur avec sous-total.
- Total général, mise en évidence des résultats max (doré) et min (atténué), tri optionnel par valeur.
- Historique des 30 derniers lancers (conservé dans le navigateur via `localStorage`).
- Raccourci : `Entrée` ou `Espace` hors d'un champ pour relancer.
- Tirages via `crypto.getRandomValues` (uniformes, sans biais modulo).
- Thème clair / sombre automatique, responsive mobile.

## Lancer en local

Aucune installation : ouvrir `index.html` dans un navigateur suffit. Comme `app.js` est un module ES, certains navigateurs exigent un serveur HTTP local :

```bash
# à la racine du repo
python3 -m http.server 8080
# puis http://localhost:8080
```

## Tests

La logique pure (`dice.js`) est testée avec le test runner intégré de Node (≥ 18) :

```bash
node --test dice.test.js
```

## Déploiement GitHub Pages

Le workflow `.github/workflows/pages.yml` déploie le repo à chaque push sur `main`.

Le workflow active Pages automatiquement au premier déploiement. Si ce déploiement échoue, activer une fois *Settings → Pages → Build and deployment → Source* : **GitHub Actions**, puis relancer le workflow.

L'app sera ensuite disponible sur `https://<utilisateur>.github.io/<repo>/`.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Page unique |
| `style.css` | Styles (thèmes clair/sombre) |
| `dice.js` | Logique pure : pool de dés, tirage, regroupement par couleur |
| `app.js` | État, rendu DOM, persistance |
| `dice.test.js` | Tests unitaires de `dice.js` |
