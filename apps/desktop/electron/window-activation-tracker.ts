import type { BrowserWindow } from "electron";

type WindowEventName = "focus" | "blur" | "show" | "hide" | "minimize" | "restore";

const ACTIVATE_EVENTS: readonly WindowEventName[] = ["focus", "show", "restore"];
const VISIBILITY_EVENTS: readonly WindowEventName[] = [
  "focus",
  "blur",
  "show",
  "hide",
  "minimize",
  "restore",
];

export class WindowActivationTracker {
  private readonly activateListeners = new Set<() => void>();
  private readonly visibilityListeners = new Set<() => void>();
  private readonly registeredEvents = new Set<WindowEventName>();
  private readonly handlersByEvent = new Map<WindowEventName, () => void>();
  private readonly clearOnClosed = () => {
    this.dispose();
  };
  private disposed = false;

  constructor(private readonly window: BrowserWindow) {
    this.window.once("closed", this.clearOnClosed);
  }

  onActivate(listener: () => void): () => void {
    if (this.disposed) {
      return () => {};
    }
    this.activateListeners.add(listener);
    this.ensureEventsRegistered(ACTIVATE_EVENTS);
    return () => {
      this.activateListeners.delete(listener);
    };
  }

  onVisibilityChange(listener: () => void): () => void {
    if (this.disposed) {
      return () => {};
    }
    this.visibilityListeners.add(listener);
    this.ensureEventsRegistered(VISIBILITY_EVENTS);
    return () => {
      this.visibilityListeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const event of this.registeredEvents) {
      const handler = this.handlersByEvent.get(event);
      if (handler) {
        // Electron's typed BrowserWindow.off() overloads narrow per-event;
        // we know the union is valid for all these event names.
        (this.window.off as (e: string, h: () => void) => void)(event, handler);
      }
    }
    this.window.off("closed", this.clearOnClosed);
    this.registeredEvents.clear();
    this.handlersByEvent.clear();
    this.activateListeners.clear();
    this.visibilityListeners.clear();
  }

  private ensureEventsRegistered(events: readonly WindowEventName[]): void {
    for (const event of events) {
      if (this.registeredEvents.has(event)) {
        continue;
      }
      const handler = () => {
        this.fanOut(event);
      };
      this.handlersByEvent.set(event, handler);
      // Electron's typed BrowserWindow.on() overloads narrow per-event;
      // we know the union is valid for all these event names.
      (this.window.on as (e: string, h: () => void) => void)(event, handler);
      this.registeredEvents.add(event);
    }
  }

  private fanOut(event: WindowEventName): void {
    if (this.disposed) {
      return;
    }
    if ((ACTIVATE_EVENTS as readonly string[]).includes(event)) {
      for (const listener of [...this.activateListeners]) {
        try {
          listener();
        } catch {
          // listener errors should not break sibling listeners or the event loop
        }
      }
    }
    for (const listener of [...this.visibilityListeners]) {
      try {
        listener();
      } catch {
        // see above
      }
    }
  }
}
