# Déploiement de Mon Budget sur GitHub Pages

> **Modifier l'app** : le code source est dans `../src/` (`app.jsx`, `styles.css`, `index.template.html`).
> Ne modifie pas `index.html` à la main, il est généré. Depuis le dossier `app_budget` :
> `npm install` (une seule fois), puis `npm run build` — ou `npm run watch` pour reconstruire à chaque sauvegarde.
> Ensuite, renvoie `index.html` et `sw.js` sur GitHub.

## 1. Créer le projet Supabase
1. Va sur [supabase.com](https://supabase.com) → New project (gratuit)
2. SQL Editor → New query → colle le contenu de `supabase-setup.sql` → Run
3. Authentication → Providers → Email : laisse activé (désactive « Confirm email » si tu veux te connecter tout de suite sans validation)

## 2. Compléter la config Supabase
Ouvre `../src/app.jsx` et remplace les deux lignes tout en haut du fichier (puis lance `npm run build`) :
```
const SUPABASE_URL = "COLLE_TON_PROJECT_URL_ICI";
const SUPABASE_ANON_KEY = "COLLE_TA_CLE_ANON_ICI";
```
par tes vraies valeurs (Supabase → Settings → API).

## 3. Créer le dépôt GitHub
1. Va sur github.com, crée un compte si besoin (gratuit)
2. "New repository" → nomme-le par exemple `mon-budget` → Public → Create repository

## 4. Envoyer les fichiers
Sur la page du dépôt vide : "uploading an existing file" → glisse-dépose les fichiers de ce dossier
(`index.html`, `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`) → Commit changes.

## 5. Activer GitHub Pages
Settings (du dépôt) → Pages → sous "Build and deployment" :
- Source : "Deploy from a branch"
- Branch : `main`, dossier `/ (root)`
- Save

Attends ~1 minute. Ton URL apparaît en haut de cette même page, du type :
`https://TON-PSEUDO.github.io/mon-budget/`

## 6. Installer
- **iPhone** : ouvre l'URL dans Safari → Partager → "Sur l'écran d'accueil"
- **Windows** : ouvre l'URL dans Chrome ou Edge → une icône d'installation apparaît dans la barre d'adresse → "Installer"

Les deux utilisent le même compte Supabase : mêmes données, partout.
