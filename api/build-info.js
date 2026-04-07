const BUILD_ID = "class-study-blocks-15";

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
    markers: ["Class study blocks v15", "ember-dock", "styles.css?v=class-study-blocks-15", "app.js?v=class-study-blocks-15"],
  });
}
