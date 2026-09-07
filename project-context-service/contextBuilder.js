// contextBuilder.js
// Builds a condensed, structured summary of a project — its file tree,
// import/dependency relationships, and package dependencies — so that
// AI Chat, the App Builder, and the AI Agent can generate suggestions
// and edits that are consistent with what already exists, instead of
// guessing at file names, exports, or conventions.

const IMPORT_PATTERNS = [
  /import\s+(?:[\w{},*\s]+from\s+)?["']([^"']+)["']/g,
  /require\(["']([^"']+)["']\)/g,
];

function extractImports(content) {
  const imports = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      imports.add(match[1]);
    }
  }
  return Array.from(imports);
}

function extractExports(content) {
  const exportNames = new Set();
  const namedExportPattern = /export\s+(?:const|function|class)\s+([A-Za-z0-9_]+)/g;
  const defaultExportPattern = /export\s+default\s+(?:function\s+)?([A-Za-z0-9_]+)?/g;

  let match;
  while ((match = namedExportPattern.exec(content)) !== null) exportNames.add(match[1]);
  while ((match = defaultExportPattern.exec(content)) !== null) {
    exportNames.add(match[1] || "default");
  }
  return Array.from(exportNames);
}

function buildProjectContext(files, packageJson = {}) {
  const fileSummaries = files.map((f) => ({
    path: f.path,
    imports: extractImports(f.content),
    exports: extractExports(f.content),
    lineCount: f.content.split("\n").length,
  }));

  const dependencyGraph = {};
  for (const summary of fileSummaries) {
    dependencyGraph[summary.path] = summary.imports.filter((imp) => {
      return imp.startsWith(".") || imp.startsWith("/");
    });
  }

  return {
    fileTree: files.map((f) => f.path),
    files: fileSummaries,
    dependencyGraph,
    dependencies: packageJson.dependencies || {},
    devDependencies: packageJson.devDependencies || {},
  };
}

function contextToPromptString(context) {
  const lines = [];
  lines.push(`Project files (${context.fileTree.length}):`);
  for (const file of context.files) {
    const exportsStr = file.exports.length ? ` exports: ${file.exports.join(", ")}` : "";
    lines.push(`- ${file.path}${exportsStr}`);
  }

  const depNames = Object.keys(context.dependencies);
  if (depNames.length) {
    lines.push(`\nInstalled dependencies: ${depNames.join(", ")}`);
  }

  lines.push(`\nInternal file relationships:`);
  for (const [file, deps] of Object.entries(context.dependencyGraph)) {
    if (deps.length) lines.push(`- ${file} imports: ${deps.join(", ")}`);
  }

  return lines.join("\n");
}

module.exports = { buildProjectContext, contextToPromptString };
