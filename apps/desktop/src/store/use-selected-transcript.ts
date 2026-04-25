import { useSyncExternalStore } from "react";
import { appStore } from "./app-store";

export function useSelectedTranscript() {
  return useSyncExternalStore(
    appStore.subscribeToTranscript,
    appStore.getTranscript,
    appStore.getTranscript,
  );
}
