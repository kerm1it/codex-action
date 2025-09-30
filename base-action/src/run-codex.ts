import * as core from "@actions/core";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, stat } from "fs/promises";
import { spawn } from "child_process";
import { parse as parseShellArgs } from "shell-quote";

const execAsync = promisify(exec);

const EXECUTION_FILE = `${process.env.RUNNER_TEMP}/codex-execution-output.json`;

export type CodexOptions = {
  codexArgs?: string;
  pathToCodexExecutable?: string;
};

type PreparedCodexConfig = {
  codexArgs: string[];
  promptPath: string;
  env: Record<string, string>;
};

export function prepareCodexConfig(
  promptPath: string,
  options: CodexOptions,
): PreparedCodexConfig {
  // Parse pre-built arguments from modes layer
  // The modes layer has already done all the complex parameter conversion
  const codexArgs: string[] = [];

  if (options.codexArgs?.trim()) {
    const parsed = parseShellArgs(options.codexArgs);
    codexArgs.push(
      ...parsed.filter((arg): arg is string => typeof arg === "string"),
    );
  } else {
    // Fallback to basic Codex arguments if no pre-built args provided
    codexArgs.push(
      "exec",
      "--full-auto",
      "--experimental-json",
      "--dangerously-bypass-approvals-and-sandbox",
    );
  }

  // Build environment variables for Codex execution
  const customEnv: Record<string, string> = {};

  // Copy process.env with only defined string values
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      customEnv[key] = value;
    }
  }

  // Set OpenAI credentials from environment variables
  const openaiApiKey =
    process.env.INPUT_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openaiApiKey) {
    customEnv.OPENAI_API_KEY = openaiApiKey;
    console.log("🔑 OpenAI API key configured for Codex process");
  } else {
    console.log("⚠️  No OpenAI API key found - Codex will likely fail with 401 Unauthorized");
  }

  const openaiBaseUrl =
    process.env.INPUT_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;
  if (openaiBaseUrl) {
    customEnv.OPENAI_BASE_URL = openaiBaseUrl;
    console.log(`🌐 OpenAI Base URL configured: ${openaiBaseUrl}`);
  } else {
    console.log("🌐 Using default OpenAI Base URL (https://api.openai.com/v1)");
  }

  // Set GitHub token if available (for MCP servers)
  if (process.env.GITHUB_TOKEN) {
    customEnv.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  }

  // Pass through action inputs if present
  if (process.env.INPUT_ACTION_INPUTS_PRESENT) {
    customEnv.GITHUB_ACTION_INPUTS = process.env.INPUT_ACTION_INPUTS_PRESENT;
  }

  // Debug: Log source and target environment variables
  console.log("🐛 Environment variable sources checked:");
  console.log(`  - INPUT_OPENAI_API_KEY: ${process.env.INPUT_OPENAI_API_KEY ? '[SET]' : '[NOT SET]'}`);
  console.log(`  - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '[SET]' : '[NOT SET]'}`);
  console.log(`  - INPUT_OPENAI_BASE_URL: ${process.env.INPUT_OPENAI_BASE_URL || '[NOT SET]'}`);
  console.log(`  - OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL || '[NOT SET]'}`);

  console.log("🐛 Environment variables being passed to Codex process:");
  const relevantVars = [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'GITHUB_TOKEN',
    'REPO_OWNER',
    'REPO_NAME',
    'CLAUDE_COMMENT_ID',
    'GITHUB_EVENT_NAME',
    'GITHUB_API_URL'
  ];

  relevantVars.forEach(varName => {
    if (customEnv[varName]) {
      const value = varName.includes('KEY') || varName.includes('TOKEN')
        ? '[SET]'
        : customEnv[varName];
      console.log(`  - ${varName}: ${value}`);
    } else {
      console.log(`  - ${varName}: [NOT SET]`);
    }
  });

  return {
    codexArgs,
    promptPath,
    env: customEnv,
  };
}

