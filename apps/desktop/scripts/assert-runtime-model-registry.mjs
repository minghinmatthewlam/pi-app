import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

const registry = ModelRegistry.inMemory(AuthStorage.inMemory());
const codexModel = registry.getAll().find((model) => model.provider === "openai-codex" && model.id === "gpt-5.5");

if (!codexModel) {
  throw new Error("Bundled Pi runtime does not expose openai-codex/gpt-5.5.");
}

if (!codexModel.reasoning) {
  throw new Error("Bundled openai-codex/gpt-5.5 model is missing reasoning support.");
}

if (!codexModel.input.includes("image")) {
  throw new Error("Bundled openai-codex/gpt-5.5 model is missing image input support.");
}

console.log("Verified bundled Pi runtime exposes openai-codex/gpt-5.5.");
