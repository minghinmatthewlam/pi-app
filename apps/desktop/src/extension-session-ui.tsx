import { useEffect, useState } from "react";
import type { HostUiResponse } from "@pi-gui/session-driver";
import type { SessionExtensionDialogRecord, SessionExtensionUiStateRecord } from "./desktop-state";

export function partitionExtensionUiState(uiState?: SessionExtensionUiStateRecord) {
  const widgets = uiState?.widgets ?? [];
  return {
    statuses: uiState?.statuses ?? [],
    aboveComposerWidgets: widgets.filter((widget) => widget.placement === "aboveComposer"),
    belowComposerWidgets: widgets.filter((widget) => widget.placement === "belowComposer"),
    activeDialog: uiState?.pendingDialogs[0],
  } as const;
}

export function ExtensionStatusStrip({
  statuses,
}: {
  readonly statuses: SessionExtensionUiStateRecord["statuses"];
}) {
  return (
    <div className="extension-status-strip" data-testid="extension-status-strip">
      {statuses.map((status) => (
        <div className="extension-status-strip__item" key={status.key}>
          <span className="extension-status-strip__label">{status.key}</span>
          <span>{status.text}</span>
        </div>
      ))}
    </div>
  );
}

export function ExtensionWidgetRail({
  title,
  widgets,
}: {
  readonly title: string;
  readonly widgets: SessionExtensionUiStateRecord["widgets"];
}) {
  return (
    <div className="extension-widget-rail" data-testid="extension-widget-rail">
      <div className="extension-widget-rail__title">{title}</div>
      <div className="extension-widget-rail__list">
        {widgets.map((widget) => (
          <div className="extension-widget-card" key={widget.key}>
            <div className="extension-widget-card__key">{widget.key}</div>
            <div className="extension-widget-card__body">
              {widget.lines.map((line, index) => (
                <div key={`${widget.key}:${index}`}>{line}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExtensionDialog({
  dialog,
  onRespond,
}: {
  readonly dialog: SessionExtensionDialogRecord;
  readonly onRespond: (response: HostUiResponse) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (dialog.kind === "input") {
      setDraft(dialog.initialValue ?? "");
      return;
    }
    if (dialog.kind === "editor") {
      setDraft(dialog.initialValue ?? "");
      return;
    }
    setDraft("");
  }, [dialog]);

  return (
    <div className="extension-dialog-backdrop">
      <div className="extension-dialog" data-testid="extension-dialog">
        <div className="extension-dialog__title">{dialog.title}</div>
        {dialog.kind === "confirm" ? <p className="extension-dialog__body">{dialog.message}</p> : null}

        {dialog.kind === "select" ? (
          <div className="extension-dialog__options">
            {dialog.options.map((option) => (
              <button
                className="extension-dialog__option"
                key={option}
                type="button"
                onClick={() => onRespond({ requestId: dialog.requestId, value: option })}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}

        {dialog.kind === "input" ? (
          <input
            autoFocus
            className="skills-search"
            placeholder={dialog.placeholder ?? "Enter a value"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : null}

        {dialog.kind === "editor" ? (
          <textarea
            autoFocus
            className="extension-dialog__editor"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        ) : null}

        <div className="extension-dialog__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => onRespond({ requestId: dialog.requestId, cancelled: true })}
          >
            Cancel
          </button>
          {dialog.kind === "confirm" ? (
            <button
              className="button button--primary"
              type="button"
              onClick={() => onRespond({ requestId: dialog.requestId, confirmed: true })}
            >
              Confirm
            </button>
          ) : null}
          {dialog.kind === "input" || dialog.kind === "editor" ? (
            <button
              className="button button--primary"
              type="button"
              onClick={() => onRespond({ requestId: dialog.requestId, value: draft })}
            >
              Submit
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
