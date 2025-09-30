/**
 * Codex parameter builder - converts Claude Code parameters to Codex CLI arguments
 * This module handles the complex parameter mapping from Claude's format to Codex's format
 */

import { parse as parseShellArgs } from "shell-quote";

/**
 * Check if we should use Codex instead of Claude Code
 */
export function shouldUseCodex(): boolean {
  return (
    process.env.INPUT_USE_CODEX === "true" ||
    !!process.env.INPUT_PATH_TO_CODEX_EXECUTABLE
  );
}

/**
 * Convert Claude Code MCP JSON configuration to Codex CLI arguments
 */
function convertMcpConfigToCliArgs(mcpConfigJson: string): string[] {
  const args: string[] = [];

  try {
    const mcpConfig = JSON.parse(mcpConfigJson);

    if (!mcpConfig.mcpServers) {
      return args;
    }

    for (const [serverId, serverConfig] of Object.entries(
      mcpConfig.mcpServers,
    )) {
      const config = serverConfig as any;

      // Add server command
      if (config.command) {
        args.push("-c", `mcp_servers.${serverId}.command="${config.command}"`);
      }

      // Add server arguments as JSON array
      if (config.args && Array.isArray(config.args)) {
        args.push(
          "-c",
          `mcp_servers.${serverId}.args=${JSON.stringify(config.args)}`,
        );
      }

      // Add environment variables - each as separate config entry
      if (config.env && typeof config.env === "object") {
        for (const [key, value] of Object.entries(config.env)) {
          // Escape double quotes in values
          const escapedValue = String(value).replace(/"/g, '\\"');
          args.push(
            "-c",
            `mcp_servers.${serverId}.env.${key}="${escapedValue}"`,
          );
        }
      }

      // Add timeouts if specified
      if (config.startup_timeout_sec) {
        args.push(
          "-c",
          `mcp_servers.${serverId}.startup_timeout_sec=${config.startup_timeout_sec}`,
        );
      }

      if (config.tool_timeout_sec) {
        args.push(
          "-c",
          `mcp_servers.${serverId}.tool_timeout_sec=${config.tool_timeout_sec}`,
        );
      }
    }
  } catch (error) {
    console.warn(`Failed to parse MCP config JSON: ${error}`);
  }

  return args;
}

/**
 * Parse Claude Code arguments and extract components
 */
function parseClaudeArgs(claudeArgs: string): {
  mcpConfigs: string[];
  allowedTools: string[];
  otherArgs: string[];
} {
  const mcpConfigs: string[] = [];
  const allowedTools: string[] = [];
  const otherArgs: string[] = [];

  if (!claudeArgs.trim()) {
    return { mcpConfigs, allowedTools, otherArgs };
  }

  const parsed = parseShellArgs(claudeArgs);
  const args = parsed.filter((arg): arg is string => typeof arg === "string");

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--mcp-config" && i + 1 < args.length) {
      const configValue = args[i + 1];
      if (configValue) {
        mcpConfigs.push(configValue);
      }
      i++; // Skip the next argument as it's the config value
    } else if (arg === "--allowedTools" && i + 1 < args.length) {
      const toolsStr = args[i + 1];
      if (toolsStr) {
        allowedTools.push(...toolsStr.split(",").map((t) => t.trim()));
      }
      i++; // Skip the next argument as it's the tools value
    } else if (
      !arg?.startsWith("--verbose") &&
      !arg?.includes("output-format")
    ) {
      // Skip Claude-specific args that don't map to Codex
      if (arg) {
        otherArgs.push(arg);
      }
    }
  }

  return { mcpConfigs, allowedTools, otherArgs };
}

/**
 * Build Codex CLI arguments from Claude Code parameters
 */
export function buildCodexArgs(
  claudeArgs: string,
  additionalMcpConfig?: string,
  userCodexArgs?: string,
): string {
  console.log(`[CODEX-BUILDER] Starting conversion...`);
  console.log(`[CODEX-BUILDER] Input claudeArgs length: ${claudeArgs.length}`);

  const codexArgs: string[] = [];

  // Start with base Codex arguments
  codexArgs.push(
    "exec",
    "--experimental-json",
    "--dangerously-bypass-approvals-and-sandbox",
  );

  // Parse Claude arguments
  const { mcpConfigs, allowedTools, otherArgs } = parseClaudeArgs(claudeArgs);
  console.log(
    `[CODEX-BUILDER] Parsed: ${mcpConfigs.length} MCP configs, ${allowedTools.length} tools (ignored for Codex), ${otherArgs.length} other args`,
  );

  // Add additional MCP config if provided (from modes)
  if (additionalMcpConfig) {
    mcpConfigs.push(additionalMcpConfig);
  }

  // Convert MCP configurations
  for (const mcpConfig of mcpConfigs) {
    console.log(
      `[CODEX-BUILDER] Converting MCP config: ${mcpConfig.substring(0, 100)}...`,
    );
    const mcpArgs = convertMcpConfigToCliArgs(mcpConfig);
    console.log(`[CODEX-BUILDER] Converted to ${mcpArgs.length} arguments`);
    codexArgs.push(...mcpArgs);
  }

  // Note: Skip allowedTools conversion - Codex defaults to allowing all tools
  console.log(
    `[CODEX-BUILDER] Skipping tools.allowed - Codex allows all tools by default`,
  );

  // Add other compatible arguments
  if (otherArgs.length > 0) {
    console.log(`[CODEX-BUILDER] Adding ${otherArgs.length} other arguments`);
    codexArgs.push(...otherArgs);
  }

  // Add user's custom Codex arguments
  if (userCodexArgs?.trim()) {
    console.log(`[CODEX-BUILDER] Adding user codex args: ${userCodexArgs}`);
    const userParsed = parseShellArgs(userCodexArgs);
    const userArgs = userParsed.filter(
      (arg): arg is string => typeof arg === "string",
    );
    codexArgs.push(...userArgs);
  }

  const result = codexArgs.join(" ");
  console.log(`[CODEX-BUILDER] Final codex args length: ${result.length}`);
  console.log(
    `[CODEX-BUILDER] Final codex args preview: ${result.substring(0, 200)}...`,
  );

  return result;
}

/**
 * Build environment variables for Codex execution
 */
export function buildCodexEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  // Pass through OpenAI credentials
  const openaiApiKey =
    process.env.INPUT_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    env.OPENAI_API_KEY = openaiApiKey;
  }

  const openaiBaseUrl =
    process.env.INPUT_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;
  if (openaiBaseUrl) {
    env.OPENAI_BASE_URL = openaiBaseUrl;
  }

  // Pass through GitHub token for MCP servers
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    env.GITHUB_TOKEN = githubToken;
  }

  // Pass through action inputs if present
  if (process.env.INPUT_ACTION_INPUTS_PRESENT) {
    env.GITHUB_ACTION_INPUTS = process.env.INPUT_ACTION_INPUTS_PRESENT;
  }

  return env;
}
