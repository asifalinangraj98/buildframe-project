const express = require("express");
const { deployToVercel } = require("../providers/vercel");
const { deployToNetlify } = require("../providers/netlify");
const { deployToAWS } = require("../providers/aws");

const router = express.Router();

// In production, credentials come from the authenticated user's stored,
// encrypted provider connection — never accepted raw from the client.
async function getProviderCredentials(userId, provider) {
  // Placeholder: look up from your `provider_connections` table.
  // Returns { token } for Vercel/Netlify, or { region, credentials } for AWS.
  throw new Error("getProviderCredentials must be implemented against your credential store");
}

router.post("/deploy", async (req, res) => {
  try {
    const { projectId, provider, files, envVars, buildSettings } = req.body;
    const userId = req.userId; // set by requireAuth middleware upstream

    if (!provider || !files?.length) {
      return res.status(400).json({ error: "provider and files are required" });
    }

    const creds = await getProviderCredentials(userId, provider);
    let result;

    switch (provider) {
      case "vercel":
        result = await deployToVercel({
          token: creds.token,
          projectName: `project-${projectId}`,
          files,
          envVars,
          buildSettings,
        });
        break;
      case "netlify":
        result = await deployToNetlify({
          token: creds.token,
          siteName: `project-${projectId}`,
          files,
          envVars,
          buildSettings,
        });
        break;
      case "aws":
        result = await deployToAWS({
          region: creds.region,
          credentials: creds.credentials,
          bucketName: `project-${projectId}`.toLowerCase(),
          files,
          envVars,
        });
        break;
      default:
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }

    res.status(201).json({ deployment: result });
  } catch (err) {
    res.status(500).json({ error: err.message || "Deployment failed" });
  }
});

module.exports = router;
