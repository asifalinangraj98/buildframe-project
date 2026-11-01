const {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  PutBucketWebsiteCommand,
} = require("@aws-sdk/client-s3");
const {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateInvalidationCommand,
} = require("@aws-sdk/client-cloudfront");
const { SSMClient, PutParameterCommand } = require("@aws-sdk/client-ssm");

function mimeType(path) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

/**
 * Deploys a static build to S3, fronted by CloudFront, and stores env vars
 * in SSM Parameter Store (used by any server-side build step, not the browser).
 */
async function deployToAWS({ region, credentials, bucketName, files, envVars, distributionId }) {
  const s3 = new S3Client({ region, credentials });
  const ssm = new SSMClient({ region, credentials });

  // 1. Ensure the bucket exists and is configured for static website hosting
  await s3.send(new CreateBucketCommand({ Bucket: bucketName })).catch(() => null);
  await s3.send(
    new PutBucketWebsiteCommand({
      Bucket: bucketName,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: "index.html" },
        ErrorDocument: { Key: "index.html" },
      },
    })
  );

  // 2. Upload every file
  for (const f of files) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: f.path,
        Body: f.content,
        ContentType: mimeType(f.path),
      })
    );
  }

  // 3. Store environment variables securely (used at build time, never shipped to the browser)
  for (const [key, value] of Object.entries(envVars || {})) {
    await ssm.send(
      new PutParameterCommand({
        Name: `/apps/${bucketName}/${key}`,
        Value: value,
        Type: "SecureString",
        Overwrite: true,
      })
    );
  }

  // 4. Create (first deploy) or invalidate (redeploy) the CloudFront distribution
  let resolvedDistributionId = distributionId;
  const cloudfront = new CloudFrontClient({ region, credentials });

  if (!resolvedDistributionId) {
    const dist = await cloudfront.send(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: `${bucketName}-${Date.now()}`,
          Origins: {
            Quantity: 1,
            Items: [
              {
                Id: bucketName,
                DomainName: `${bucketName}.s3-website-${region}.amazonaws.com`,
                CustomOriginConfig: {
                  HTTPPort: 80,
                  HTTPSPort: 443,
                  OriginProtocolPolicy: "http-only",
                },
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: bucketName,
            ViewerProtocolPolicy: "redirect-to-https",
            ForwardedValues: { QueryString: false, Cookies: { Forward: "none" } },
            MinTTL: 0,
            TrustedSigners: { Enabled: false, Quantity: 0 },
          },
          Enabled: true,
          Comment: `Distribution for ${bucketName}`,
        },
      })
    );
    resolvedDistributionId = dist.Distribution.Id;
  } else {
    await cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: resolvedDistributionId,
        InvalidationBatch: {
          CallerReference: `${Date.now()}`,
          Paths: { Quantity: 1, Items: ["/*"] },
        },
      })
    );
  }

  return {
    provider: "aws",
    distributionId: resolvedDistributionId,
    url: `https://${bucketName}.s3-website-${region}.amazonaws.com`,
    status: "deployed",
  };
}

module.exports = { deployToAWS };
