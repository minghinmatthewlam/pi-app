import type {
  DesktopAppState,
  SelectedTranscriptRecord,
} from "../desktop-state";

type Listener = () => void;

class AppStore {
  private snapshot: DesktopAppState | null = null;
  private transcript: SelectedTranscriptRecord | null = null;
  private readonly snapshotListeners = new Set<Listener>();
  private readonly transcriptListeners = new Set<Listener>();
  private bootstrapping = false;
  private subscribedToIpc = false;
  private unsubscribeStateIpc: (() => void) | undefined;
  private unsubscribeTranscriptIpc: (() => void) | undefined;

  /** Returns the current snapshot. May be null until first IPC payload arrives. */
  getSnapshot = (): DesktopAppState | null => {
    void this.ensureSubscribed();
    return this.snapshot;
  };

  /** Returns the current transcript. May be null until first IPC payload arrives. */
  getTranscript = (): SelectedTranscriptRecord | null => {
    void this.ensureSubscribed();
    return this.transcript;
  };

  /** Subscribe to snapshot changes. Returns an unsubscribe function. */
  subscribe = (listener: Listener): (() => void) => {
    this.snapshotListeners.add(listener);
    void this.ensureSubscribed();
    return () => {
      this.snapshotListeners.delete(listener);
    };
  };

  /** Subscribe to transcript changes. Returns an unsubscribe function. */
  subscribeToTranscript = (listener: Listener): (() => void) => {
    this.transcriptListeners.add(listener);
    void this.ensureSubscribed();
    return () => {
      this.transcriptListeners.delete(listener);
    };
  };

  /** Apply a snapshot returned from a dispatch-style IPC call. */
  applyState = (state: DesktopAppState): void => {
    if (state === this.snapshot) {
      return;
    }
    this.snapshot = state;
    this.emitSnapshot();
  };

  /** Apply a transcript payload from IPC. */
  applyTranscript = (transcript: SelectedTranscriptRecord | null): void => {
    if (transcript === this.transcript) {
      return;
    }
    this.transcript = transcript;
    this.emitTranscript();
  };

  /**
   * Idempotent IPC bootstrap. Called automatically by the first subscriber or
   * the first getSnapshot/getTranscript call. Survives HMR by guarding against
   * double-subscription.
   */
  private ensureSubscribed(): void {
    if (this.subscribedToIpc || this.bootstrapping) {
      return;
    }
    const api = window.piApp;
    if (!api) {
      return;
    }
    this.bootstrapping = true;

    void Promise.all([api.getState(), api.getSelectedTranscript()])
      .then(([state, transcript]) => {
        // Don't overwrite a more recent state that arrived via onStateChanged
        // between the bootstrap fetch and its resolution.
        if (this.snapshot === null) {
          this.snapshot = state;
          this.emitSnapshot();
        }
        if (this.transcript === null) {
          this.transcript = transcript;
          this.emitTranscript();
        }
      })
      .finally(() => {
        this.bootstrapping = false;
      });

    this.unsubscribeStateIpc = api.onStateChanged((state) => {
      this.applyState(state);
    });
    this.unsubscribeTranscriptIpc = api.onSelectedTranscriptChanged((payload) => {
      this.applyTranscript(payload);
    });
    this.subscribedToIpc = true;
  }

  private emitSnapshot(): void {
    for (const listener of [...this.snapshotListeners]) {
      try {
        listener();
      } catch {
        // listener errors should not break sibling listeners
      }
    }
  }

  private emitTranscript(): void {
    for (const listener of [...this.transcriptListeners]) {
      try {
        listener();
      } catch {
        // see above
      }
    }
  }

  /** Test/HMR escape hatch — drop IPC subscription and clear cached state. */
  __resetForTesting(): void {
    this.unsubscribeStateIpc?.();
    this.unsubscribeStateIpc = undefined;
    this.unsubscribeTranscriptIpc?.();
    this.unsubscribeTranscriptIpc = undefined;
    this.subscribedToIpc = false;
    this.snapshot = null;
    this.transcript = null;
  }
}

export const appStore = new AppStore();
