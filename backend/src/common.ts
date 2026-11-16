export const REASONS = ['Reliever absent', 'Reliever on rest', 'Extra loading', 'Extra work required', 'Machine not manned', 'Training', 'WCM activity'];
export const APPROVERS = [
  { name: 'Imran Aziz Salaria', email: '' },
  { name: 'Iftikhar Alam', email: '' },
];
export const POWER_USER = { name: 'Power User', email: '' };
export const TZ = 'Asia/Karachi';
export const SESSION_DAYS = 30;

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function num(v: unknown) {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function karachiParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') bag[p.type] = p.value;
  }
  if (bag.hour === '24') bag.hour = '00';
  return bag;
}

export function nowStamp(date = new Date()) {
  const p = karachiParts(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function todayISO(date = new Date()) {
  const p = karachiParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function requestId(date = new Date()) {
  const p = karachiParts(date);
  const rnd = Math.floor(Math.random() * 90 + 10);
  return `R${p.year.slice(2)}${p.month}${p.day}${p.hour}${p.minute}${p.second}${rnd}`;
}

export function bearer(header?: string) {
  return String(header || '').replace(/^Bearer\s+/i, '').trim();
}
