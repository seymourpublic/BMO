import React, { useState } from 'react';
import { MEMORY_LIMITS, Profile, ProfileField } from '../utils/memory';

interface AboutYouProps {
  profile: Profile;
  notes: string[];
  onFieldChange: (field: ProfileField, value: string) => void;
  onDeleteNote: (index: number) => void;
  onForget: () => void;
}

const FIELDS: Array<{ field: ProfileField; label: string; placeholder: string; multiline?: boolean }> = [
  { field: 'name', label: 'Name', placeholder: "BMO doesn't know yet" },
  { field: 'pronouns', label: 'Pronouns / gender', placeholder: 'Only what you tell BMO, e.g. she/her' },
  { field: 'personality', label: 'What you’re like', placeholder: 'BMO is still getting to know you', multiline: true },
];

// One editable profile field. Saves when you leave the field, and only if it changed.
const ProfileInput: React.FC<{
  field: ProfileField; label: string; placeholder: string; multiline?: boolean;
  value: string; onSave: (field: ProfileField, value: string) => void;
}> = ({ field, label, placeholder, multiline, value, onSave }) => {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  // Pick up changes BMO learns while the panel is open
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const save = () => {
    if (draft.trim() !== value) onSave(field, draft.trim());
  };
  const common = {
    id: `about-${field}`,
    value: draft,
    placeholder,
    maxLength: MEMORY_LIMITS[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: save,
    className: 'w-full rounded-lg border-2 border-[#c9e6dd] bg-white px-3 py-2 text-sm outline-none focus:border-[#65c3ab]'
  };

  return (
    <div className="mb-3">
      <label htmlFor={common.id} className="block text-xs font-semibold mb-1">{label}</label>
      {multiline
        ? <textarea {...common} rows={2} />
        : <input {...common} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
    </div>
  );
};

export const AboutYouPanel: React.FC<AboutYouProps> = ({ profile, notes, onFieldChange, onDeleteNote, onForget }) => {
  const [confirmingForget, setConfirmingForget] = useState(false);

  return (
    <section>
      <h3 className="text-sm font-bold mb-1">About you</h3>
      <p className="text-xs opacity-70 mb-3">BMO learns these from your chats. Your edits always win. Stored only on this device.</p>

      {FIELDS.map(f => (
        <ProfileInput key={f.field} {...f} value={profile[f.field]} onSave={onFieldChange} />
      ))}

      <h4 className="text-xs font-semibold mt-4 mb-1">Things BMO remembers</h4>
      {notes.length === 0 ? (
        <p className="text-xs opacity-70 mb-3">Nothing yet. Chat with BMO and it will remember the important stuff.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1">
          {notes.map((note, i) => (
            <li key={`${i}-${note}`} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm">
              <span className="flex-1">{note}</span>
              <button
                type="button"
                onClick={() => onDeleteNote(i)}
                aria-label={`Forget: ${note}`}
                className="shrink-0 w-6 h-6 rounded-full text-sm hover:bg-black/5"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirmingForget ? (
        <div className="flex items-center gap-2 rounded-lg bg-[#ffe3e3] p-3">
          <span className="flex-1 text-sm">Forget your profile, notes and all past messages?</span>
          <button type="button" onClick={() => { onForget(); setConfirmingForget(false); }} className="rounded-full px-3 py-1.5 text-sm font-bold text-white bg-[#e43d3d]">
            Forget
          </button>
          <button type="button" onClick={() => setConfirmingForget(false)} className="rounded-full px-3 py-1.5 text-sm">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmingForget(true)} className="text-sm font-semibold text-[#c62828] underline underline-offset-2">
          Forget everything
        </button>
      )}
    </section>
  );
};
