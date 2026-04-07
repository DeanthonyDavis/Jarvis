const BUILD_ID = "academic-requirements-12";

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
    markers: ["Academic requirements v12", "ember-dock", "styles.css?v=academic-requirements-12", "app.js?v=academic-requirements-12"],
  });
}
