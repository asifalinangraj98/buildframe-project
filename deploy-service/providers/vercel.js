const VERCEL_API = "https://api.vercel.com";

/**
 * Deploys a set of files to Vercel and configures env vars for the project.
 */
async function deployToVercel({ token, projectName, files, envVars, buildSettings }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. Ensure the project exists with the requested build settings
  await fetch(`${VERCEL_API}/v10/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: projectName,
      buildCommand: buildSettings?.buildCommand || null,
      outputDirectory: buildSettings?.outputDirectory || null,
    }),
  }).catch(() => null); // ignore "already exists" errors

  // 2. Push environment variables
  for (const [key, value] of Object.entries(envVars || {})) {
    await fetch(`${VERCEL_API}/v10/projects/${projectName}/env`, {
      method: "POST",
      headers,
      body: JSON.stringify({ key, value, target: ["production", "preview"], type: "encrypted" }),
    });
  }

  // 3. Create the deployment from the generated files
  const deployRes = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: projectName,
      files: files.map((f) => ({ file: f.path, data: f.content })),
      target: "production",
    }),
  });

  const deployData = await deployRes.json();
  if (!deployRes.ok) {
    throw new Error(deployData?.error?.message || "Vercel deployment failed");
  }

  return {
    provider: "vercel",
    deploymentId: deployData.id,
    url: `https://${deployData.url}`,
    status: deployData.readyState || "queued",
  };
}

module.exports = { deployToVercel };
