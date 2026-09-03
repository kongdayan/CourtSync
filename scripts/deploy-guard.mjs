// Refuses `wrangler deploy` when run from a linked git worktree.
// Production must always be deployed from the main working tree.
import { execSync } from "node:child_process";
import { resolve, sep } from "node:path";

function run(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

const toplevel = run("git rev-parse --show-toplevel");
const gitDir = run("git rev-parse --absolute-git-dir");

// In the main worktree, the .git directory lives inside the toplevel.
// In a linked worktree it lives inside the main repo (outside this toplevel).
if (!gitDir.startsWith(resolve(toplevel) + sep)) {
  console.error(
    [
      "",
      "✗ Refusing to deploy: this directory is a linked git worktree.",
      `  toplevel: ${toplevel}`,
      `  git dir:  ${gitDir}`,
      "",
      "Deploy only from the main working tree (see AGENTS.md → Deployment).",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("✓ deploy guard: running from main worktree");
