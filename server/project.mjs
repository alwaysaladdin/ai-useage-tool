import path from "node:path";

const knownWorkspaceNames = new Map([
  ["ai-useage-tool", "ai-useage-tool"],
  ["info-collector", "info-collector"],
]);

export function projectNameFromSession(session = {}) {
  const cwd = session.cwd || "";
  const repoUrl = session.repositoryUrl || "";

  if (repoUrl.includes("storeelapp/zinc") || cwd.includes("/storeel-zinc/")) {
    return "Storeel Zinc";
  }

  if (cwd.includes("/.codex")) {
    return "Codex Config";
  }

  const repoName = repoUrl.match(/[:/]([^/:]+?)(?:\.git)?$/)?.[1];
  if (repoName) {
    return knownWorkspaceNames.get(repoName) || prettifyName(repoName);
  }

  const cwdName = cwd ? path.basename(cwd) : "";
  if (cwdName) {
    return knownWorkspaceNames.get(cwdName) || prettifyName(cwdName);
  }

  return "Other";
}

export function projectKeyFromSession(session = {}) {
  return projectNameFromSession(session).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function prettifyName(value) {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

