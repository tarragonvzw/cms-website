'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Calendar as CalendarIcon, CalendarDays, Clock, ChevronRight, Users, Sparkles, Compass } from 'lucide-react';
import VoidLogo from '../public/images/Void_Logo_WhiteTransparent.png';
import {
  isMultiDayEvent,
  getEventSpannedDateKeys,
  getEventDurationDays,
  getEventStatus,
  formatCompactCapsule,
  formatEventMetaTime,
} from '../lib/event-dates';

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
  isPrivate?: boolean;
  isIntro?: boolean;
}

export default function EventList(props: EventListProps = {}) {
  void props;
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
          // Filter only sessions that have an explicit scheduled date, are not planning, and are not private
          const scheduled = data.filter(
            (s: GuildSession) => typeof s.date === 'number' && !s.planning && !s.isPrivate
          );
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
        weekdayShort: d.toLocaleDateString('en-US', {
          timeZone: 'Europe/Brussels',
          weekday: 'short',
        }),
        dayNumber: d.toLocaleDateString('default', {
          timeZone: 'Europe/Brussels',
          day: 'numeric',
        }),
        monthShort: d.toLocaleDateString('en-US', {
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
  }, [nowDate]);

  // Query events in the 6 month window
  const futureEvents = useQuery(api.events.getUpcomingEvents, {
    fromDate: fromIso,
    toDate: sixMonthsIso,
    limit: 100,
  });

  // Map Convex events to date keys (YYYY-MM-DD in Europe/Brussels), supporting multi-day spans
  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    if (!futureEvents) return map;

    for (const ev of futureEvents) {
      const isMulti = isMultiDayEvent(ev.date, ev.endDate);
      const spannedKeys = getEventSpannedDateKeys(ev.date, ev.endDate);

      spannedKeys.forEach((dateKey, index) => {
        const list = map.get(dateKey) || [];
        list.push({
          ...ev,
          multiDayInfo: isMulti
            ? {
                dayIndex: index + 1,
                totalDays: spannedKeys.length,
                isStart: index === 0,
                isEnd: index === spannedKeys.length - 1,
                isMiddle: index > 0 && index < spannedKeys.length - 1,
              }
            : null,
        });
        map.set(dateKey, list);
      });
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

  // Sorted upcoming Convex events for the compact list
  const upcomingEvents = useMemo(() => {
    if (!futureEvents) return [];
    return [...futureEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [futureEvents]);

  // If loading
  if (futureEvents === undefined) {
    return (
      <div className="eventbox">
        <div className="eventbox-header-title">
          <div className="title-left">
            <CalendarIcon size={22} className="eventbox-title-icon" />
            <h1>Upcoming Events</h1>
          </div>
        </div>
        <div className="eventbox-loading">
          <span>Loading events...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="eventbox">
      {/* Title */}
      <div className="eventbox-header-title">
        <div className="title-left">
          <CalendarIcon size={22} className="eventbox-title-icon" />
          <h1>Upcoming Events</h1>
        </div>
        <span className="eventbox-window-tag">
          Next 6 months
        </span>
      </div>

      {/* 6-Day Overview Dayboxes */}
      <div className="six-day-overview">
        <div className="six-day-label">
          <span>Next 6 Days</span>
        </div>
        <div className="dayboxes-grid">
          {daysList.map((day) => {
            const dayEvents = eventsByDate.get(day.dateKey) || [];
            const daySessions = guildSessionsByDate.get(day.dateKey) || [];
            
            // Check if day has an active closure / cancellation exception
            const cancelledEvent = dayEvents.find((e) => Boolean(e.isCancelled));
            const activeEvents = dayEvents.filter((e) => !e.isCancelled);
            const hasActiveConvexEvent = activeEvents.length > 0;
            const isWednesday = new Date(`${day.dateKey}T12:00:00Z`).getUTCDay() === 3;
            const isOpenGameNight = isWednesday && !hasActiveConvexEvent && !cancelledEvent;
            const hasGuildSession = daySessions.length > 0;
            const hasAnyActivity = hasActiveConvexEvent || isOpenGameNight || hasGuildSession || Boolean(cancelledEvent);
            const firstActiveEvent = activeEvents[0];
            const isMultiDayActive = Boolean(firstActiveEvent?.multiDayInfo);

            return (
              <div
                key={day.dateKey}
                className={`daybox-card ${day.isToday ? 'is-today' : ''} ${
                  cancelledEvent
                    ? 'daybox-cancelled-highlighted'
                    : hasActiveConvexEvent || isOpenGameNight
                    ? isMultiDayActive
                      ? 'daybox-highlighted daybox-multiday-highlighted'
                      : 'daybox-highlighted'
                    : hasGuildSession
                    ? 'daybox-guild-highlighted'
                    : 'daybox-default'
                }`}
              >
                {/* Header with day name and date */}
                <div className="daybox-header">
                  <div className="daybox-top-badges">
                    {day.isToday && <span className="today-badge">TODAY</span>}
                    {firstActiveEvent?.multiDayInfo && (
                      <span
                        className="daybox-multiday-phase-tag"
                        title={`Day ${firstActiveEvent.multiDayInfo.dayIndex} of ${firstActiveEvent.multiDayInfo.totalDays}`}
                      >
                        {firstActiveEvent.multiDayInfo.isStart
                          ? 'DAY 1'
                          : firstActiveEvent.multiDayInfo.isEnd
                          ? 'FINAL'
                          : `DAY ${firstActiveEvent.multiDayInfo.dayIndex}`}
                      </span>
                    )}
                  </div>
                  <div className="daybox-date-row">
                    <span className="daybox-weekday">{day.weekdayShort}</span>
                    <span className="daybox-number">{day.dayNumber}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="daybox-content">
                  {cancelledEvent && (
                    <div
                      className="daybox-cancelled-badge"
                      title={cancelledEvent.cancelReason || 'Closed / No event'}
                    >
                      <span className="badge-warning-icon">⚠️</span>
                      <span className="daybox-event-name">
                        {cancelledEvent.cancelReason || 'Closed'}
                      </span>
                    </div>
                  )}

                  {!cancelledEvent && hasActiveConvexEvent && (
                    <Link
                      href={`/event/${firstActiveEvent.slug}`}
                      className="daybox-event-link"
                      title={`${firstActiveEvent.title}${
                        firstActiveEvent.multiDayInfo
                          ? ` (Day ${firstActiveEvent.multiDayInfo.dayIndex} of ${firstActiveEvent.multiDayInfo.totalDays})`
                          : ''
                      }`}
                    >
                      <div
                        className={`daybox-event-badge ${
                          firstActiveEvent.multiDayInfo ? 'daybox-multiday-badge' : ''
                        }`}
                      >
                        <Sparkles size={11} className="badge-sparkle" />
                        <span className="daybox-event-name">{firstActiveEvent.title}</span>
                        {firstActiveEvent.multiDayInfo && (
                          <span
                            className="daybox-multiday-pill"
                            title={`Day ${firstActiveEvent.multiDayInfo.dayIndex} of ${firstActiveEvent.multiDayInfo.totalDays}`}
                          >
                            {firstActiveEvent.multiDayInfo.dayIndex}/{firstActiveEvent.multiDayInfo.totalDays}
                          </span>
                        )}
                      </div>
                      {activeEvents.length > 1 && (
                        <span className="daybox-more-count">
                          +{activeEvents.length - 1} more
                        </span>
                      )}
                    </Link>
                  )}

                  {!cancelledEvent && isOpenGameNight && (
                    <div
                      className="daybox-event-badge"
                      title="Open Game Night (19:00 - 22:00)"
                    >
                      <Sparkles size={11} className="badge-sparkle" />
                      <span className="daybox-event-name">Open Game Night</span>
                    </div>
                  )}

                  {/* Guild Sessions Badges */}
                  {!cancelledEvent && daySessions.map((session) => {
                    const sessionTitle = session.questName
                      ? session.questName
                      : session.system 
                      ? `${session.system} ${session.level ? `(Lvl ${session.level})` : 'Session'}`
                      : 'Void Session';

                    const playersCount = session.characters?.length || 0;
                    const maxPlayers = session.maxPlayers || 6;
                    const isFull = Boolean(session.locked || playersCount >= maxPlayers);
                    const isIntro = Boolean(session.isIntro);

                    return (
                      <a
                        key={session._id}
                        href={`https://guild.tarragon.be/sessions/${session._id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`daybox-guild-badge ${isIntro ? 'is-intro-session' : ''}`}
                        title={`Guild Session: ${isIntro ? '[INTRO] ' : ''}${sessionTitle} (${isFull ? 'Full' : `${playersCount}/${maxPlayers}`}) - Click to open on Guild of The Void`}
                      >
                        <Image
                          src={VoidLogo}
                          alt="Void Guild"
                          width={14}
                          height={14}
                          className="daybox-void-logo"
                        />
                        {isIntro && (
                          <span
                            className="daybox-guild-intro-icon"
                            title="Introductory session for new players"
                          >
                            <Compass size={12} className="intro-compass-icon" />
                            <span className="intro-text">INTRO</span>
                          </span>
                        )}
                        <span className="daybox-guild-name">{sessionTitle}</span>
                        {isFull && (
                          <span className="daybox-guild-full-icon" title="Full">
                            FULL
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
      {upcomingEvents.length > 0 && (
        <div className="compact-events-section">
          <div className="compact-events-header">
            <span>Schedule</span>
            <span className="count-badge">{upcomingEvents.length}</span>
          </div>

          <div className="compact-events-list">
            {upcomingEvents.map((event) => {
              const groups = event.groups || [];
              const hasGroups = groups.length > 0;
              const totalSlots = hasGroups
                ? groups.reduce((acc: number, g: any) => acc + (g.maxSlots || 0), 0)
                : 0;

              const isCancelled = Boolean(event.isCancelled);
              const isMulti = isMultiDayEvent(event.date, event.endDate);
              const capsule = formatCompactCapsule(event.date, event.endDate);
              const timeMeta = formatEventMetaTime(event.date, event.endDate);
              const durationDays = getEventDurationDays(event.date, event.endDate);
              const status = getEventStatus(event.date, event.endDate, nowDate);

              return (
                <Link
                  key={`convex-${event._id}`}
                  href={`/event/${event.slug}`}
                  className={`compact-event-row ${isCancelled ? 'compact-cancelled-row' : ''} ${
                    isMulti ? 'compact-multiday-row' : ''
                  }`}
                >
                  {/* Date Capsule (Placed cleanly on Left) */}
                  <div
                    className={`compact-date-capsule ${isCancelled ? 'cancelled-date-capsule' : ''} ${
                      isMulti ? 'multiday-date-capsule' : ''
                    }`}
                    title={isMulti ? `Multi-day event (${durationDays} days)` : undefined}
                  >
                    <span className="compact-date-weekday">{capsule.weekday}</span>
                    <span className={`compact-date-day ${isMulti ? 'multiday-date-day' : ''}`}>
                      {capsule.day}
                    </span>
                    <span className="compact-date-month">{capsule.month}</span>
                  </div>

                  {/* Event Details */}
                  <div className="compact-event-info">
                    <div className="compact-title-row">
                      <h2 className="compact-event-title" style={isCancelled ? { color: '#fca5a5' } : undefined}>
                        {isCancelled ? `⚠️ ${event.title}` : event.title}
                      </h2>
                      {isCancelled ? (
                        <span className="compact-warning-badge">
                          {event.cancelReason || 'Closed / No Event'}
                        </span>
                      ) : (
                        <>
                          {status === 'ongoing' && (
                            <span className="compact-ongoing-badge" title="Event is currently happening!">
                              <span className="ongoing-pulse-dot" />
                              <span>Happening Now</span>
                            </span>
                          )}
                          {isMulti && (
                            <span className="compact-multiday-badge" title={`Spans ${durationDays} days`}>
                              <CalendarDays size={12} />
                              <span>{durationDays} Days</span>
                            </span>
                          )}
                          {hasGroups ? (
                            <span className="compact-slots-badge">
                              <Users size={12} />
                              <span>
                                {groups.length} {groups.length === 1 ? 'table' : 'tables'} ({totalSlots} {totalSlots === 1 ? 'slot' : 'slots'})
                              </span>
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>

                    <div className="compact-event-meta">
                      <span className="compact-meta-time" style={isCancelled ? { color: '#f87171' } : undefined}>
                        <Clock size={13} />
                        <span>{isCancelled ? 'Cancelled / Closed' : timeMeta}</span>
                      </span>
                      <span className="compact-meta-location">
                        {event.location?.trim() || "Het Textielhuis, Kortrijk"}
                      </span>
                    </div>
                  </div>

                  {/* Arrow Icon */}
                  <div className="compact-event-arrow" style={isCancelled ? { color: 'rgba(239, 68, 68, 0.6)' } : undefined}>
                    <ChevronRight size={18} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
