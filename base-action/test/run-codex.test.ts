import { describe, it, expect, beforeEach } from "bun:test";
import { prepareCodexConfig, type CodexOptions } from "../src/run-codex";

describe("prepareCodexConfig", () => {
  const testPromptPath = "/tmp/test-prompt.txt";

  beforeEach(() => {
    // Clear environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  it("should generate basic Codex arguments", () => {
    const options: CodexOptions = {};

    const config = prepareCodexConfig(testPromptPath, options);

    expect(config.promptPath).toBe(testPromptPath);
    expect(config.codexArgs).toContain("exec");
    expect(config.codexArgs).toContain("--experimental-json");
    expect(config.codexArgs).toContain(
      "--dangerously-bypass-approvals-and-sandbox",
    );
  });

  it("should set custom base URL via environment variables", () => {
    // Set environment variables (this is how configuration works in the new architecture)
    process.env.INPUT_OPENAI_BASE_URL = "https://custom-api.example.com/v1";

    const options: CodexOptions = {};
    const config = prepareCodexConfig(testPromptPath, options);

    expect(config.env.OPENAI_BASE_URL).toBe(
      "https://custom-api.example.com/v1",
    );

    // Cleanup
    delete process.env.INPUT_OPENAI_BASE_URL;
  });

  it("should use default configuration when base URL not specified", () => {
    // Ensure no base URL is set in environment
    delete process.env.INPUT_OPENAI_BASE_URL;
    delete process.env.OPENAI_BASE_URL;

    const options: CodexOptions = {};
    const config = prepareCodexConfig(testPromptPath, options);

    // Should not set OPENAI_BASE_URL if not provided
    expect(config.env.OPENAI_BASE_URL).toBeUndefined();
  });

  it("should parse pre-built codex arguments from modes layer", () => {
    const options: CodexOptions = {
      codexArgs:
        'exec --experimental-json -c model="gpt-3.5-turbo" --dangerously-bypass-approvals-and-sandbox',
    };

    const config = prepareCodexConfig(testPromptPath, options);

    expect(config.codexArgs).toContain("exec");
    expect(config.codexArgs).toContain("--experimental-json");
    expect(config.codexArgs).toContain("-c");
    expect(config.codexArgs).toContain("model=gpt-3.5-turbo");
  });

  it("should configure environment variables correctly", () => {
    // Set environment variables (new architecture uses env vars)
    process.env.INPUT_OPENAI_API_KEY = "test-api-key";

    const options: CodexOptions = {};
    const config = prepareCodexConfig(testPromptPath, options);

    expect(config.env.OPENAI_API_KEY).toBe("test-api-key");

    // Cleanup
    delete process.env.INPUT_OPENAI_API_KEY;
  });

  it("should use environment variables as fallback", () => {
    process.env.OPENAI_API_KEY = "env-api-key";
    process.env.OPENAI_BASE_URL = "https://env-api.example.com/v1";

    const options: CodexOptions = {};

    const config = prepareCodexConfig(testPromptPath, options);

    expect(config.env.OPENAI_API_KEY).toBe("env-api-key");
    expect(config.env.OPENAI_BASE_URL).toBe("https://env-api.example.com/v1");
  });

  it("should parse custom Codex arguments", () => {
    const options: CodexOptions = {
      codexArgs: "--color never --sandbox read-only",
    };

    const config = prepareCodexConfig(testPromptPath, options);

    expect(config.codexArgs).toContain("--color");
    expect(config.codexArgs).toContain("never");
    expect(config.codexArgs).toContain("--sandbox");
    expect(config.codexArgs).toContain("read-only");
  });

  it("should use fallback arguments when no codex args provided", () => {
    const options: CodexOptions = {};

    const config = prepareCodexConfig(testPromptPath, options);

    // Should fallback to basic Codex arguments
    expect(config.codexArgs).toContain("exec");
    expect(config.codexArgs).toContain("--experimental-json");
    expect(config.codexArgs).toContain(
      "--dangerously-bypass-approvals-and-sandbox",
    );
  });

  it("should use Codex default OpenAI provider", () => {
    const options: CodexOptions = {};

    const config = prepareCodexConfig(testPromptPath, options);

    // Should use Codex default OpenAI provider (no custom provider configuration)
    const providerArgs = config.codexArgs.filter((arg) =>
      arg.includes("model_provider"),
    );
    expect(providerArgs.length).toBe(0);

    // Should include basic exec arguments
    expect(config.codexArgs).toContain("exec");
    expect(config.codexArgs).toContain("--experimental-json");
    expect(config.codexArgs).toContain(
      "--dangerously-bypass-approvals-and-sandbox",
    );
  });

  it("should handle empty options gracefully", () => {
    const options: CodexOptions = {};

    const config = prepareCodexConfig(testPromptPath, options);

    expect(config.promptPath).toBe(testPromptPath);
    expect(config.codexArgs.length).toBeGreaterThan(0);
    expect(config.env).toBeDefined();
  });

  it("should preserve inherited environment variables", () => {
    const originalPath = process.env.PATH;
    const originalHome = process.env.HOME;

    const options: CodexOptions = {};

    const config = prepareCodexConfig(testPromptPath, options);

    if (originalPath !== undefined) {
      expect(config.env.PATH).toBe(originalPath);
    }
    if (originalHome !== undefined) {
      expect(config.env.HOME).toBe(originalHome);
    }
  });
});
