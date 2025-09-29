#!/usr/bin/env bun

import * as core from "@actions/core";
import { preparePrompt } from "./prepare-prompt";
import { runClaude } from "./run-claude";
import { runCodex } from "./run-codex";
import { setupClaudeCodeSettings } from "./setup-claude-code-settings";
import { validateEnvironmentVariables } from "./validate-env";

async function run() {
  try {
    validateEnvironmentVariables();

    // Check if using Codex instead of Claude Code
    const useCodex =
      process.env.INPUT_USE_CODEX === "true" ||
      process.env.INPUT_PATH_TO_CODEX_EXECUTABLE;

    if (useCodex) {
      console.log("Using Codex CLI instead of Claude Code");

      // Prepare prompt (same for both)
      const promptConfig = await preparePrompt({
        prompt: process.env.INPUT_PROMPT || "",
        promptFile: process.env.INPUT_PROMPT_FILE || "",
      });

      // Run Codex with pre-built arguments from modes
      await runCodex(promptConfig.path, {
        // Use codex_args if available (from modes), fallback to claude_args for compatibility
        codexArgs:
          process.env.INPUT_CODEX_ARGS || process.env.INPUT_CLAUDE_ARGS,
        pathToCodexExecutable: process.env.INPUT_PATH_TO_CODEX_EXECUTABLE,
      });
    } else {
      console.log("Using Claude Code (default)");

      await setupClaudeCodeSettings(
        process.env.INPUT_SETTINGS,
        undefined, // homeDir
      );

      const promptConfig = await preparePrompt({
        prompt: process.env.INPUT_PROMPT || "",
        promptFile: process.env.INPUT_PROMPT_FILE || "",
      });

      await runClaude(promptConfig.path, {
        claudeArgs: process.env.INPUT_CLAUDE_ARGS,
        allowedTools: process.env.INPUT_ALLOWED_TOOLS,
        disallowedTools: process.env.INPUT_DISALLOWED_TOOLS,
        maxTurns: process.env.INPUT_MAX_TURNS,
        mcpConfig: process.env.INPUT_MCP_CONFIG,
        systemPrompt: process.env.INPUT_SYSTEM_PROMPT,
        appendSystemPrompt: process.env.INPUT_APPEND_SYSTEM_PROMPT,
        claudeEnv: process.env.INPUT_CLAUDE_ENV,
        fallbackModel: process.env.INPUT_FALLBACK_MODEL,
        model: process.env.ANTHROPIC_MODEL,
        pathToClaudeCodeExecutable:
          process.env.INPUT_PATH_TO_CLAUDE_CODE_EXECUTABLE,
      });
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
    core.setOutput("conclusion", "failure");
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
