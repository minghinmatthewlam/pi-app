import type { RuntimeSnapshot } from "@pi-gui/session-driver/runtime-types";
import { SettingsGroup, SettingsInfoRow, SettingsRow } from "./settings-utils";

interface SettingsGeneralSectionProps {
  readonly runtime?: RuntimeSnapshot;
  readonly onToggleSkillCommands: (enabled: boolean) => void;
}

export function SettingsGeneralSection({ runtime, onToggleSkillCommands }: SettingsGeneralSectionProps) {
  const connectedCount = runtime?.providers.filter((p) => p.hasAuth).length ?? 0;

  return (
    <>
      <SettingsGroup title="General">
        <SettingsInfoRow
          label="Connected providers"
          value={connectedCount > 0 ? String(connectedCount) : "None"}
        />
        <SettingsInfoRow label="Discovered skills" value={String(runtime?.skills.length ?? 0)} />
        <SettingsRow title="Enable skill slash commands" description="Keep skill slash commands available in the composer.">
          <input
            checked={runtime?.settings.enableSkillCommands ?? true}
            type="checkbox"
            onChange={(event) => onToggleSkillCommands(event.target.checked)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Shortcuts">
        <SettingsInfoRow label="New thread" value="Cmd+Shift+O" />
        <SettingsInfoRow label="Open settings" value="Cmd+," />
        <SettingsInfoRow label="Send message" value="Enter" />
        <SettingsInfoRow label="New line" value="Shift+Enter" />
      </SettingsGroup>
    </>
  );
}
