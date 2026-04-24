import { join, resolve } from "node:path";
import { AuthStorage, ModelRegistry, getAgentDir } from "@mariozechner/pi-coding-agent";
import type { RuntimeSupervisorOptions } from "./runtime-supervisor.js";

export interface RuntimeDependencies {
  readonly agentDir: string;
  readonly authStorage: AuthStorage;
  readonly modelRegistry: ModelRegistry;
}

export function createRuntimeDependencies(options: RuntimeSupervisorOptions = {}): RuntimeDependencies {
  const agentDir = resolve(options.agentDir ?? getAgentDir());
  const authStorage = options.authStorage ?? AuthStorage.create(join(agentDir, "auth.json"));
  const modelRegistry = options.modelRegistry ?? ModelRegistry.create(authStorage, join(agentDir, "models.json"));
  return {
    agentDir,
    authStorage,
    modelRegistry,
  };
}
