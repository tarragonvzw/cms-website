'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Calendar as CalendarIcon, Clock, ChevronRight, Users, Sparkles } from 'lucide-react';
import VoidLogo from '../public/images/Void_Logo_WhiteTransparent.png';

interface EventListProps {
  locale?: string;
}

interface GuildSession {
  _id: string;
  date?: number;
  system?: 'PF' | 'DnD' | string;
  level?: number;
  questId?: string;
  questName?: string | null;
  maxPlayers?: number;
  characters?: string[];
  location?: string;
  locked?: boolean;
  planning?: boolean;
}

export default function EventList({ locale = 'nl' }: EventListProps) {
  // Brussels time calculations
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  const [guildSessions, setGuildSessions] = useState<GuildSession[]>([]);

  useEffect(() => {
    const updateNow = () => setNowDate(new Date());
    const interval = setInterval(updateNow, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch upcoming sessions from internal API proxy (to avoid CORS)
  useEffect(() => {
    let isCancelled = false;
    async function fetchGuildSessions() {
      try {
        const res = await fetch('/api/guild/sessions');
        if (!res.ok) return;
        const data = await res.json();
        if (!isCancelled && Array.isArray(data)) {
          // Filter only sessions that have an explicit scheduled date and are not planning
          const scheduled = data.filter((s: GuildSession) => typeof s.date === 'number' && !s.planning);
          setGuildSessions(scheduled);
        }
      } catch (err) {
        console.error('Failed to load Guild sessions:', err);
      }
    }
    fetchGuildSessions();
    const interval = setInterval(fetchGuildSessions, 120000); // refresh every 2 mins
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Compute fromDate (start of today) and sixMonthsLater ISO strings
  const { fromIso, sixMonthsIso, daysList } = useMemo(() => {
    const startOfToday = new Date(nowDate);
    startOfToday.setHours(0, 0, 0, 0);

    const sixMonthsLater = new Date(startOfToday);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    interface DayItem {
      date: Date;
      dateKey: string;
      isToday: boolean;
      weekdayShort: string;
      dayNumber: string;
      monthShort: string;
    }
    const days: DayItem[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(startOfToday);
      d.setDate(startOfToday.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      days.push({
        date: d,
        dateKey,
        isToday: i === 0,
        weekdayShort: d.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-US', {
          timeZone: 'Europe/Brussels',
          weekday: 'short',
        }),
        dayNumber: d.toLocaleDateString('default', {
          timeZone: 'Europe/Brussels',
          day: 'numeric',
        }),
        monthShort: d.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-US', {
          timeZone: 'Europe/Brussels',
          month: 'short',
        }),
      });
    }

    return {
      fromIso: startOfToday.toISOString(),
      sixMonthsIso: sixMonthsLater.toISOString(),
      daysList: days,
    };
  }, [nowDate, locale]);

  // Query events in the 6 month window
  const futureEvents = useQuery(api.events.getUpcomingEvents, {
    fromDate: fromIso,
    toDate: sixMonthsIso,
    limit: 100,
  });

  // Map Convex events to date keys (YYYY-MM-DD in Europe/Brussels)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    if (!futureEvents) return map;

    for (const ev of futureEvents) {
      const d = new Date(ev.date);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Brussels',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      
      const list = map.get(parts) || [];
      list.push(ev);
      map.set(parts, list);
    }
    return map;
  }, [futureEvents]);

  // Map Guild sessions to date keys (YYYY-MM-DD in Europe/Brussels)
  const guildSessionsByDate = useMemo(() => {
    const map = new Map<string, GuildSession[]>();
    for (const session of guildSessions) {
      if (!session.date) continue;
      const d = new Date(session.date);
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Brussels',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
      
      const list = map.get(parts) || [];
      list.push(session);
      map.set(parts, list);
    }
    return map;
  }, [guildSessions]);

  // Helper to construct 19:00 Brussels time ISO string for a given dateKey (YYYY-MM-DD)
  const getBrusselsEveningIso = (dateKey: string, hour = 19, minute = 0): string => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const brusselsTimeStr = d.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Brussels',
      hour12: false,
      hour: '2-digit',
    });
    const brusselsHourAt12Utc = parseInt(brusselsTimeStr, 10);
    const offsetHours = brusselsHourAt12Utc - 12;
    const targetUtcHour = hour - offsetHours;
    return new Date(Date.UTC(year, month - 1, day, targetUtcHour, minute, 0)).toISOString();
  };

  // Sorted upcoming events: combines Convex events with "Open Game Night" on Wednesdays without events
  const upcomingEvents = useMemo(() => {
    if (!futureEvents) return [];

    const combined: any[] = [...futureEvents];

    // Scan from startOfToday through sixMonthsLater for all Wednesdays
    const startOfToday = new Date(nowDate);
    startOfToday.setHours(0, 0, 0, 0);

    const sixMonthsLater = new Date(startOfToday);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    const current = new Date(startOfToday);
    while (current <= sixMonthsLater) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      const dNoon = new Date(`${dateKey}T12:00:00Z`);
      if (dNoon.getUTCDay() === 3) {
        const eventsOnDate = eventsByDate.get(dateKey) || [];
        if (eventsOnDate.length === 0) {
          combined.push({
            _id: `open-game-night-${dateKey}`,
            slug: '',
            title: 'Open Game Night',
            date: getBrusselsEveningIso(dateKey, 19, 0),
            isOpenGameNight: true,
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return combined.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [futureEvents, eventsByDate, nowDate]);

  // If loading
  if (futureEvents === undefined) {
    return (
      <div className="eventbox">
        <div className="eventbox-header-title">
          <div className="title-left">
            <CalendarIcon size={22} className="eventbox-title-icon" />
            <h1>{locale === 'nl' ? 'Aankomende Evenementen' : 'Upcoming Events'}</h1>
          </div>
        </div>
        <div className="eventbox-loading">
          <span>{locale === 'nl' ? 'Evenementen laden...' : 'Loading events...'}</span>
        </div>
      </div>
    );
  }

  if (upcomingEvents.length === 0 && guildSessions.length === 0) {
    return null;
  }

  return (
    <div className="eventbox">
      {/* Title */}
      <div className="eventbox-header-title">
        <div className="title-left">
          <CalendarIcon size={22} className="eventbox-title-icon" />
          <h1>{locale === 'nl' ? 'Aankomende Evenementen' : 'Upcoming Events'}</h1>
        </div>
        <span className="eventbox-window-tag">
          {locale === 'nl' ? 'Komende 6 maanden' : 'Next 6 months'}
        </span>
      </div>

      {/* 6-Day Overview Dayboxes */}
      <div className="six-day-overview">
        <div className="six-day-label">
          <span>{locale === 'nl' ? 'Deze Week' : 'Next 6 Days'}</span>
        </div>
        <div className="dayboxes-grid">
          {daysList.map((day) => {
            const dayEvents = eventsByDate.get(day.dateKey) || [];
            const daySessions = guildSessionsByDate.get(day.dateKey) || [];
            const hasConvexEvent = dayEvents.length > 0;
            const isWednesday = new Date(`${day.dateKey}T12:00:00Z`).getUTCDay() === 3;
            const isOpenGameNight = isWednesday && !hasConvexEvent;
            const hasGuildSession = daySessions.length > 0;
            const hasAnyActivity = hasConvexEvent || isOpenGameNight || hasGuildSession;
            const firstEvent = dayEvents[0];

            return (
              <div
                key={day.dateKey}
                className={`daybox-card ${day.isToday ? 'is-today' : ''} ${
                  hasConvexEvent || isOpenGameNight
                    ? 'daybox-highlighted'
                    : hasGuildSession
                    ? 'daybox-guild-highlighted'
                    : 'daybox-default'
                }`}
              >
                {/* Header with day name and date */}
                <div className="daybox-header">
                  {day.isToday && <span className="today-badge">TODAY</span>}
                  <div className="daybox-date-row">
                    <span className="daybox-weekday">{day.weekdayShort}</span>
                    <span className="daybox-number">{day.dayNumber}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="daybox-content">
                  {hasConvexEvent && (
                    <Link
                      href={`/event/${firstEvent.slug}`}
                      className="daybox-event-link"
                      title={firstEvent.title}
                    >
                      <div className="daybox-event-badge">
                        <Sparkles size={11} className="badge-sparkle" />
                        <span className="daybox-event-name">{firstEvent.title}</span>
                      </div>
                      {dayEvents.length > 1 && (
                        <span className="daybox-more-count">
                          +{dayEvents.length - 1} more
                        </span>
                      )}
                    </Link>
                  )}

                  {isOpenGameNight && (
                    <div
                      className="daybox-event-badge"
                      title="Open Game Night (19:00 - 22:00)"
                    >
                      <Sparkles size={11} className="badge-sparkle" />
                      <span className="daybox-event-name">Open Game Night</span>
                    </div>
                  )}

                  {/* Guild Sessions Badges */}
                  {daySessions.map((session) => {
                    const sessionTitle = session.questName
                      ? session.questName
                      : session.system 
                      ? `${session.system} ${session.level ? `(Lvl ${session.level})` : 'Session'}`
                      : 'Void Session';

                    const playersCount = session.characters?.length || 0;
                    const maxPlayers = session.maxPlayers || 6;
                    const isFull = Boolean(session.locked || playersCount >= maxPlayers);

                    return (
                      <a
                        key={session._id}
                        href={`https://guild.tarragon.be/sessions/${session._id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="daybox-guild-badge"
                        title={`Guild Session: ${sessionTitle} (${isFull ? (locale === 'nl' ? 'Volzet' : 'Full') : `${playersCount}/${maxPlayers}`}) - Click to open on Guild of The Void`}
                      >
                        <Image
                          src={VoidLogo}
                          alt="Void Guild"
                          width={14}
                          height={14}
                          className="daybox-void-logo"
                        />
                        <span className="daybox-guild-name">{sessionTitle}</span>
                        {isFull && (
                          <span className="daybox-guild-full-icon" title={locale === 'nl' ? 'Volzet' : 'Full'}>
                            {locale === 'nl' ? 'VOL' : 'FULL'}
                          </span>
                        )}
                      </a>
                    );
                  })}

                  {!hasAnyActivity && (
                    <div className="daybox-empty">
                      <span>—</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compact List of Upcoming Events in Next 6 Months */}
      <div className="compact-events-section">
        <div className="compact-events-header">
          <span>{locale === 'nl' ? 'Evenementenkalender' : 'Schedule'}</span>
          <span className="count-badge">{upcomingEvents.length}</span>
        </div>

        <div className="compact-events-list">
          {upcomingEvents.map((event) => {
            const evDate = new Date(event.date);
            const weekday = evDate.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-US', {
              timeZone: 'Europe/Brussels',
              weekday: 'short',
            });
            const dayNum = evDate.toLocaleDateString('default', {
              timeZone: 'Europe/Brussels',
              day: 'numeric',
            });
            const monthShort = evDate.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-US', {
              timeZone: 'Europe/Brussels',
              month: 'short',
            });
            const timeStr = event.isOpenGameNight
              ? '19:00 - 22:00'
              : evDate.toLocaleTimeString('en-GB', {
                  timeZone: 'Europe/Brussels',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });

            const groups = event.groups || [];
            const hasGroups = groups.length > 0;
            const totalSlots = hasGroups
              ? groups.reduce((acc: number, g: any) => acc + (g.maxSlots || 0), 0)
              : 0;

            const rowContent = (
              <>
                {/* Date Capsule (Placed cleanly on Left) */}
                <div className="compact-date-capsule">
                  <span className="compact-date-weekday">{weekday}</span>
                  <span className="compact-date-day">{dayNum}</span>
                  <span className="compact-date-month">{monthShort}</span>
                </div>

                {/* Event Details */}
                <div className="compact-event-info">
                  <div className="compact-title-row">
                    <h2 className="compact-event-title">{event.title}</h2>
                    {event.isOpenGameNight && (
                      <span className="compact-slots-badge">
                        <Sparkles size={12} />
                        <span>{locale === 'nl' ? 'Vrije inloop' : 'Walk-in'}</span>
                      </span>
                    )}
                    {hasGroups && (
                      <span className="compact-slots-badge">
                        <Users size={12} />
                        <span>
                          {groups.length} {locale === 'nl' ? 'tafels' : 'tables'} ({totalSlots} {locale === 'nl' ? 'plekken' : 'slots'})
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="compact-event-meta">
                    <span className="compact-meta-time">
                      <Clock size={13} />
                      <span>{timeStr}</span>
                    </span>
                    <span className="compact-meta-location">
                      Het Textielhuis, Kortrijk
                    </span>
                  </div>
                </div>

                {/* Arrow Icon */}
                {!event.isOpenGameNight && (
                  <div className="compact-event-arrow">
                    <ChevronRight size={18} />
                  </div>
                )}
              </>
            );

            if (event.isOpenGameNight) {
              return (
                <div
                  key={`open-${event._id}`}
                  className="compact-event-row compact-event-row-open"
                >
                  {rowContent}
                </div>
              );
            }

            return (
              <Link
                key={`convex-${event._id}`}
                href={`/event/${event.slug}`}
                className="compact-event-row"
              >
                {rowContent}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
