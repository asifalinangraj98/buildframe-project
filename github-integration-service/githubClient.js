const GITHUB_API = "https://api.github.com";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

/**
 * Exchanges an OAuth code for an access token (GitHub App / OAuth App flow).
 */
async function exchangeCodeForToken({ clientId, clientSecret, code }) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("GitHub authorization failed");
  return data.access_token;
}

/**
 * Lists repositories the authenticated user can access, most recently pushed first.
 */
async function listRepos(token) {
  const res = await fetch(`${GITHUB_API}/user/repos?sort=pushed&per_page=20`, { headers: authHeaders(token) });
  const repos = await res.json();
  return repos.map((r) => ({ fullName: r.full_name, defaultBranch: r.default_branch, private: r.private }));
}

/**
 * Fetches the latest commit and file contents for a branch (used for "Pull").
 */
async function pullLatest({ token, owner, repo, branch = "main" }) {
  const branchRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/branches/${branch}`, { headers: authHeaders(token) });
  const branchData = await branchRes.json();
  return {
    latestCommitSha: branchData.commit?.sha,
    commitMessage: branchData.commit?.commit?.message,
    author: branchData.commit?.commit?.author?.name,
    date: branchData.commit?.commit?.author?.date,
  };
}

/**
 * Commits and pushes multiple files atomically in a single commit, using the
 * Git Trees API — this avoids the "one commit per file" problem of the
 * simpler Contents API when several files change together.
 *
 * @param {Array<{path: string, content: string}>} files
 */
async function commitAndPush({ token, owner, repo, branch = "main", files, commitMessage }) {
  const headers = authHeaders(token);

  // 1. Get the current branch head commit + its tree
  const refRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers });
  const refData = await refRes.json();
  const baseCommitSha = refData.object.sha;

  const baseCommitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, { headers });
  const baseCommitData = await baseCommitRes.json();
  const baseTreeSha = baseCommitData.tree.sha;

  // 2. Create blobs for each changed file
  const blobs = await Promise.all(
    files.map(async (f) => {
      const blobRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
      });
      const blobData = await blobRes.json();
      return { path: f.path, mode: "100644", type: "blob", sha: blobData.sha };
    })
  );

  // 3. Create a new tree that layers the changed blobs on top of the existing tree
  const treeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
  });
  const treeData = await treeRes.json();

  // 4. Create the commit
  const commitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: commitMessage, tree: treeData.sha, parents: [baseCommitSha] }),
  });
  const commitData = await commitRes.json();

  // 5. Move the branch pointer to the new commit (this is the "push")
  await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: commitData.sha }),
  });

  return { commitSha: commitData.sha, url: commitData.html_url, filesChanged: files.length };
}

module.exports = { exchangeCodeForToken, listRepos, pullLatest, commitAndPush };
