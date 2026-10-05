/**
 * Shared date utilities for Tarragon events with Europe/Brussels timezone support.
 */

const TIMEZONE = 'Europe/Brussels';

/**
 * Returns YYYY-MM-DD for a date string or Date object in Europe/Brussels.
 */
export function getBrusselsDateKey(isoOrDate: string | Date): string {
  if (!isoOrDate) return '';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return '';

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Converts a UTC ISO string to "YYYY-MM-DDTHH:mm" for an <input type="datetime-local">
 * in Europe/Brussels timezone (24-hour).
 */
export function utcIsoToBrusselsLocal(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const m: Record<string, string> = {};
  parts.forEach((p) => (m[p.type] = p.value));
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

/**
 * Converts a "YYYY-MM-DDTHH:mm" local input representing Europe/Brussels time
 * into a UTC ISO string.
 */
export function brusselsLocalToUtcIso(localDatetimeStr: string): string {
  if (!localDatetimeStr) return '';
  const [datePart, timePart] = localDatetimeStr.split('T');
  if (!datePart || !timePart) return '';
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute);

  const getOffset = (utcMs: number) => {
    const d = new Date(utcMs);
    const str = d.toLocaleString('en-US', {
      timeZone: TIMEZONE,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const [dPart, tPart] = str.split(', ');
    const [m, dy, y] = dPart.split('/');
    const [h, mi, s] = tPart.split(':');
    const asUtc = Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(dy),
      h === '24' ? 0 : Number(h),
      Number(mi),
      Number(s)
    );
    return asUtc - utcMs;
  };

  const offset = getOffset(guessUtc);
  const actualUtc = guessUtc - offset;
  return new Date(actualUtc).toISOString();
}

/**
 * Checks whether an event spans multiple calendar days in Europe/Brussels.
 */
export function isMultiDayEvent(startDateIso: string, endDateIso?: string | null): boolean {
  if (!startDateIso || !endDateIso) return false;
  const startKey = getBrusselsDateKey(startDateIso);
  const endKey = getBrusselsDateKey(endDateIso);
  if (!startKey || !endKey) return false;

  const startMs = new Date(startDateIso).getTime();
  const endMs = new Date(endDateIso).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return false;

  return startKey !== endKey;
}

/**
 * Returns all YYYY-MM-DD date keys in Europe/Brussels spanned by the event.
 * If not multi-day, returns [startKey].
 */
export function getEventSpannedDateKeys(
  startDateIso: string,
  endDateIso?: string | null
): string[] {
  const startKey = getBrusselsDateKey(startDateIso);
  if (!startKey) return [];
  if (!isMultiDayEvent(startDateIso, endDateIso)) {
    return [startKey];
  }

  const endKey = getBrusselsDateKey(endDateIso!);
  const keys: string[] = [];

  const [sY, sM, sD] = startKey.split('-').map(Number);
  const cursor = new Date(Date.UTC(sY, sM - 1, sD, 12, 0, 0));

  let safety = 0;
  while (safety < 60) {
    const curY = cursor.getUTCFullYear();
    const curM = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const curD = String(cursor.getUTCDate()).padStart(2, '0');
    const curKey = `${curY}-${curM}-${curD}`;
    keys.push(curKey);

    if (curKey >= endKey) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    safety++;
  }

  return keys;
}

/**
 * Returns total days spanned by event (1 for single-day).
 */
export function getEventDurationDays(
  startDateIso: string,
  endDateIso?: string | null
): number {
  return getEventSpannedDateKeys(startDateIso, endDateIso).length;
}

/**
 * Returns event lifecycle status: 'upcoming' | 'ongoing' | 'past'.
 */
export function getEventStatus(
  startDateIso: string,
  endDateIso?: string | null,
  nowDate: Date = new Date()
): 'upcoming' | 'ongoing' | 'past' {
  const startMs = new Date(startDateIso).getTime();
  if (isNaN(startMs)) return 'upcoming';

  const nowMs = nowDate.getTime();
  if (nowMs < startMs) return 'upcoming';

  if (endDateIso) {
    const endMs = new Date(endDateIso).getTime();
    if (!isNaN(endMs)) {
      return nowMs <= endMs ? 'ongoing' : 'past';
    }
  }

  // If no endDate provided, consider event ongoing if within same day or within 4 hours
  const startKey = getBrusselsDateKey(startDateIso);
  const nowKey = getBrusselsDateKey(nowDate);
  if (startKey === nowKey && nowMs - startMs < 6 * 3600 * 1000) {
    return 'ongoing';
  }

  return 'past';
}

/**
 * Format compact capsule components for an event (left side of schedule row).
 */
export function formatCompactCapsule(
  startDateIso: string,
  endDateIso?: string | null
): {
  weekday: string;
  day: string;
  month: string;
  isMultiDay: boolean;
} {
  const isMulti = isMultiDayEvent(startDateIso, endDateIso);
  const start = new Date(startDateIso);

  if (!isMulti || !endDateIso) {
    const weekday = start.toLocaleDateString('en-US', {
      timeZone: TIMEZONE,
      weekday: 'short',
    });
    const day = start.toLocaleDateString('default', {
      timeZone: TIMEZONE,
      day: 'numeric',
    });
    const month = start.toLocaleDateString('en-US', {
      timeZone: TIMEZONE,
      month: 'short',
    });
    return { weekday, day, month, isMultiDay: false };
  }

  const end = new Date(endDateIso);
  const startWd = start.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'short' });
  const endWd = end.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'short' });
  const startDay = start.toLocaleDateString('default', { timeZone: TIMEZONE, day: 'numeric' });
  const endDay = end.toLocaleDateString('default', { timeZone: TIMEZONE, day: 'numeric' });
  const startMo = start.toLocaleDateString('en-US', { timeZone: TIMEZONE, month: 'short' });
  const endMo = end.toLocaleDateString('en-US', { timeZone: TIMEZONE, month: 'short' });

  const weekday = `${startWd} - ${endWd}`;
  const day = `${startDay} - ${endDay}`;
  const month = startMo === endMo ? startMo : `${startMo}/${endMo}`;

  return { weekday, day, month, isMultiDay: true };
}

