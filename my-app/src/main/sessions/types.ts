import type { HlEvent } from '../hl/agent';

export type SessionStatus = 'draft' | 'running' | 'stuck' | 'stopped';

export interface TabInfo {
  targetId: string;
  url: string;
  title: string;
  type: 'page' | 'iframe' | 'other';
  active: boolean;
}

export interface AgentSession {
  id: string;
  prompt: string;
  status: SessionStatus;
  createdAt: number;
  output: HlEvent[];
  error?: string;
}

export interface SessionEvents {
  'session-created': (session: AgentSession) => void;
  'session-updated': (session: AgentSession) => void;
  'session-completed': (session: AgentSession) => void;
  'session-error': (session: AgentSession) => void;
  'session-output': (id: string, event: HlEvent) => void;
}
