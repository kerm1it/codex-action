import { describe, it, expect } from "bun:test";
import { prepareCodexConfig, type CodexOptions } from "../src/run-codex";

describe("Codex Base-Action Configuration", () => {
  const testPromptPath = "/tmp/test-prompt.txt";

  it("should handle pre-built MCP configuration from modes layer", () => {
    // In the new architecture, MCP configs are pre-built by modes layer
    const preBuiltCodexArgs =
      'exec --experimental-json -c mcp_servers.github.command="docker" -c mcp_servers.github.args="[\\"run\\", \\"--rm\\", \\"-i\\"]" --dangerously-bypass-approvals-and-sandbox';

    const options: CodexOptions = {
      codexArgs: preBuiltCodexArgs,
    };

    const config = prepareCodexConfig(testPromptPath, options);

    // Check that pre-built MCP configuration arguments are preserved
    expect(config.codexArgs).toContain("-c");
    expect(config.codexArgs).toContain("mcp_servers.github.command=docker");
  });

  it("should handle MCP config with minimal server configuration", () => {
    // Test with simpler pre-built configuration from modes layer
    const preBuiltCodexArgs =
      'exec --experimental-json -c mcp_servers.minimal.command="echo" --dangerously-bypass-approvals-and-sandbox';

    const options: CodexOptions = {
      codexArgs: preBuiltCodexArgs,
    };

    const config = prepareCodexConfig(testPromptPath, options);

    // Should include basic server configuration
    expect(config.codexArgs).toContain("mcp_servers.minimal.command=echo");
  });
});
