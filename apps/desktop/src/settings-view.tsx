import { useMemo } from "react";
import type { RuntimeSettingsSnapshot, RuntimeSnapshot } from "@pi-app/session-driver/runtime-types";
import type { NotificationPreferences, WorkspaceRecord } from "./desktop-state";
import { ModelIcon, ReasoningIcon, RefreshIcon, SettingsIcon, SkillIcon, StatusIcon } from "./icons";

interface SettingsViewProps {
  readonly workspace?: WorkspaceRecord;
  readonly runtime?: RuntimeSnapshot;
  readonly notificationPreferences: NotificationPreferences;
  readonly onRefresh: () => void;
  readonly onSetDefaultModel: (provider: string, modelId: string) => void;
  readonly onSetThinkingLevel: (thinkingLevel: RuntimeSettingsSnapshot["defaultThinkingLevel"]) => void;
  readonly onToggleSkillCommands: (enabled: boolean) => void;
  readonly onSetScopedModelPatterns: (patterns: readonly string[]) => void;
  readonly onLoginProvider: (providerId: string) => void;
  readonly onLogoutProvider: (providerId: string) => void;
  readonly onSetNotificationPreferences: (preferences: Partial<NotificationPreferences>) => void;
}

const THINKING_LEVELS: NonNullable<RuntimeSettingsSnapshot["defaultThinkingLevel"]>[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

export function SettingsView({
  workspace,
  runtime,
  notificationPreferences,
  onRefresh,
  onSetDefaultModel,
  onSetThinkingLevel,
  onToggleSkillCommands,
  onSetScopedModelPatterns,
  onLoginProvider,
  onLogoutProvider,
  onSetNotificationPreferences,
}: SettingsViewProps) {
  const models = runtime?.models ?? [];
  const activeScopedPatterns = useMemo(() => {
    if (!runtime) {
      return [];
    }
    return runtime.settings.enabledModelPatterns.length > 0
      ? runtime.settings.enabledModelPatterns.map((entry) => entry.pattern)
      : models.map((model) => `${model.providerId}/${model.modelId}`);
  }, [models, runtime]);

  if (!workspace) {
    return (
      <section className="canvas canvas--empty">
        <div className="empty-panel">
          <div className="session-header__eyebrow">Settings</div>
          <h1>Select a workspace</h1>
          <p>Model, auth, and skill settings are scoped to the selected workspace.</p>
        </div>
      </section>
    );
  }

  return (
      <section className="canvas">
      <div className="conversation settings-view">
        <header className="view-header">
          <div>
            <div className="chat-header__eyebrow">Settings</div>
            <h1 className="view-header__title">Workspace settings</h1>
            <p className="view-header__body">Control providers, defaults, skills, and notifications for {workspace.name}.</p>
          </div>
          <button className="button button--secondary" type="button" onClick={onRefresh}>
            <RefreshIcon />
            <span>Refresh</span>
          </button>
        </header>

        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-card__header">
              <span className="settings-card__icon"><StatusIcon /></span>
              <div>
                <h2>Providers</h2>
                <p>Authenticate providers and inspect auth status for this workspace.</p>
              </div>
            </div>
            <div className="settings-list">
              {(runtime?.providers ?? []).map((provider) => (
                <div className="settings-list__row" key={provider.id}>
                  <div className="settings-list__body">
                    <div className="settings-list__title">{provider.name}</div>
                    <div className="settings-list__meta">
                      {provider.oauthSupported ? "OAuth" : provider.authType === "api_key" ? "API key" : "Built in"}
                      {provider.hasAuth ? " · connected" : ""}
                    </div>
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => (provider.hasAuth ? onLogoutProvider(provider.id) : onLoginProvider(provider.id))}
                  >
                    {provider.hasAuth ? "Logout" : provider.oauthSupported ? "Login" : "Manage"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <span className="settings-card__icon"><ModelIcon /></span>
              <div>
                <h2>Default model</h2>
                <p>Choose the default provider/model for new sessions in this workspace.</p>
              </div>
            </div>
            <div className="settings-pill-row">
              {models.filter((model) => model.available).map((model) => {
                const active =
                  runtime?.settings.defaultProvider === model.providerId &&
                  runtime?.settings.defaultModelId === model.modelId;
                return (
                  <button
                    className={`settings-pill ${active ? "settings-pill--active" : ""}`}
                    key={`${model.providerId}:${model.modelId}`}
                    type="button"
                    onClick={() => onSetDefaultModel(model.providerId, model.modelId)}
                  >
                    {model.providerId}:{model.modelId}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <span className="settings-card__icon"><ReasoningIcon /></span>
              <div>
                <h2>Reasoning</h2>
                <p>Set the workspace default thinking level.</p>
              </div>
            </div>
            <div className="settings-pill-row">
              {THINKING_LEVELS.map((level) => (
                <button
                  className={`settings-pill ${runtime?.settings.defaultThinkingLevel === level ? "settings-pill--active" : ""}`}
                  key={level}
                  type="button"
                  onClick={() => onSetThinkingLevel(level)}
                >
                  {labelForThinking(level)}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <span className="settings-card__icon"><SkillIcon /></span>
              <div>
                <h2>Skills</h2>
                <p>Control whether skills register slash commands in the composer.</p>
              </div>
            </div>
            <label className="settings-toggle">
              <input
                checked={runtime?.settings.enableSkillCommands ?? true}
                type="checkbox"
                onChange={(event) => onToggleSkillCommands(event.target.checked)}
              />
              <span>Enable skill slash commands</span>
            </label>
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <span className="settings-card__icon"><SettingsIcon /></span>
              <div>
                <h2>Scoped models</h2>
                <p>Choose which models stay in the quick-cycle shortlist.</p>
              </div>
            </div>
            <div className="settings-list">
              {models.map((model) => {
                const pattern = `${model.providerId}/${model.modelId}`;
                const enabled = activeScopedPatterns.includes(pattern);
                return (
                  <label className="settings-toggle" key={pattern}>
                    <input
                      checked={enabled}
                      type="checkbox"
                      onChange={(event) =>
                        onSetScopedModelPatterns(
                          event.target.checked
                            ? [...activeScopedPatterns, pattern]
                            : activeScopedPatterns.filter((entry) => entry !== pattern),
                        )
                      }
                    />
                    <span>{pattern}</span>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <span className="settings-card__icon"><StatusIcon /></span>
              <div>
                <h2>Notifications</h2>
                <p>Only background sessions should notify by default.</p>
              </div>
            </div>
            <div className="settings-toggle-list">
              <label className="settings-toggle">
                <input
                  checked={notificationPreferences.backgroundCompletion}
                  type="checkbox"
                  onChange={(event) => onSetNotificationPreferences({ backgroundCompletion: event.target.checked })}
                />
                <span>Background completion</span>
              </label>
              <label className="settings-toggle">
                <input
                  checked={notificationPreferences.backgroundFailure}
                  type="checkbox"
                  onChange={(event) => onSetNotificationPreferences({ backgroundFailure: event.target.checked })}
                />
                <span>Background failures</span>
              </label>
              <label className="settings-toggle">
                <input
                  checked={notificationPreferences.attentionNeeded}
                  type="checkbox"
                  onChange={(event) => onSetNotificationPreferences({ attentionNeeded: event.target.checked })}
                />
                <span>Needs input or approval</span>
              </label>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function labelForThinking(level: NonNullable<RuntimeSettingsSnapshot["defaultThinkingLevel"]>): string {
  if (level === "xhigh") {
    return "Extra High";
  }
  return level.charAt(0).toUpperCase() + level.slice(1);
}