/**
 * Format time/duration meta string (e.g. "19:00", "19:00 – 23:00", or "Fri 19:00 → Sun 18:00").
 */
export function formatEventMetaTime(
  startDateIso: string,
  endDateIso?: string | null
): string {
  const start = new Date(startDateIso);
  if (isNaN(start.getTime())) return '';

  const startTimeStr = start.toLocaleTimeString('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (!endDateIso) {
    return startTimeStr;
  }

  const end = new Date(endDateIso);
  if (isNaN(end.getTime())) {
    return startTimeStr;
  }

  const endTimeStr = end.toLocaleTimeString('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const isMulti = isMultiDayEvent(startDateIso, endDateIso);
  if (!isMulti) {
    // Same day with end time
    return `${startTimeStr} – ${endTimeStr}`;
  }

  // Multi-day
  const startWd = start.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'short' });
  const endWd = end.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'short' });
  return `${startWd} ${startTimeStr} → ${endWd} ${endTimeStr}`;
}

/**
 * Formats full human-readable date & time range for single event detail page.
 */
export function formatFullEventDateRange(
  startDateIso: string,
  endDateIso?: string | null,
  locale = 'en-GB'
): {
  dateRangeStr: string;
  timeRangeStr: string;
  isMultiDay: boolean;
  durationDays: number;
} {
  const start = new Date(startDateIso);
  if (isNaN(start.getTime())) {
    return {
      dateRangeStr: startDateIso,
      timeRangeStr: '',
      isMultiDay: false,
      durationDays: 1,
    };
  }

  const startDateStr = start.toLocaleDateString(locale, {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const startTimeStr = start.toLocaleTimeString(locale, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (!endDateIso) {
    return {
      dateRangeStr: startDateStr,
      timeRangeStr: `at ${startTimeStr}`,
      isMultiDay: false,
      durationDays: 1,
    };
  }

  const end = new Date(endDateIso);
  if (isNaN(end.getTime())) {
    return {
      dateRangeStr: startDateStr,
      timeRangeStr: `at ${startTimeStr}`,
      isMultiDay: false,
      durationDays: 1,
    };
  }

  const endTimeStr = end.toLocaleTimeString(locale, {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const isMulti = isMultiDayEvent(startDateIso, endDateIso);
  const durationDays = getEventDurationDays(startDateIso, endDateIso);

  if (!isMulti) {
    return {
      dateRangeStr: startDateStr,
      timeRangeStr: `from ${startTimeStr} to ${endTimeStr}`,
      isMultiDay: false,
      durationDays: 1,
    };
  }

  const endDateStr = end.toLocaleDateString(locale, {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return {
    dateRangeStr: `${startDateStr}, ${startTimeStr} – ${endDateStr}, ${endTimeStr}`,
    timeRangeStr: '',
    isMultiDay: true,
    durationDays,
  };
}
