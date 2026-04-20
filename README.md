# CORE IA ULTIMATE

Système personnel intelligent — PWA installable (mobile + desktop), 100% local par défaut.
Finances · Projets · Idées · Agent IA (semi-autonome, extensible vers autonome).

## Stack

- **Frontend** : React 18 + Vite + PWA (service worker + manifest + cache runtime API).
- **Backend**  : Node.js + Express + SQLite (better-sqlite3).
- **IA**       : interface `AIProvider` unique.
  - `stub` (défaut) : heuristiques internes, offline, zéro dépendance réseau.
  - `ollama` : LLM local via `http://localhost:11434` — bascule par `.env`.

## Arborescence

```
core-ia-ultimate/
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── data/                         # SQLite (créé au 1er lancement)
│   └── src/
│       ├── server.js                 # Express app + boucle suggestions
│       ├── db.js                     # Schéma SQLite + migrations implicites
│       ├── routes/
│       │   ├── finances.js           # /finances
│       │   ├── projects.js           # /projects (+ tasks)
│       │   ├── ideas.js              # /ideas  (+ convert → project)
│       │   ├── ai.js                 # /ai/analyze /ai/logs /ai/daily
│       │   ├── suggestions.js        # /suggestions (semi-autonome)
│       │   └── actions.js            # /actions (validation + historique)
│       └── services/
│           ├── aiProvider.js         # stub intelligent + hook Ollama
│           ├── scoring.js            # scores finance & productivité + anomalies
│           ├── suggestionsEngine.js  # analyse périodique → actions suggérées
│           └── actionExecutor.js     # exécute une action validée
└── frontend/
    ├── package.json
    ├── vite.config.js                # PWA + proxy /api → :4000
    ├── index.html
    ├── public/icons/                 # SVG 192 + 512 (manifest)
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── lib/api.js                # client REST
        ├── components/ (Sidebar, TopBar, Card)
        ├── pages/ (Dashboard, Finances, Projets, Idees, IA)
        └── styles/theme.css          # thème dark premium
```

## Installation & lancement

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev          # port 4000
```

La DB `backend/data/core.db` est créée automatiquement au premier démarrage.
Le moteur de suggestions tourne en tâche de fond (cycle toutes les 10 min + cycle initial à 30s).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev          # port 5173
```

Ouvre http://localhost:5173. Le frontend proxifie `/api/*` → `http://localhost:4000/*`.

### 3. Build production (pour installer la PWA)

```bash
cd frontend
npm run build
npm run preview      # sert le build buildé (localhost:4173)
```

> En dev, la PWA est active (`devOptions.enabled = true`). En prod (`npm run build`), le service worker est optimisé et la PWA est pleinement installable.

## Installer la PWA

### Desktop (Chrome / Edge / Brave)
1. Lance le frontend en build (`npm run preview`) ou en dev.
2. Dans la barre d'adresse, clique sur l'icône **Installer** (à droite de l'URL).
3. L'app s'ouvre dans sa propre fenêtre, avec icône dans le menu démarrer.

### Mobile iOS (Safari)
1. Ouvre l'app dans Safari.
2. Bouton **Partager** → **Sur l'écran d'accueil**.
3. L'icône apparaît. Ouverture plein écran, offline partiel.

### Mobile Android (Chrome)
1. Ouvre l'app dans Chrome.
2. Menu (⋮) → **Installer l'application** (ou bannière automatique).
3. L'icône est placée sur l'écran d'accueil.

> Pour tester depuis un autre appareil sur ton réseau, lance `npm run preview -- --host` côté frontend et mets `VITE_API_URL` vers `http://IP-DE-TON-PC:4000` (ou adapte le proxy).

## Fonctionnement

### CORE IA — contrat JSON strict

Toute entrée utilisateur passée à `POST /ai/analyze` renvoie :

```json
{
  "type": "finance | projet | idee | tache | libre",
  "analyse": "…",
  "structure": "…",
  "ameliorations": "…",
  "actions": ["…", "…"]
}
```

Le stub détecte automatiquement le type d'entrée (`detectEntryType`) et applique une heuristique dédiée. Le hook Ollama (`AI_PROVIDER=ollama`) utilise `format: "json"` pour garantir la même forme.

### Agent semi-autonome

Toutes les 10 min (+ cycle initial), `suggestionsEngine` scanne la DB et produit des suggestions dans `ai_actions (statut='suggere')` :

- anomalies financières (max > 3× médiane par catégorie),
- projets stagnants (>7j à `todo`),
- idées non converties (>3j),
- score productivité / financier bas.

L'UI (Dashboard + page CORE IA) les affiche avec **Valider** / **Rejeter**.

### Agent autonome (base)

- **Actions suggérées** → `ai_actions.statut = 'suggere'`.
- **Validation** → `executeAction(...)` applique une mutation concrète (relancer un projet, convertir une idée, etc.) puis marque `'execute'`.
- **Rejet** → `'rejete'`.
- **Historique des décisions** : onglet dédié dans la page CORE IA.

Extension future : autoriser `executeAction` à tourner sans validation pour certains types (flag `auto_execute` par type d'action). L'architecture est déjà là.

## Passer en mode LLM local (Ollama)

```bash
# 1. Installer Ollama https://ollama.com
ollama pull llama3.1

# 2. backend/.env
AI_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# 3. Relancer le backend
npm run dev
```

Si Ollama est indisponible, le backend **retombe automatiquement** sur le stub (journal console).

## Évolutions prévues

- **IA locale** : déjà branchée (Ollama). Ajouter d'autres backends → un fichier `services/aiProvider.js`.
- **Auto-exécution** : ajouter `auto_execute` par type dans `actionExecutor`.
- **Sync cloud** : ajouter un adapter `services/sync/*` (S3/Drive/WebDAV) autour de `core.db`.
- **Notifications push** : `Notification.requestPermission()` côté frontend + Web Push côté backend.

## Endpoints API

| Méthode | Route | Usage |
|---|---|---|
| GET  | `/finances` | liste |
| GET  | `/finances/summary` | totaux + anomalies |
| POST | `/finances` | ajouter |
| DEL  | `/finances/:id` | supprimer |
| GET  | `/projects` | projets + tasks |
| POST | `/projects` | créer (priorité auto) |
| PATCH| `/projects/:id` | modifier |
| POST | `/projects/:id/tasks` | ajouter tâche |
| PATCH| `/projects/:pid/tasks/:tid` | modifier tâche |
| GET  | `/ideas` | liste |
| POST | `/ideas` | capturer (structuration auto) |
| POST | `/ideas/:id/convert` | → projet |
| POST | `/ai/analyze` | analyse JSON stricte |
| GET  | `/ai/daily` | résumé + scores |
| GET  | `/ai/logs` | journal IA |
| GET  | `/suggestions` | suggestions courantes |
| POST | `/suggestions/run` | forcer un cycle |
| GET  | `/actions` | historique complet |
| POST | `/actions/:id/validate` | exécuter |
| POST | `/actions/:id/reject` | rejeter |

## Contraintes respectées

- Code modulaire (routes/services séparés), aucun code mort.
- DB auto-créée, projet fonctionnel immédiatement.
- UI premium : dark par défaut, responsive, sidebar adaptative, animations légères (`fade-in`, transitions cubic-bezier).
- PWA : manifest complet, SW, installable, cache runtime API, offline partiel.
- Architecture prête pour LLM local, auto-exécution, sync cloud.
