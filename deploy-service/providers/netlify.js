const NETLIFY_API = "https://api.netlify.com/api/v1";
const crypto = require("crypto");

function sha1(content) {
  return crypto.createHash("sha1").update(content).digest("hex");
}

/**
 * Deploys a set of files to Netlify and configures env vars / build settings.
 */
async function deployToNetlify({ token, siteId, siteName, files, envVars, buildSettings }) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 1. Create the site if it doesn't exist yet
  let resolvedSiteId = siteId;
  if (!resolvedSiteId) {
    const siteRes = await fetch(`${NETLIFY_API}/sites`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: siteName,
        build_settings: {
          cmd: buildSettings?.buildCommand,
          dir: buildSettings?.outputDirectory,
        },
      }),
    });
    const siteData = await siteRes.json();
    resolvedSiteId = siteData.id;
  }

  // 2. Set environment variables
  if (envVars && Object.keys(envVars).length) {
    await fetch(`${NETLIFY_API}/sites/${resolvedSiteId}/env`, {
      method: "PUT",
      headers,
      body: JSON.stringify(
        Object.entries(envVars).map(([key, value]) => ({
          key,
          values: [{ value, context: "all" }],
        }))
      ),
    });
  }

  // 3. Build a file-digest manifest, then create the deploy
  const digest = {};
  for (const f of files) digest[`/${f.path}`] = sha1(f.content);

  const deployRes = await fetch(`${NETLIFY_API}/sites/${resolvedSiteId}/deploys`, {
    method: "POST",
    headers,
    body: JSON.stringify({ files: digest }),
  });
  const deployData = await deployRes.json();

  if (!deployRes.ok) {
    throw new Error(deployData?.message || "Netlify deployment failed");
  }

  // 4. Upload any files Netlify reports as required (not already cached)
  for (const [path] of Object.entries(deployData.required ? digest : {})) {
    const match = files.find((f) => `/${f.path}` === path);
    if (!match) continue;
    await fetch(`${NETLIFY_API}/deploys/${deployData.id}/files${path}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: match.content,
    });
  }

  return {
    provider: "netlify",
    deploymentId: deployData.id,
    url: deployData.ssl_url || deployData.url,
    status: deployData.state || "pending",
  };
}

module.exports = { deployToNetlify };
