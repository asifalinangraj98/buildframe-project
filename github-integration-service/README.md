# GitHub Integration Service

Enables connecting a GitHub repo, and committing, pushing, and pulling
directly from the platform — without the user leaving the app.

## Setup

1. Create a GitHub OAuth App (or GitHub App) at
   https://github.com/settings/developers, with callback URL
   `<SERVER_URL>/api/github/callback` and the `repo` scope.
2. Add to your `.env`:
   ```
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   SERVER_URL=http://localhost:4000
   CLIENT_URL=http://localhost:3000
   ```
3. Implement `getStoredToken()` in `routes/github.js` against wherever you
   store each user's encrypted GitHub token after the OAuth callback.
4. Mount the router: `app.use("/api", requireAuth, require("./routes/github"))`

## How commits work

`commitAndPush()` uses the **Git Trees API** rather than the simpler Contents
API. This lets multiple changed files land in a single atomic commit
(read base tree, create blobs, create a new tree, create a commit, move the
branch ref), matching how a real `git commit` with several staged files
behaves, instead of creating one commit per file.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | /api/github/connect | Starts the OAuth flow |
| GET | /api/github/callback | OAuth redirect target |
| GET | /api/github/repos | Lists the user's repositories |
| GET | /api/github/pull?owner=&repo=&branch= | Gets the latest commit info |
| POST | /api/github/push | Commits and pushes files: `{ owner, repo, branch, files, commitMessage }` |
