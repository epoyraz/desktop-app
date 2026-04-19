const NOW = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export interface ActivityPoint {
  time: number;
  sessions: number;
  tokens: number;
}

export function generateActivityData(days: number): ActivityPoint[] {
  const points: ActivityPoint[] = [];
  const intervals = days * 24;

  for (let i = intervals; i >= 0; i--) {
    const time = NOW - i * HOUR;
    const hour = new Date(time).getHours();
    const isWorkHours = hour >= 9 && hour <= 18;
    const baseSessions = isWorkHours ? 4 : 1;
    const jitter = Math.floor(Math.random() * 3);
    const sessions = baseSessions + jitter;
    const tokens = sessions * (1200 + Math.floor(Math.random() * 800));

    points.push({ time, sessions, tokens });
  }

  return points;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  label: string;
}

export function getStatusBreakdown(total: number): StatusBreakdown[] {
  const running = Math.floor(total * 0.13);
  const stuck = Math.floor(total * 0.07);
  const draft = Math.floor(total * 0.05);
  const stopped = total - running - stuck - draft;

  return [
    { status: 'stopped', count: stopped, label: 'Stopped' },
    { status: 'running', count: running, label: 'Running' },
    { status: 'stuck', count: stuck, label: 'Stuck' },
    { status: 'draft', count: draft, label: 'Draft' },
  ];
}

export const MOCK_STATS = {
  totalSessions: 47,
  totalTokens: 284_320,
  avgSessionTime: 194,
  sessionsToday: 8,
};
