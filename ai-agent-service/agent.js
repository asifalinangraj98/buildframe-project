const fetch = global.fetch;

// ---------- Tool definitions ----------
// Each tool the agent can call, described in the format Claude expects.
const TOOLS = [
  {
    name: "write_file",
    description: "Create or overwrite a file with the given content.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Full file content" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_tests",
    description: "Run the project's test suite and return pass/fail results.",
    input_schema: {
      type: "object",
      properties: { scope: { type: "string", description: "Which tests to run, e.g. 'all' or a file path" } },
      required: ["scope"],
    },
  },
  {
    name: "search_codebase",
    description: "Search the project's files for a keyword or pattern.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

// ---------- Tool executors ----------
// Replace these with real implementations (filesystem, test runner, etc.)
const toolExecutors = {
  async write_file({ path, content }) {
    return { success: true, message: `Wrote ${content.length} characters to ${path}` };
  },
  async run_tests({ scope }) {
    return { success: true, passed: 12, failed: 0, scope };
  },
  async search_codebase({ query }) {
    return { matches: [`No real index configured — implement search for "${query}"`] };
  },
};

/**
 * Runs an autonomous agent loop: sends the task to Claude with tools enabled,
 * executes any tool the model calls, feeds the result back, and repeats
 * until the model produces a final answer (stop_reason "end_turn").
 */
async function runAgentTask(task, onStep) {
  const messages = [{ role: "user", content: task }];
  const MAX_STEPS = 10;

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        tools: TOOLS,
        messages,
      }),
    });

    const data = await response.json();
    messages.push({ role: "assistant", content: data.content });

    const textBlock = data.content.find((b) => b.type === "text");
    if (textBlock) onStep({ type: "reasoning", text: textBlock.text });

    const toolUseBlocks = data.content.filter((b) => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      return textBlock?.text || "Task completed.";
    }

    const toolResults = [];
    for (const block of toolUseBlocks) {
      onStep({ type: "tool_call", tool: block.name, input: block.input });
      const executor = toolExecutors[block.name];
      const result = executor ? await executor(block.input) : { error: "Unknown tool" };
      onStep({ type: "tool_result", tool: block.name, result });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return "Reached the maximum number of steps without finishing — task may need to be broken down further.";
}

module.exports = { runAgentTask, TOOLS };
