import { SettingsIcon } from "./icons";
import { SettingsCard } from "./settings-utils";

interface SettingsAppearanceSectionProps {
  readonly themeMode: "system" | "light" | "dark";
  readonly onSetThemeMode: (mode: "system" | "light" | "dark") => void;
}

const THEME_OPTIONS: { mode: "system" | "light" | "dark"; label: string; description: string }[] = [
  { mode: "system", label: "System", description: "Follow your OS appearance setting" },
  { mode: "light", label: "Light", description: "Always use the light theme" },
  { mode: "dark", label: "Dark", description: "Always use the dark theme" },
];

export function SettingsAppearanceSection({ themeMode, onSetThemeMode }: SettingsAppearanceSectionProps) {
  return (
    <SettingsCard
      description="Switch between light and dark themes, or follow your system preference."
      icon={<SettingsIcon />}
      title="Theme"
    >
      <div className="settings-option-list">
        {THEME_OPTIONS.map((option) => (
          <button
            className={`settings-option${themeMode === option.mode ? " settings-option--active" : ""}`}
            key={option.mode}
            type="button"
            onClick={() => onSetThemeMode(option.mode)}
          >
            <div className="settings-option__title">{option.label}</div>
            <div className="settings-option__meta">{option.description}</div>
          </button>
        ))}
      </div>
    </SettingsCard>
  );
}
