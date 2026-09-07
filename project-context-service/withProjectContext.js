// withProjectContext.js
// Wraps any AI request (Chat, Agent, App Builder) so the model always sees
// the current project's structure before answering — this is what makes
// suggestions and edits consistent with the real codebase instead of
// plausible-sounding guesses.

const { buildProjectContext, contextToPromptString } = require("./contextBuilder");

/**
 * @param {Array<{path:string, content:string}>} projectFiles
 * @param {Object} packageJson
 * @param {Array<{role:string, content:string}>} userMessages - the conversation so far
 * @returns {Array} messages array ready to send to the Anthropic API
 */
function withProjectContext(projectFiles, packageJson, userMessages) {
  const context = buildProjectContext(projectFiles, packageJson);
  const contextBlock = contextToPromptString(context);

  const systemContextMessage = {
    role: "user",
    content: `Here is the current project's structure. Use it to keep any code, file paths, or suggestions consistent with what already exists — reuse existing exports and dependencies rather than inventing new ones where one already fits:\n\n${contextBlock}`,
  };

  return [systemContextMessage, ...userMessages];
}

module.exports = { withProjectContext };
