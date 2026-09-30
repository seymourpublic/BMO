import React from 'react';
import { COLOR_THEMES, SECRET_THEMES, ThemeName } from '../utils/themes';
import { Sheet } from './Sheet';
import { AboutYouPanel } from './AboutYouPanel';
import { Profile, ProfileField } from '../utils/memory';

interface SettingsPanelProps {
  themeName: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  secretsUnlocked: boolean;  // Show secret themes (Konami code found)
  voiceEnabled: boolean;
  onVoiceChange: (enabled: boolean) => void;
  profile: Profile;
  notes: string[];
  onProfileChange: (field: ProfileField, value: string) => void;
  onDeleteNote: (index: number) => void;
  onForget: () => void;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  themeName, onThemeChange, secretsUnlocked, voiceEnabled, onVoiceChange,
  profile, notes, onProfileChange, onDeleteNote, onForget, onClose
}) => (
  <Sheet title="Settings" onClose={onClose}>
    <h3 className="text-sm font-bold mb-2">BMO's colour</h3>
    <div className="grid grid-cols-4 gap-3 mb-6">
      {(Object.keys(COLOR_THEMES) as ThemeName[])
        .filter(name => secretsUnlocked || !SECRET_THEMES.includes(name))
        .map(name => {
        const t = COLOR_THEMES[name];
        const selected = name === themeName;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onThemeChange(name)}
            aria-pressed={selected}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 ${selected ? 'border-[#e43d3d] bg-white' : 'border-transparent hover:bg-white/60'}`}
          >
            <span
              className="w-10 h-12 rounded-md border-2 flex items-start justify-center pt-1"
              style={{ background: t.body, borderColor: t.outline }}
            >
              <span className="w-7 h-5 rounded-sm border" style={{ background: t.screen, borderColor: t.outline }} />
            </span>
            <span className="text-xs">{t.name}</span>
          </button>
        );
      })}
    </div>

    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
      <span>
        <span className="block text-sm font-bold">BMO's voice</span>
        <span className="block text-xs opacity-70">When off, BMO's replies only show on screen</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={voiceEnabled}
        onChange={e => onVoiceChange(e.target.checked)}
        className="w-6 h-6 accent-[#43b649]"
      />
    </label>

    <hr className="my-5 border-[#c9e6dd]" />
    <AboutYouPanel
      profile={profile}
      notes={notes}
      onFieldChange={onProfileChange}
      onDeleteNote={onDeleteNote}
      onForget={onForget}
    />
  </Sheet>
);
