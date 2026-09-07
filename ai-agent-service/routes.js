const express = require("express");
const { runAgentTask } = require("./agent");

const router = express.Router();

// Streams each reasoning/tool step to the client as it happens (SSE),
// so the UI can show progress instead of waiting for the whole task to finish.
router.post("/agent/run", async (req, res) => {
  const { task } = req.body;
  if (!task) return res.status(400).json({ error: "task is required" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendStep = (step) => {
    res.write(`data: ${JSON.stringify(step)}\n\n`);
  };

  try {
    const finalAnswer = await runAgentTask(task, sendStep);
    sendStep({ type: "done", text: finalAnswer });
  } catch (err) {
    sendStep({ type: "error", message: err.message });
  } finally {
    res.end();
  }
});

module.exports = router;
