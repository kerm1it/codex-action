/**
 * Validates the environment variables required for running Claude Code or Codex
 * based on the selected provider (Anthropic API, AWS Bedrock, Google Vertex AI, or OpenAI API)
 */
export function validateEnvironmentVariables() {
  const useCodex =
    process.env.INPUT_USE_CODEX === "true" ||
    process.env.INPUT_PATH_TO_CODEX_EXECUTABLE;
  const useBedrock = process.env.CLAUDE_CODE_USE_BEDROCK === "1";
  const useVertex = process.env.CLAUDE_CODE_USE_VERTEX === "1";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const claudeCodeOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const openaiApiKey =
    process.env.OPENAI_API_KEY || process.env.INPUT_OPENAI_API_KEY;

  const errors: string[] = [];

  // If using Codex, validate OpenAI requirements instead of Anthropic
  if (useCodex) {
    console.log("🔍 Validating Codex environment variables...");
    console.log(`  - INPUT_OPENAI_API_KEY: ${process.env.INPUT_OPENAI_API_KEY ? '[SET]' : '[NOT SET]'}`);
    console.log(`  - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '[SET]' : '[NOT SET]'}`);
    console.log(`  - INPUT_OPENAI_BASE_URL: ${process.env.INPUT_OPENAI_BASE_URL ? process.env.INPUT_OPENAI_BASE_URL : '[NOT SET]'}`);
    console.log(`  - OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL ? process.env.OPENAI_BASE_URL : '[NOT SET]'}`);

    if (!openaiApiKey) {
      errors.push("OPENAI_API_KEY is required when using Codex CLI.");
      console.log("❌ Missing OPENAI_API_KEY - please ensure it's set as 'openai_api_key' input or 'OPENAI_API_KEY' environment variable");
    } else {
      console.log("✅ OpenAI API key found");
    }

    // Skip other validations for Codex mode
    if (errors.length > 0) {
      const errorMessage = `Environment variable validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      throw new Error(errorMessage);
    }
    return; // Early return for Codex mode
  }

  // Original Claude Code validation logic
  if (useBedrock && useVertex) {
    errors.push(
      "Cannot use both Bedrock and Vertex AI simultaneously. Please set only one provider.",
    );
  }

  if (!useBedrock && !useVertex) {
    if (!anthropicApiKey && !claudeCodeOAuthToken) {
      errors.push(
        "Either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN is required when using direct Anthropic API.",
      );
    }
  } else if (useBedrock) {
    const requiredBedrockVars = {
      AWS_REGION: process.env.AWS_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    };

    Object.entries(requiredBedrockVars).forEach(([key, value]) => {
      if (!value) {
        errors.push(`${key} is required when using AWS Bedrock.`);
      }
    });
  } else if (useVertex) {
    const requiredVertexVars = {
      ANTHROPIC_VERTEX_PROJECT_ID: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
      CLOUD_ML_REGION: process.env.CLOUD_ML_REGION,
    };

    Object.entries(requiredVertexVars).forEach(([key, value]) => {
      if (!value) {
        errors.push(`${key} is required when using Google Vertex AI.`);
      }
    });
  }

  if (errors.length > 0) {
    const errorMessage = `Environment variable validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    throw new Error(errorMessage);
  }
}
