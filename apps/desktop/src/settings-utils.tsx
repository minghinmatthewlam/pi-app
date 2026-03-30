import type { ReactNode } from "react";
import type { RuntimeSettingsSnapshot, RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";

export type SettingsSection = "appearance" | "general" | "providers" | "models" | "notifications";

export const THINKING_LEVELS: NonNullable<RuntimeSettingsSnapshot["defaultThinkingLevel"]>[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

export function settingsPill(active: boolean): string {
  return `settings-pill${active ? " settings-pill--active" : ""}`;
}

export function labelForThinking(level: NonNullable<RuntimeSettingsSnapshot["defaultThinkingLevel"]>): string {
  if (level === "xhigh") {
    return "Extra High";
  }
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function sectionTitle(section: SettingsSection): string {
  switch (section) {
    case "appearance":
      return "Appearance";
    case "providers":
      return "Providers";
    case "models":
      return "Models";
    case "notifications":
      return "Notifications";
    default:
      return "General";
  }
}

export function sectionDescription(section: SettingsSection, workspaceName: string): string {
  switch (section) {
    case "appearance":
      return "Choose between light, dark, or automatic system theme.";
    case "providers":
      return `Connect providers and manage auth for ${workspaceName}.`;
    case "models":
      return `Choose defaults and quick-switch models for ${workspaceName}.`;
    case "notifications":
      return "Only background sessions should notify by default.";
    default:
      return "Keep the high-value app and runtime controls close to hand.";
  }
}

export function filterProviders(
  providers: readonly RuntimeSnapshot["providers"][number][],
  query: string,
): readonly RuntimeSnapshot["providers"][number][] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return providers;
  }
  return providers.filter((provider) =>
    [provider.id, provider.name, provider.authType].some((value) => value.toLowerCase().includes(normalized)),
  );
}

export function filterModels(
  models: readonly RuntimeSnapshot["models"][number][],
  query: string,
): readonly RuntimeSnapshot["models"][number][] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return models;
  }
  return models.filter((model) =>
    [model.providerId, model.providerName, model.modelId, model.label].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

/* ── Layout components ────────────────────────────────── */

export function SettingsGroup({
  title,
  description,
  children,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="settings-section">
      {title ? <h3 className="settings-section__title">{title}</h3> : null}
      {description ? <p className="settings-section__description">{description}</p> : null}
      <div className="settings-group">{children}</div>
    </div>
  );
}

export function SettingsRow({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__label">
        <div className="settings-row__title">{title}</div>
        {description ? <div className="settings-row__description">{description}</div> : null}
      </div>
      {children ? <div className="settings-row__control">{children}</div> : null}
    </div>
  );
}

export function SettingsInfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="settings-row">
      <div className="settings-row__label">
        <div className="settings-row__title">{label}</div>
      </div>
      <div className="settings-row__control">
        <span className="settings-row__value">{value}</span>
      </div>
    </div>
  );
}

export function ProviderRow({
  provider,
  onLoginProvider,
  onLogoutProvider,
}: {
  readonly provider: RuntimeSnapshot["providers"][number];
  readonly onLoginProvider: (providerId: string) => void;
  readonly onLogoutProvider: (providerId: string) => void;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__label">
        <div className="settings-row__title">{provider.name}</div>
        <div className="settings-row__description">
          {provider.oauthSupported ? "OAuth" : provider.authType === "api_key" ? "API key" : "Built in"}
          {provider.hasAuth ? " · connected" : ""}
        </div>
      </div>
      <div className="settings-row__control">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => (provider.hasAuth ? onLogoutProvider(provider.id) : onLoginProvider(provider.id))}
        >
          {provider.hasAuth ? "Logout" : provider.oauthSupported ? "Login" : "Configure externally"}
        </button>
      </div>
    </div>
  );
}
