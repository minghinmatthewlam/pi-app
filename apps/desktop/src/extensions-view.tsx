import { useMemo, useState } from "react";
import type { RuntimeExtensionRecord, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import type { WorkspaceRecord } from "./desktop-state";
import { RefreshIcon } from "./icons";

interface ExtensionsViewProps {
  readonly workspace?: WorkspaceRecord;
  readonly runtime?: RuntimeSnapshot;
  readonly onRefresh: () => void;
  readonly onOpenExtensionFolder: (filePath: string) => void;
  readonly onToggleExtension: (filePath: string, enabled: boolean) => void;
}

export function ExtensionsView({
  workspace,
  runtime,
  onRefresh,
  onOpenExtensionFolder,
  onToggleExtension,
}: ExtensionsViewProps) {
  const [query, setQuery] = useState("");
  const [selectedExtensionPath, setSelectedExtensionPath] = useState<string | undefined>();
  const extensions = runtime?.extensions ?? [];
  const filteredExtensions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return extensions;
    }

    return extensions.filter((extension) =>
      [
        extension.displayName,
        extension.path,
        extension.sourceInfo.source,
        extension.sourceInfo.scope,
        extension.sourceInfo.origin,
        ...extension.commands,
        ...extension.tools,
        ...extension.flags,
        ...extension.shortcuts,
        ...extension.diagnostics.map((diagnostic) => diagnostic.message),
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [extensions, query]);
  const selectedExtension =
    filteredExtensions.find((extension) => extension.path === selectedExtensionPath) ?? filteredExtensions[0];

  if (!workspace) {
    return (
      <section className="canvas canvas--empty">
        <div className="empty-panel">
          <div className="session-header__eyebrow">Extensions</div>
          <h1>Select a workspace</h1>
          <p>Extensions are discovered from the selected workspace plus your user-level extension directories.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="canvas">
      <div className="conversation skills-view">
        <header className="view-header">
          <div>
            <div className="chat-header__eyebrow">Extensions</div>
            <h1 className="view-header__title">Extensions</h1>
            <p className="view-header__body">
              Inspect and manage first-class runtime extensions for this workspace.
            </p>
          </div>
          <div className="view-header__actions">
            <button className="button button--secondary" type="button" onClick={onRefresh}>
              <RefreshIcon />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <div className="skills-toolbar">
          <input
            aria-label="Search extensions"
            className="skills-search"
            placeholder="Search extensions"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </div>

        <div className="skills-layout">
          <div className="skills-grid" data-testid="extensions-list">
            {filteredExtensions.length === 0 ? (
              <ExtensionsEmptyState message="Refresh runtime discovery to load workspace and user-level extensions." />
            ) : (
              filteredExtensions.map((extension) => (
                <button
                  className={`skill-card ${selectedExtension?.path === extension.path ? "skill-card--active" : ""}`}
                  key={extension.path}
                  type="button"
                  onClick={() => {
                    setSelectedExtensionPath(extension.path);
                  }}
                >
                  <span className="skill-card__title-row">
                    <span className="skill-card__title">{extension.displayName}</span>
                    <span className={`skill-card__badge ${extension.enabled ? "skill-card__badge--enabled" : ""}`}>
                      {extension.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </span>
                  <span className="skill-card__description">
                    {extension.sourceInfo.scope} · {extension.sourceInfo.origin}
                  </span>
                  <span className="skill-card__meta">
                    <span>{extension.sourceInfo.source}</span>
                    {extension.commands.length > 0 ? <span>{extension.commands.length} commands</span> : null}
                    {extension.tools.length > 0 ? <span>{extension.tools.length} tools</span> : null}
                    {extension.diagnostics.length > 0 ? <span>{extension.diagnostics.length} issues</span> : null}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="skill-detail">
            {selectedExtension ? (
              <>
                <div className="skill-detail__header">
                  <div>
                    <h2>{selectedExtension.displayName}</h2>
                    <div className="skill-detail__slash">{selectedExtension.sourceInfo.source}</div>
                  </div>
                  <span className={`skill-detail__status ${selectedExtension.enabled ? "skill-detail__status--enabled" : ""}`}>
                    {selectedExtension.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="skill-detail__meta-list">
                  <DetailItem label="Scope" value={selectedExtension.sourceInfo.scope} />
                  <DetailItem label="Origin" value={selectedExtension.sourceInfo.origin} />
                  <DetailItem label="Path" value={selectedExtension.path} mono />
                  {selectedExtension.sourceInfo.baseDir ? (
                    <DetailItem label="Base dir" value={selectedExtension.sourceInfo.baseDir} mono />
                  ) : null}
                </div>
                <div className="skill-detail__actions">
                  <button className="button button--secondary" type="button" onClick={() => onOpenExtensionFolder(selectedExtension.path)}>
                    Open folder
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => onToggleExtension(selectedExtension.path, !selectedExtension.enabled)}
                  >
                    {selectedExtension.enabled ? "Disable" : "Enable"}
                  </button>
                </div>

                <ExtensionContributionSection title="Commands" items={selectedExtension.commands} emptyLabel="No commands contributed." />
                <ExtensionContributionSection title="Tools" items={selectedExtension.tools} emptyLabel="No tools contributed." />
                <ExtensionContributionSection title="Flags" items={selectedExtension.flags} emptyLabel="No flags contributed." />
                <ExtensionContributionSection title="Shortcuts" items={selectedExtension.shortcuts} emptyLabel="No shortcuts contributed." />
                <ExtensionDiagnostics diagnostics={selectedExtension.diagnostics} />
              </>
            ) : (
              <ExtensionsEmptyState message="Refresh runtime discovery to inspect extension metadata and diagnostics." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div>
      <div className="skill-detail__meta-label">{label}</div>
      <div className={mono ? "skill-detail__path" : "skill-detail__description"}>{value}</div>
    </div>
  );
}

function ExtensionContributionSection({
  title,
  items,
  emptyLabel,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly emptyLabel: string;
}) {
  return (
    <div className="skill-detail__meta-list">
      <div>
        <div className="skill-detail__meta-label">{title}</div>
        {items.length > 0 ? (
          <div className="extension-detail__tokens">
            {items.map((item) => (
              <span className="slash-menu__skill-badge" key={item}>
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="skill-detail__description">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}

function ExtensionDiagnostics({
  diagnostics,
}: {
  readonly diagnostics: RuntimeExtensionRecord["diagnostics"];
}) {
  return (
    <div className="skill-detail__meta-list">
      <div>
        <div className="skill-detail__meta-label">Diagnostics</div>
        {diagnostics.length > 0 ? (
          <div className="extension-detail__diagnostics">
            {diagnostics.map((diagnostic, index) => (
              <div className={`activity-item activity-item--${diagnostic.type === "error" ? "error" : "info"}`} key={`${diagnostic.message}:${index}`}>
                <div className="activity-item__text">{diagnostic.message}</div>
                {diagnostic.path ? <div className="activity-item__meta">{diagnostic.path}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="skill-detail__description">No diagnostics reported.</div>
        )}
      </div>
    </div>
  );
}

function ExtensionsEmptyState({ message }: { readonly message: string }) {
  return (
    <div className="empty-state">
      <h2>No extensions found</h2>
      <p>{message}</p>
    </div>
  );
}
