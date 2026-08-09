# Sudoku

Jeu de Sudoku en PWA (application web installable) : 5 niveaux, jouable hors ligne,
sans publicité, sans compte, sans dépendance externe.

## Fonctionnalités

- **5 niveaux** : Facile, Moyen, Difficile, Expert, Diabolique. La difficulté n'est pas
  seulement le nombre d'indices : chaque grille est notée par un solveur logique
  (singletons nus/cachés, candidats verrouillés, paires nues/cachées) et rejetée si elle
  ne correspond pas au niveau demandé.
- **Solution unique garantie** pour chaque grille.
- Notes (petits chiffres), annulation illimitée, gomme, indices.
- Surlignage de la ligne / colonne / bloc et de tous les chiffres identiques.
- Erreurs signalées en rouge, compteur d'erreurs.
- Chronomètre avec pause (la grille est masquée).
- **Sauvegarde automatique** : on peut fermer l'app et reprendre plus tard.
- Statistiques par niveau : parties gagnées, meilleur temps, temps moyen.
- Thème clair / sombre automatique, gestion des encoches (safe areas), retour haptique.
- Clavier pris en charge sur ordinateur : `1`–`9`, `Backspace`, `N` (notes), `H` (indice), flèches.

## Tester sur l'ordinateur

```bash
node serve.js          # puis ouvrir http://localhost:8080
```

## Installer sur l'iPhone

L'app s'installe **sans App Store et sans compte développeur Apple**.

### Option A — hébergement gratuit (recommandé, fonctionne hors ligne)

iOS n'active le mode hors ligne (service worker) que sur une adresse **HTTPS**.
Il faut donc publier le dossier une fois :

1. **Netlify Drop** — le plus rapide, aucune installation :
   aller sur <https://app.netlify.com/drop> et glisser-déposer le dossier `sudoku`.
   Une adresse `https://…netlify.app` est générée immédiatement.
2. **GitHub Pages** — si le projet est sur GitHub :
   ```bash
   git init && git add -A && git commit -m "Sudoku"
   git branch -M main
   git remote add origin git@github.com:<utilisateur>/sudoku.git
   git push -u origin main
   ```
   puis dans *Settings → Pages*, choisir la branche `main` et le dossier `/ (root)`.

Ensuite, sur l'iPhone :

1. Ouvrir l'adresse **dans Safari** (obligatoire, Chrome iOS ne sait pas installer).
2. Bouton **Partager** (le carré avec la flèche) → **Sur l'écran d'accueil** → **Ajouter**.
3. L'icône apparaît sur l'écran d'accueil. Le jeu s'ouvre en plein écran, sans barre
   d'adresse, et fonctionne **sans connexion**.

### Option B — test rapide sur le réseau local

```bash
node serve.js
```
La commande affiche une adresse du type `http://192.168.1.20:8080`. Depuis l'iPhone
connecté au même Wi-Fi, ouvrir cette adresse dans Safari. On peut l'ajouter à l'écran
d'accueil, mais comme ce n'est pas du HTTPS, **le mode hors ligne ne fonctionnera pas** :
le Mac devra faire tourner `serve.js` à chaque partie. Pratique pour essayer, pas pour
jouer au quotidien.

### Option C — vraie app native (facultatif)

Pour publier sur l'App Store, ce même code peut être empaqueté avec
[Capacitor](https://capacitorjs.com/) (`npx cap add ios`), mais cela demande un Mac avec
Xcode et un compte développeur Apple à 99 €/an. La PWA suffit pour un usage personnel.

## Structure

```
index.html               écrans (accueil, jeu, victoire, statistiques)
css/style.css            thème clair/sombre, grille, pavé numérique
js/sudoku.js             moteur : génération, unicité, notation de difficulté
js/app.js                interface, sauvegarde, chronomètre, statistiques
manifest.webmanifest     métadonnées d'installation
sw.js                    service worker (fonctionnement hors ligne)
icons/                   icônes PNG (générées par tools/make-icons.js)
serve.js                 serveur statique local
```

## Mettre à jour l'app installée

Après modification des fichiers, incrémenter `VERSION` dans [sw.js](sw.js)
(`sudoku-v1` → `sudoku-v2`) et republier : l'ancien cache est purgé au prochain lancement.

Pour régénérer les icônes : `node tools/make-icons.js`.
