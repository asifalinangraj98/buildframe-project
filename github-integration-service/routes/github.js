const express = require("express");
const { exchangeCodeForToken, listRepos, pullLatest, commitAndPush } = require("../githubClient");

const router = express.Router();

// In production: look up the user's stored, encrypted GitHub token here
// (see provider_connections pattern from the Deploy Support feature).
async function getStoredToken(userId) {
  throw new Error("getStoredToken must be implemented against your credential store");
}

// ---------- OAuth connect ----------
router.get("/github/connect", (req, res) => {
  const redirectUri = `${process.env.SERVER_URL}/api/github/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=repo&redirect_uri=${redirectUri}`;
  res.redirect(url);
});

router.get("/github/callback", async (req, res) => {
  try {
    const token = await exchangeCodeForToken({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      code: req.query.code,
    });
    // Store `token` (encrypted) against req.userId here.
    res.redirect(`${process.env.CLIENT_URL}/project/github-connected`);
  } catch (err) {
    res.redirect(`${process.env.CLIENT_URL}/project?error=github_auth_failed`);
  }
});

// ---------- List repos ----------
router.get("/github/repos", async (req, res) => {
  try {
    const token = await getStoredToken(req.userId);
    const repos = await listRepos(token);
    res.json({ repos });
  } catch (err) {
    res.status(500).json({ error: "Could not list repositories" });
  }
});

// ---------- Pull latest ----------
router.get("/github/pull", async (req, res) => {
  try {
    const { owner, repo, branch } = req.query;
    const token = await getStoredToken(req.userId);
    const latest = await pullLatest({ token, owner, repo, branch });
    res.json({ latest });
  } catch (err) {
    res.status(500).json({ error: "Pull failed" });
  }
});

// ---------- Commit & push ----------
router.post("/github/push", async (req, res) => {
  try {
    const { owner, repo, branch, files, commitMessage } = req.body;
    if (!files?.length || !commitMessage) {
      return res.status(400).json({ error: "files and commitMessage are required" });
    }
    const token = await getStoredToken(req.userId);
    const result = await commitAndPush({ token, owner, repo, branch, files, commitMessage });
    res.status(201).json({ commit: result });
  } catch (err) {
    res.status(500).json({ error: "Push failed" });
  }
});

module.exports = router;
