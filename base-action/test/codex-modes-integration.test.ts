import { describe, it, expect } from "bun:test";
import {
  buildCodexArgs,
  shouldUseCodex,
} from "../../src/modes/shared/codex-builder";

describe("Codex Modes Integration", () => {
  it("should build codex args from Claude args with MCP config", () => {
    const claudeArgs =
      '--mcp-config \'{"mcpServers":{"github":{"command":"npx","args":["-y","@anthropic-ai/github-mcp-server"]}}}\' --allowedTools "Edit,Read,Write"';

    const codexArgs = buildCodexArgs(claudeArgs);

    // Should contain basic Codex arguments
    expect(codexArgs).toContain("exec");
    expect(codexArgs).toContain("--experimental-json");
    expect(codexArgs).toContain("--dangerously-bypass-approvals-and-sandbox");

    // Should contain converted MCP configuration
    expect(codexArgs).toContain("-c");
    expect(codexArgs).toContain('mcp_servers.github.command="npx"');

    // Should NOT contain tools.allowed - Codex allows all tools by default
    expect(codexArgs).not.toContain("tools.allowed");
  });

  it("should handle user codex args correctly", () => {
    const claudeArgs = '--allowedTools "Edit,Read"';
    const userCodexArgs = "--timeout 300s --color never";

    const codexArgs = buildCodexArgs(claudeArgs, undefined, userCodexArgs);

    // Should contain basic arguments and user arguments
    expect(codexArgs).toContain("--timeout");
    expect(codexArgs).toContain("300s");
    expect(codexArgs).toContain("--color");
    expect(codexArgs).toContain("never");
  });

  it("should detect Codex usage from environment", () => {
    const originalUseCodex = process.env.INPUT_USE_CODEX;
    const originalPathToCodex = process.env.INPUT_PATH_TO_CODEX_EXECUTABLE;

    // Test with use_codex = true
    process.env.INPUT_USE_CODEX = "true";
    expect(shouldUseCodex()).toBe(true);

    // Test with custom executable path
    delete process.env.INPUT_USE_CODEX;
    process.env.INPUT_PATH_TO_CODEX_EXECUTABLE = "/usr/local/bin/codex";
    expect(shouldUseCodex()).toBe(true);

    // Test with neither set
    delete process.env.INPUT_USE_CODEX;
    delete process.env.INPUT_PATH_TO_CODEX_EXECUTABLE;
    expect(shouldUseCodex()).toBe(false);

    // Restore original values
    if (originalUseCodex !== undefined) {
      process.env.INPUT_USE_CODEX = originalUseCodex;
    }
    if (originalPathToCodex !== undefined) {
      process.env.INPUT_PATH_TO_CODEX_EXECUTABLE = originalPathToCodex;
    }
  });
});
