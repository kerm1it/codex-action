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

      // Add server command (TOML string format)
      if (config.command) {
        args.push("-c", `mcp_servers.${serverId}.command="${config.command}"`);
      }

      // Add server arguments as TOML array
      // Use single quotes to wrap the entire value so shell doesn't interpret it
      if (config.args && Array.isArray(config.args)) {
        // TOML array format: ["item1", "item2"]
        const tomlArray = JSON.stringify(config.args);
        args.push("-c", `mcp_servers.${serverId}.args='${tomlArray}'`);
      }

      // Add environment variables as TOML table
      // Format: env = { "KEY1" = "value1", "KEY2" = "value2" }
      if (config.env && typeof config.env === "object") {
        const envEntries = Object.entries(config.env).map(([key, value]) => {
          // Escape quotes in values for TOML
          const escapedValue = String(value).replace(/"/g, '\\"');
          return `"${key}" = "${escapedValue}"`;
        });
        if (envEntries.length > 0) {
          args.push(
            "-c",
            `mcp_servers.${serverId}.env='{ ${envEntries.join(", ")} }'`,
          );
        }
      }

      // Add timeouts if specified (TOML integer format)
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
  prompt?: string
): string {
  console.log(`[CODEX-BUILDER] Starting conversion...`);
  console.log(`[CODEX-BUILDER] Input claudeArgs length: ${claudeArgs.length}`);

  const codexArgs: string[] = [];

  // Parse user's custom Codex arguments first to extract exec options
  let userExecOptions: string[] = [];
  if (userCodexArgs?.trim()) {
    console.log(`[CODEX-BUILDER] Parsing user codex args: ${userCodexArgs}`);
    const userParsed = parseShellArgs(userCodexArgs);
    const userArgs = userParsed.filter(
      (arg): arg is string => typeof arg === "string",
    );

    // Extract exec-level options (like --timeout) vs config options (like -c)
    for (let i = 0; i < userArgs.length; i++) {
      const arg = userArgs[i];
      if (!arg) continue;

      // exec-level options: --timeout, --color, etc.
      if (
        arg.startsWith("--") &&
        !arg.startsWith("--experimental-json") &&
        !arg.startsWith("--dangerously")
      ) {
        userExecOptions.push(arg);
        // Check if next arg is the value for this option
        const nextArg = userArgs[i + 1];
        if (nextArg && !nextArg.startsWith("-")) {
          userExecOptions.push(nextArg);
          i++; // Skip the value in next iteration
        }
      }
    }
  }

  // Start with base Codex arguments in correct order
  codexArgs.push("exec", "--full-auto");

  // Add user's exec-level options right after 'exec'
  if (userExecOptions.length > 0) {
    console.log(
      `[CODEX-BUILDER] Adding ${userExecOptions.length} exec options: ${userExecOptions.join(" ")}`,
    );
    codexArgs.push(...userExecOptions);
  }

  // Then add our required flags
  codexArgs.push(
    "--experimental-json",
    "--dangerously-bypass-approvals-and-sandbox",
    "-c env_key=OPENAI_API_KEY"
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

  // Add other compatible arguments (like additional -c options from user)
  if (otherArgs.length > 0) {
    console.log(`[CODEX-BUILDER] Adding ${otherArgs.length} other arguments`);
    codexArgs.push(...otherArgs);
  }

  // 将 prompt 放在最后
  if (prompt && prompt.length > 0) {
    codexArgs.push(`"${prompt}"`);
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
