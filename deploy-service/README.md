# One-Click Deployment Service

Deploys generated projects to Vercel, Netlify, or AWS (S3 + CloudFront), and manages
environment variables and build settings per provider.

## Setup

```
npm install express @aws-sdk/client-s3 @aws-sdk/client-cloudfront @aws-sdk/client-ssm
```

Mount the router in your main server:

```js
const deployRouter = require("./routes/deploy");
app.use("/api", requireAuth, deployRouter);
```

## Implement before going live

`getProviderCredentials()` in `routes/deploy.js` is a placeholder — wire it up to
wherever you store each user's connected-provider tokens (encrypted at rest,
e.g. in a `provider_connections` table keyed by `user_id` + `provider`).

## Request shape

```
POST /api/deploy
{
  "projectId": "uuid",
  "provider": "vercel" | "netlify" | "aws",
  "files": [{ "path": "index.html", "content": "..." }],
  "envVars": { "API_URL": "https://..." },
  "buildSettings": { "buildCommand": "npm run build", "outputDirectory": "dist" }
}
```

## What each provider adapter does

- **Vercel**: creates/updates the project, pushes env vars via the Vercel API,
  then creates a deployment from the file list directly (no git push needed).
- **Netlify**: creates the site if needed, sets env vars, uploads a file-hash
  manifest, then uploads any files Netlify reports as not already cached.
- **AWS**: uploads files to an S3 bucket configured for static website hosting,
  stores env vars in SSM Parameter Store (never exposed to the browser), and
  creates a CloudFront distribution on first deploy or invalidates its cache
  on redeploys.
