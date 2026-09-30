import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '../types';
import { rememberConversation } from '../utils/api';
import { persistentCache } from '../utils/persistentCache';
import {
  BMOMemory, HistoryMessage, ProfileField,
  clearMemory, emptyMemory, loadMemory, mergeLearned, saveMemory, toPayload, trimHistory, MEMORY_LIMITS
} from '../utils/memory';

// Update BMO's memory after this many new messages
const REMEMBER_EVERY = 6;
// When the page is hidden, update memory if at least this many messages are new
const REMEMBER_ON_LEAVE = 2;
// The backend accepts at most this many messages per memory update
const MAX_REMEMBER_MESSAGES = 30;

export type RpsResult = 'friend' | 'bmo' | 'ties';

const toApiMessages = (history: HistoryMessage[]): Message[] =>
  history.slice(-MAX_REMEMBER_MESSAGES).map(m => ({
    role: m.role,
    content: m.kind === 'story' ? '(Friend asked BMO for a story)' : m.text.slice(0, 2000)
  }));

export const useMemory = () => {
  const [memory, setMemory] = useState<BMOMemory>(loadMemory);
  const memoryRef = useRef(memory);
  const rememberingRef = useRef(false);

  // Every change is saved straight away
  const update = useCallback((change: (m: BMOMemory) => BMOMemory) => {
    const next = change(memoryRef.current);
    memoryRef.current = next;
    saveMemory(next);
    setMemory(next);
  }, []);

  const payload = useMemo(() => toPayload(memory), [memory]);

  // Send unsummarised messages to the backend and merge what it learned
  const remember = useCallback(async (keepalive = false) => {
    const current = memoryRef.current;
    const pending = current.history.slice(current.pendingSince);
    if (rememberingRef.current || pending.length === 0) return;

    rememberingRef.current = true;
    const upTo = current.history.length;
    try {
      const learned = await rememberConversation(toPayload(current), toApiMessages(pending), keepalive);
      update(m => mergeLearned(m, learned, upTo));
    } catch (error) {
      console.warn('BMO could not update its memory this time:', error);
    } finally {
      rememberingRef.current = false;
    }
  }, [update]);

  const addMessages = useCallback((messages: HistoryMessage[]) => {
    update(m => trimHistory({ ...m, history: [...m.history, ...messages] }));
    const m = memoryRef.current;
    if (m.history.length - m.pendingSince >= REMEMBER_EVERY) remember();
  }, [update, remember]);

  // Update memory when the friend leaves (tab hidden, app switched, page closed)
  useEffect(() => {
    const onLeave = () => {
      const m = memoryRef.current;
      if (m.history.length - m.pendingSince >= REMEMBER_ON_LEAVE) remember(true);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') onLeave(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [remember]);

  // Count a visit; returns what the greeting needs to know about the previous visit
  const recordVisit = useCallback(() => {
    const { visits, lastVisit } = memoryRef.current.stats;
    const now = Date.now();
    update(m => ({ ...m, stats: { ...m.stats, visits: visits + 1, lastVisit: now } }));
    return {
      visits: visits + 1,
      hoursAway: lastVisit ? (now - lastVisit) / 3_600_000 : 0
    };
  }, [update]);

  const setProfileField = useCallback((field: ProfileField, value: string) => {
    update(m => ({
      ...m,
      profile: { ...m.profile, [field]: value.slice(0, MEMORY_LIMITS[field]) },
      userEdited: { ...m.userEdited, [field]: true }
    }));
  }, [update]);

  const deleteNote = useCallback((index: number) => {
    update(m => ({ ...m, notes: m.notes.filter((_, i) => i !== index) }));
  }, [update]);

  const recordRps = useCallback((result: RpsResult) => {
    update(m => ({ ...m, stats: { ...m.stats, rps: { ...m.stats.rps, [result]: m.stats.rps[result] + 1 } } }));
  }, [update]);

  // Wipe everything BMO knows, including cached replies that might mention it
  const forgetEverything = useCallback(() => {
    clearMemory();
    persistentCache.clear().catch(() => {});
    const fresh = emptyMemory();
    memoryRef.current = fresh;
    setMemory(fresh);
  }, []);

  return {
    memory,
    payload,
    addMessages,
    recordVisit,
    setProfileField,
    deleteNote,
    recordRps,
    forgetEverything
  };
};
