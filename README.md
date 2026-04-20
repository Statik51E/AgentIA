# AgentIA — CORE IA ULTIMATE

App personnelle 100% gratuite : **finances, projets, idées, agent IA**. Déployée sur GitHub Pages, données stockées par utilisateur dans Firestore, IA via Groq avec ta propre clé API.

→ **[statik51e.github.io/AgentIA](https://statik51e.github.io/AgentIA/)**

## Architecture

- **Frontend** : React 18 + Vite + PWA installable, déployé sur **GitHub Pages**.
- **Auth** : Firebase Auth (email/password + Google).
- **Données** : Firestore — chaque utilisateur a sa propre sous-collection `users/{uid}/...`, isolation garantie par les security rules.
- **IA** : Groq (llama-3.3-70b-versatile par défaut), clé API **fournie par chaque utilisateur** dans ses Paramètres et stockée dans son document Firestore.
- **Pas de backend serveur** : tout tourne dans le navigateur.

## Premier lancement utilisateur

1. Créer un compte ou se connecter avec Google.
2. Aller dans **Paramètres**, coller une clé Groq (gratuite sur [console.groq.com/keys](https://console.groq.com/keys)).
3. Cliquer **Tester la clé** puis **Enregistrer**.
4. L'app est prête : finances, projets, idées, carte mentale IA, brainstorm auto.

Sans clé Groq, toutes les fonctions IA sont désactivées mais le reste de l'app (saisies, budgets, comptes, objectifs) fonctionne.

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` qui build et publie sur GitHub Pages.

### Configuration Firebase (une fois)

1. **Console Firebase → Authentication → Settings → Authorized domains** : ajouter `statik51e.github.io`.
2. **Console Firebase → Firestore → Rules** : copier le contenu de `firestore.rules` et publier.

### Configuration GitHub (une fois)

1. **Repo Settings → Pages → Source** : *GitHub Actions*.

## Dev local

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

## Fonctionnalités

### Finances (7 onglets)
- **Vue d'ensemble** : KPIs du mois, conseils IA, budgets, totaux par catégorie.
- **Mouvements** : CRUD + filtres (type, catégorie, compte, période, recherche) + export CSV.
- **Comptes** : patrimoine multi-comptes + transferts (dépense + revenu liés, catégorie `transfert` exclue des stats).
- **Objectifs** : épargne avec progression, deadlines, contributions +/-.
- **Évolution** : graphique SVG 3/6/12 mois, meilleur/pire mois.
- **Charges fixes** : total actives, activation/désactivation.
- **Import relevé** : PDF (parsing client-side via pdf.js) ou texte, analyse IA.

### Projets
- CRUD + tâches + cycle de statut.
- **Carte mentale IA** : brainstorm autonome par projet — l'agent IA génère des branches (objectifs, étapes, risques, ressources, idées, opportunités) avec enfants actionnables, rendu SVG radial.
- **Brainstorm batch** : un clic pour générer les cartes sur tous les projets sans carte.

### Idées
- Capture rapide + structuration IA automatique + conversion en projet.

### CORE IA
- Analyse texte libre (finance/projet/idée/tâche/libre) → analyse, structure, améliorations, actions.
- Suggestions autonomes : scan périodique des données pour proposer des actions (projet stagnant, idée à convertir, anomalie financière, etc.).
- Historique des décisions validées / rejetées.

## Sécurité

- Chaque document Firestore `users/{uid}/...` n'est lisible que par son propriétaire (rules).
- La clé Groq utilisateur ne quitte jamais Firestore + son navigateur.
- Les appels Groq partent du client avec sa propre clé — aucun serveur intermédiaire à maintenir.
