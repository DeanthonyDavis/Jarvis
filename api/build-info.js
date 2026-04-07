const BUILD_ID = "academic-progress-11";

export default function handler(_req, res) {
  res.status(200).json({
    app: "Ember",
    buildId: BUILD_ID,
    expectedCommit: "latest",
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "",
    branch: process.env.VERCEL_GIT_COMMIT_REF || "",
    repo: process.env.VERCEL_GIT_REPO_SLUG || "",
    deploymentUrl: process.env.VERCEL_URL || "",
    checkedAt: new Date().toISOString(),
    markers: ["Academic progress v11", "ember-dock", "styles.css?v=academic-progress-11", "app.js?v=academic-progress-11"],
  });
}
