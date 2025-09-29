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

      // Add server arguments
      if (config.args && Array.isArray(config.args)) {
        args.push(
          "-c",
          `mcp_servers.${serverId}.args=${JSON.stringify(config.args)}`,
        );
      }

      // Add environment variables
      if (config.env && typeof config.env === "object") {
        const envEntries = Object.entries(config.env).map(
          ([key, value]) => `${key}="${value}"`,
        );
        if (envEntries.length > 0) {
          args.push(
            "-c",
            `mcp_servers.${serverId}.env = { ${envEntries.join(", ")} }`,
          );
        }
      }

      // Add timeouts if specified
      if (config.startup_timeout_sec) {
        args.push(
          "-c",
          `mcp_servers.${serverId}.startup_timeout_sec = ${config.startup_timeout_sec}`,
        );
      }

      if (config.tool_timeout_sec) {
        args.push(
          "-c",
          `mcp_servers.${serverId}.tool_timeout_sec = ${config.tool_timeout_sec}`,
        );
      }
    }
  } catch (error) {
    console.warn(`Failed to parse MCP config JSON: ${error}`);
  }

  return args;
}

/**
 * Convert Claude Code allowedTools to Codex configuration
 */
function convertAllowedToolsToCliArgs(tools: string[]): string[] {
  if (tools.length === 0) {
    return [];
  }

  // Codex uses tools.allowed configuration
  return ["-c", `tools.allowed=${JSON.stringify(tools)}`];
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
      mcpConfigs.push(args[i + 1]);
      i++; // Skip the next argument as it's the config value
    } else if (arg === "--allowedTools" && i + 1 < args.length) {
      const toolsStr = args[i + 1];
      allowedTools.push(...toolsStr.split(",").map((t) => t.trim()));
      i++; // Skip the next argument as it's the tools value
    } else if (!arg.startsWith("--verbose") && !arg.includes("output-format")) {
      // Skip Claude-specific args that don't map to Codex
      otherArgs.push(arg);
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
  const codexArgs: string[] = [];

  // Start with base Codex arguments
  codexArgs.push(
    "exec",
    "--experimental-json",
    "--dangerously-bypass-approvals-and-sandbox",
  );

  // Parse Claude arguments
  const { mcpConfigs, allowedTools, otherArgs } = parseClaudeArgs(claudeArgs);

  // Add additional MCP config if provided (from modes)
  if (additionalMcpConfig) {
    mcpConfigs.push(additionalMcpConfig);
  }

  // Convert MCP configurations
  for (const mcpConfig of mcpConfigs) {
    const mcpArgs = convertMcpConfigToCliArgs(mcpConfig);
    codexArgs.push(...mcpArgs);
  }

  // Convert allowed tools
  if (allowedTools.length > 0) {
    const toolArgs = convertAllowedToolsToCliArgs(allowedTools);
    codexArgs.push(...toolArgs);
  }

  // Add other compatible arguments
  codexArgs.push(...otherArgs);

  // Add user's custom Codex arguments
  if (userCodexArgs?.trim()) {
    const userParsed = parseShellArgs(userCodexArgs);
    const userArgs = userParsed.filter(
      (arg): arg is string => typeof arg === "string",
    );
    codexArgs.push(...userArgs);
  }

  return codexArgs.join(" ");
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