export async function runCodex(promptPath: string, options: CodexOptions) {
  const config = prepareCodexConfig(promptPath, options);

  // Log prompt file size
  let promptSize = "unknown";
  try {
    const stats = await stat(config.promptPath);
    promptSize = stats.size.toString();
  } catch (e) {
    // Ignore error
  }

  console.log(`Prompt file size: ${promptSize} bytes`);

  // Log custom arguments if any
  if (options.codexArgs && options.codexArgs.trim() !== "") {
    console.log(`Codex arguments: ${options.codexArgs}`);
  }

  // Output to console
  console.log(`Running Codex with prompt from file: ${config.promptPath}`);
  console.log(`Full command: codex ${config.codexArgs.join(" ")}`);

  // Use custom executable path if provided, otherwise default to "codex"
  const codexExecutable = options.pathToCodexExecutable || "codex";

  const codexProcess = spawn(codexExecutable, config.codexArgs, {
    stdio: ["pipe", "pipe", "inherit"],
    env: config.env,
  });

  // Handle Codex process errors
  codexProcess.on("error", (error) => {
    console.error("Error spawning Codex process:", error);
  });

  // Send prompt to Codex stdin
  try {
    const promptContent = await execAsync(`cat "${config.promptPath}"`);
    codexProcess.stdin.write(promptContent.stdout);
    codexProcess.stdin.end();
  } catch (error) {
    console.error("Error reading prompt file:", error);
    codexProcess.kill("SIGTERM");
    throw error;
  }

  // Capture output for parsing execution metrics
  let output = "";
  codexProcess.stdout.on("data", (data) => {
    const text = data.toString();

    // Try to parse as JSON and pretty print if it's on a single line
    const lines = text.split("\n");
    lines.forEach((line: string, index: number) => {
      if (line.trim() === "") return;

      try {
        // Check if this line is a JSON object
        const parsed = JSON.parse(line);
        const prettyJson = JSON.stringify(parsed, null, 2);
        process.stdout.write(prettyJson);
        if (index < lines.length - 1 || text.endsWith("\n")) {
          process.stdout.write("\n");
        }
      } catch (e) {
        // Not a JSON object, print as is
        process.stdout.write(line);
        if (index < lines.length - 1 || text.endsWith("\n")) {
          process.stdout.write("\n");
        }
      }
    });

    output += text;
  });

  // Handle stdout errors
  codexProcess.stdout.on("error", (error) => {
    console.error("Error reading Codex stdout:", error);
  });

  // Wait for Codex to finish
  const exitCode = await new Promise<number>((resolve) => {
    codexProcess.on("close", (code) => {
      resolve(code || 0);
    });

    codexProcess.on("error", (error) => {
      console.error("Codex process error:", error);
      resolve(1);
    });
  });

  // Set conclusion based on exit code
  if (exitCode === 0) {
    // Try to process the output and save execution metrics
    try {
      await writeFile("output.txt", output);

      // Process output.txt into JSON and save to execution file
      // Increase maxBuffer from Node.js default of 1MB to 10MB to handle large Codex outputs
      const { stdout: jsonOutput } = await execAsync("jq -s '.' output.txt", {
        maxBuffer: 10 * 1024 * 1024,
      });
      await writeFile(EXECUTION_FILE, jsonOutput);

      console.log(`Log saved to ${EXECUTION_FILE}`);
    } catch (e) {
      core.warning(`Failed to process output for execution metrics: ${e}`);
    }

    core.setOutput("conclusion", "success");
    core.setOutput("execution_file", EXECUTION_FILE);
  } else {
    core.setOutput("conclusion", "failure");

    // Still try to save execution file if we have output
    if (output) {
      try {
        await writeFile("output.txt", output);
        // Increase maxBuffer from Node.js default of 1MB to 10MB to handle large Codex outputs
        const { stdout: jsonOutput } = await execAsync("jq -s '.' output.txt", {
          maxBuffer: 10 * 1024 * 1024,
        });
        await writeFile(EXECUTION_FILE, jsonOutput);
        core.setOutput("execution_file", EXECUTION_FILE);
      } catch (e) {
        // Ignore errors when processing output during failure
      }
    }

    process.exit(exitCode);
  }
}
