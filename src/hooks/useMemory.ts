import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '../types';
import { rememberConversation } from '../utils/api';
import { persistentCache } from '../utils/persistentCache';
import {
  BMOMemory, FollowUp, HistoryMessage, ProfileField,
  addThrow, clearMemory, dueFollowUp, emptyMemory, loadMemory, localDate, mergeGrowth, mergeLearned, saveMemory, toPayload,
  trimHistory, MEMORY_LIMITS
} from '../utils/memory';
import {
  ALL_FEATURE_IDS, Feature, FeatureId, Hand, MilestoneId, dueMilestone, featureById, milestonesCoveredBy, nextDream
} from '../utils/growth';

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
      const today = localDate();
      const { memory: learned, growth } = await rememberConversation(toPayload(current), toApiMessages(pending), today, keepalive);
      update(m => mergeGrowth(mergeLearned(m, learned, upTo), growth, today));
    } catch (error) {
      console.warn('BMO could not update its memory this time:', error);
    } finally {
      rememberingRef.current = false;
    }
  }, [update]);

  const addMessages = useCallback((messages: HistoryMessage[]) => {
    const fromFriend = messages.filter(msg => msg.role === 'user').length;
    update(m => trimHistory({
      ...m,
      history: [...m.history, ...messages],
      stats: { ...m.stats, chats: m.stats.chats + fromFriend }
    }));
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
    update(m => ({
      ...m,
      stats: { ...m.stats, visits: visits + 1, lastVisit: now, firstVisit: m.stats.firstVisit || now },
      // A brand-new friend meets BMO as it is now: no dreams about features it "learned" before
      features: visits === 0 ? { dreamed: [...ALL_FEATURE_IDS], used: m.features.used } : m.features
    }));
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

  const recordRps = useCallback((result: RpsResult, friendHand: Hand) => {
    update(m => ({
      ...m,
      stats: {
        ...m.stats,
        rps: { ...m.stats.rps, [result]: m.stats.rps[result] + 1 },
        rpsThrows: addThrow(m.stats.rpsThrows, friendHand)
      }
    }));
  }, [update]);

  // --- Growing ---
  // Something from the friend's life to ask about today; it's taken off the list once asked
  const takeFollowUp = useCallback((): FollowUp | null => {
    const due = dueFollowUp(memoryRef.current.followUps, localDate());
    if (due) update(m => ({ ...m, followUps: m.followUps.filter(f => f !== due) }));
    return due;
  }, [update]);

  // The next feature to dream about (marked as dreamed straight away)
  const takeDream = useCallback((): Feature | null => {
    const dream = nextDream(memoryRef.current.features);
    if (dream) update(m => ({ ...m, features: { ...m.features, dreamed: [...m.features.dreamed, dream.id] } }));
    return dream;
  }, [update]);

  // The first time the friend uses a feature: returns BMO's surprised line, or null if it's not the first time
  const firstUse = useCallback((id: FeatureId): string | null => {
    if (memoryRef.current.features.used.includes(id)) return null;
    update(m => ({ ...m, features: { dreamed: m.features.dreamed, used: [...m.features.used, id] } }));
    return featureById(id).firstUse;
  }, [update]);

  // A milestone to celebrate now (marked as seen straight away, with any smaller ones of its kind)
  const takeMilestone = useCallback((): MilestoneId | null => {
    const { stats, milestonesSeen } = memoryRef.current;
    const due = dueMilestone(stats, milestonesSeen);
    if (due) update(m => ({ ...m, milestonesSeen: [...new Set([...m.milestonesSeen, ...milestonesCoveredBy(due)])] }));
    return due;
  }, [update]);

  const recordDish = useCallback(() => {
    update(m => ({ ...m, stats: { ...m.stats, dishes: m.stats.dishes + 1 } }));
  }, [update]);

  // Something BMO should ask about later (e.g. how the leftovers were)
  const addFollowUp = useCallback((followUp: FollowUp) => {
    update(m => mergeGrowth(m, { followUps: [followUp], words: [], diary: '' }, localDate()));
  }, [update]);

  const recordPhoto = useCallback((kind: 'snapshot' | 'memory') => {
    update(m => ({
      ...m,
      stats: { ...m.stats, ...(kind === 'memory' ? { memories: m.stats.memories + 1 } : { photos: m.stats.photos + 1 }) }
    }));
  }, [update]);

  // The special friend introduced themselves: remember who they are (their edits still win later)
  const markSpecial = useCallback((name: string, pronouns: string) => {
    update(m => ({
      ...m,
      special: true,
      profile: { ...m.profile, name, pronouns },
      userEdited: { ...m.userEdited, name: true, pronouns: true }
    }));
  }, [update]);

  const recordGameScore = useCallback((score: number) => {
    update(m => score > m.stats.gameBest ? { ...m, stats: { ...m.stats, gameBest: score } } : m);
  }, [update]);

  const unlockKonami = useCallback(() => {
    update(m => ({ ...m, stats: { ...m.stats, konami: true } }));
  }, [update]);

  const markOccasionSeen = useCallback((id: string, year: number) => {
    update(m => ({ ...m, occasionsSeen: { ...m.occasionsSeen, [id]: year } }));
  }, [update]);

  const markBathJoke = useCallback((date: string) => {
    update(m => ({ ...m, lastBathJoke: date }));
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
    takeFollowUp,
    takeDream,
    firstUse,
    takeMilestone,
    recordPhoto,
    recordDish,
    addFollowUp,
    markSpecial,
    recordGameScore,
    unlockKonami,
    markBathJoke,
    markOccasionSeen,
    forgetEverything
  };
};
