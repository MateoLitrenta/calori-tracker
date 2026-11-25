import type { DailyRecord, UserProfile } from '../types';
import type { ChatMessage, DataAction } from '../services/aiService';
import type { CoachCardSnapshot } from '../utils/coachPresentation';
import type { CoachGoalProposal } from '../utils/coachGoals';
import type { RecordedCoachAction } from './coachActionReview';

export interface CoachMessage extends ChatMessage {
  id: string;
  localTime?: string;
  coachCard?: CoachCardSnapshot;
  goalProgress?: 'all' | 'workout_sessions' | 'step_days';
  recordedActions?: RecordedCoachAction[];
}

export interface ActionCommitDraft {
  dateStr: string;
  base: DailyRecord;
  entryIds: string[];
  types: DataAction['type'][];
}

export interface PendingCoachRecord {
  dateStr: string;
  actions: DataAction[];
  registerAgain: number[];
  commit: ActionCommitDraft;
}

interface ConversationState {
  messages: CoachMessage[];
  pending: PendingCoachRecord | null;
  pendingGoal: CoachGoalProposal | null;
  isEditingProposal: boolean;
  operation: 'response' | 'record' | 'goal' | null;
}

type ConversationUpdate = Partial<Omit<ConversationState, 'operation'>>;

// The account owns this state; mounting/unmounting Coach only adds/removes a
// subscriber. Media, focus and viewport effects remain owned by the visible UI.
export class CoachConversation {
  private state: ConversationState;
  private listeners = new Set<() => void>();
  private active = true;
  private operationToken: symbol | null = null;
  private readProfile: () => UserProfile | null;
  private persistMessages: (messages: CoachMessage[]) => void;

  constructor(messages: CoachMessage[], readProfile: () => UserProfile | null,
    persistMessages: (messages: CoachMessage[]) => void) {
    this.state = { messages, pending: null, pendingGoal: null, isEditingProposal: false, operation: null };
    this.readProfile = readProfile;
    this.persistMessages = persistMessages;
  }

  getSnapshot = () => this.state;
  getProfile = () => this.active ? this.readProfile() : null;
  isBusy = () => !this.active || this.state.operation !== null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(next: ConversationState) {
    const previous = this.state;
    this.state = next;
    if (next.messages !== previous.messages) this.persistMessages(next.messages);
    this.listeners.forEach(listener => listener());
  }

  update(change: ConversationUpdate | ((previous: ConversationState) => ConversationUpdate)) {
    if (!this.active) return;
    this.publish({ ...this.state, ...(typeof change === 'function' ? change(this.state) : change) });
  }

  begin(operation: NonNullable<ConversationState['operation']>) {
    if (this.isBusy()) return null;
    const token = Symbol(operation);
    this.operationToken = token;
    this.publish({ ...this.state, operation });
    return token;
  }

  isCurrent = (token: symbol) => this.active && this.operationToken === token;

  finish(token: symbol, change: ConversationUpdate = {}) {
    if (!this.isCurrent(token)) return;
    this.operationToken = null;
    this.publish({ ...this.state, ...change, operation: null });
  }

  invalidate() {
    // An old account/epoch must not publish late responses or receipts, even
    // if the same person signs in again while the request is in flight.
    this.active = false;
    this.operationToken = null;
    this.listeners.clear();
  }
}

export class CoachConversationStore {
  private owner: string | null = null;
  private conversations = new Map<string, CoachConversation>();
  private readProfile: () => UserProfile | null;
  private onStorageError: () => void;

  constructor(readProfile: () => UserProfile | null, onStorageError: () => void = () => {}) {
    this.readProfile = readProfile;
    this.onStorageError = onStorageError;
  }

  configure(readProfile: () => UserProfile | null) {
    this.readProfile = readProfile;
  }

  resetOwner(owner: string | null) {
    this.conversations.forEach(conversation => conversation.invalidate());
    this.conversations.clear();
    this.owner = owner;
  }

  open(owner: string, dateStr: string, loadMessages: () => CoachMessage[]) {
    if (owner !== this.owner) throw new Error('La conversación no pertenece a la sesión activa.');
    let conversation = this.conversations.get(dateStr);
    if (!conversation) {
      const key = `calori:assistant:messages:${owner}:${dateStr}`;
      conversation = new CoachConversation(loadMessages(), () => {
        const profile = this.readProfile();
        return profile?.user_id === owner ? profile : null;
      }, messages => {
        try {
          if (messages.length) localStorage.setItem(key, JSON.stringify(messages));
          else localStorage.removeItem(key);
        } catch { this.onStorageError(); }
      });
      this.conversations.set(dateStr, conversation);
    }
    return conversation;
  }
}
