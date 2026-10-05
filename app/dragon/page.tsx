"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { updateUserRoleAction, updateUserMetadataAction } from "../actions/admin";
import {
  utcIsoToBrusselsLocal,
  brusselsLocalToUtcIso,
  isMultiDayEvent,
  getEventDurationDays,
} from "../../lib/event-dates";

type Role = "user" | "member" | "dragon";

interface AdminUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  email: string;
  imageUrl?: string;
  username?: string | null;
  role: Role;
  isMember: boolean;
  membershipExpiresAt?: number;
  hasStripeSubscription?: boolean;
  voidmaster?: boolean;
  voidManager?: boolean;
  createdAt?: number;
}

export default function DragonAdminPage() {
  const { isLoaded, isSignedIn } = useUser();
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateUserRoleInConvex = useMutation(api.users.updateUserRoleByClerkId);

  const [activeTab, setActiveTab] = useState<"users" | "events" | "dragons" | "sponsors" | "pages">("events");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Events state
  const events = useQuery(api.events.listEvents, {});
  const saveEventMutation = useMutation(api.events.saveEvent);
  const deleteEventMutation = useMutation(api.events.deleteEvent);

  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [editingEvent, setEditingEvent] = useState<{
    _id?: any;
    slug: string;
    title: string;
    date: string;
    endDate?: string;
    location?: string;
    isCancelled?: boolean;
    cancelReason?: string;
    body: string;
    groups: { name: string; description?: string; maxSlots: number }[];
  } | null>(null);
  const [eventDateLocal, setEventDateLocal] = useState("");
  const [eventEndDateLocal, setEventEndDateLocal] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [eventModalError, setEventModalError] = useState<string | null>(null);

  // Dragons state
  const dragons = useQuery(api.dragons.listDragons, {});
  const saveDragonMutation = useMutation(api.dragons.saveDragon);
  const deleteDragonMutation = useMutation(api.dragons.deleteDragon);

  const [dragonSearchQuery, setDragonSearchQuery] = useState("");
  const [editingDragon, setEditingDragon] = useState<{
    _id?: any;
    name: string;
    title?: string;
    image?: string;
    body?: string;
    order?: number;
  } | null>(null);
  const [savingDragon, setSavingDragon] = useState(false);
  const [deletingDragonId, setDeletingDragonId] = useState<string | null>(null);
  const [dragonModalError, setDragonModalError] = useState<string | null>(null);

  // Sponsors state
  const sponsors = useQuery(api.sponsors.listSponsors, {});
  const saveSponsorMutation = useMutation(api.sponsors.saveSponsor);
  const deleteSponsorMutation = useMutation(api.sponsors.deleteSponsor);

  const [sponsorSearchQuery, setSponsorSearchQuery] = useState("");
  const [editingSponsor, setEditingSponsor] = useState<{
    _id?: any;
    name: string;
    link: string;
    snippet: string;
    body?: string;
    image?: string;
    order?: number;
  } | null>(null);
  const [savingSponsor, setSavingSponsor] = useState(false);
  const [deletingSponsorId, setDeletingSponsorId] = useState<string | null>(null);
  const [sponsorModalError, setSponsorModalError] = useState<string | null>(null);

  // Pages state
  const pages = useQuery(api.pages.listPages, {});
  const savePageMutation = useMutation(api.pages.savePage);
  const deletePageMutation = useMutation(api.pages.deletePage);

  const [pageSearchQuery, setPageSearchQuery] = useState("");
  const [editingPage, setEditingPage] = useState<{
    _id?: any;
    slug: string;
    title: string;
    body: string;
    language: string;
    enabled: boolean;
    hideFromHeader?: boolean;
    weight?: number;
    snippet?: string;
    icon?: string;
    iconName?: string;
    translationSlug?: string;
  } | null>(null);
  const [savingPage, setSavingPage] = useState(false);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  const [pageModalError, setPageModalError] = useState<string | null>(null);

  const isDragon = currentUser?.role === "dragon";

  // Fetch Clerk users list
  useEffect(() => {
    if (!isSignedIn || !isDragon) return;

    let isMounted = true;
    setLoadingUsers(true);

    fetch("/api/admin/users")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load users");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setUsers(data.users || []);
          setLoadingUsers(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Error loading admin users:", err);
          setErrorMessage(err.message);
          setLoadingUsers(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isSignedIn, isDragon]);

  const handleRoleChange = async (targetUser: AdminUser, newRole: Role) => {
    if (targetUser.role === newRole) return;

    setUpdatingUserId(targetUser.id);
    setSavedUserId(null);

    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const expiresAt =
      newRole === "member"
        ? targetUser.membershipExpiresAt && targetUser.membershipExpiresAt > Date.now()
          ? targetUser.membershipExpiresAt
          : Date.now() + oneYearMs
        : undefined;

    // Optimistically update local state
    const previousUsers = [...users];
    setUsers((prev) =>
      prev.map((u) =>
        u.id === targetUser.id
          ? {
              ...u,
              role: newRole,
              isMember: newRole === "member" || newRole === "dragon",
              membershipExpiresAt: expiresAt,
            }
          : u
      )
    );

    try {
      // 1. Update Clerk publicMetadata via server action
      await updateUserRoleAction(targetUser.id, newRole, expiresAt);

      // 2. Update Convex users table
      await updateUserRoleInConvex({
        clerkId: targetUser.id,
        role: newRole,
        name: targetUser.fullName,
        email: targetUser.email,
        imageUrl: targetUser.imageUrl,
        membershipExpiresAt: expiresAt,
      });

      setSavedUserId(targetUser.id);
      setTimeout(() => {
        setSavedUserId((current) => (current === targetUser.id ? null : current));
      }, 2500);
    } catch (err: any) {
      console.error("Failed to update user role:", err);
      alert(err.message || "Failed to update role. Reverting change.");
      setUsers(previousUsers);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleVoidmaster = async (targetUser: AdminUser, checked: boolean) => {
    setUpdatingUserId(targetUser.id);
    setSavedUserId(null);

    const previousUsers = [...users];
    setUsers((prev) =>
      prev.map((u) =>
        u.id === targetUser.id ? { ...u, voidmaster: checked } : u
      )
    );

    try {
      await updateUserMetadataAction(targetUser.id, {
        gamemaster: checked,
      });

      setSavedUserId(targetUser.id);
      setTimeout(() => {
        setSavedUserId((current) => (current === targetUser.id ? null : current));
      }, 2500);
    } catch (err: any) {
      console.error("Failed to update voidmaster metadata:", err);
      alert(err.message || "Failed to update Voidmaster status. Reverting change.");
      setUsers(previousUsers);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleVoidManager = async (targetUser: AdminUser, checked: boolean) => {
    setUpdatingUserId(targetUser.id);
    setSavedUserId(null);

    const previousUsers = [...users];
    setUsers((prev) =>
      prev.map((u) =>
        u.id === targetUser.id ? { ...u, voidManager: checked } : u
      )
    );

    try {
      await updateUserMetadataAction(targetUser.id, {
        admin: checked,
      });

      setSavedUserId(targetUser.id);
      setTimeout(() => {
        setSavedUserId((current) => (current === targetUser.id ? null : current));
      }, 2500);
    } catch (err: any) {
      console.error("Failed to update void manager metadata:", err);
      alert(err.message || "Failed to update Void Manager status. Reverting change.");
      setUsers(previousUsers);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleOpenNewEvent = () => {
    // Current date in Brussels timezone, defaulting to 19:00 Brussels local time
    const nowBrussels = utcIsoToBrusselsLocal(new Date().toISOString());
    const [todayDate] = nowBrussels.split("T");
    const defaultLocal = `${todayDate}T19:00`;
    const dateStr = brusselsLocalToUtcIso(defaultLocal);
    const slugDate = todayDate.replace(/-/g, "");

    setEventDateLocal(defaultLocal);
    setEventEndDateLocal("");
    setEditingEvent({
      slug: `${slugDate}_Event`,
      title: "",
      date: dateStr,
      endDate: undefined,
      location: "Het Textielhuis, Kortrijk",
      body: "",
      isCancelled: false,
      cancelReason: "",
      groups: [],
    });
    setEventModalError(null);
  };

  const handleOpenEditEvent = (ev: any) => {
    const localStr = utcIsoToBrusselsLocal(ev.date) || "";
    const endLocalStr = ev.endDate ? utcIsoToBrusselsLocal(ev.endDate) : "";
    setEventDateLocal(localStr);
    setEventEndDateLocal(endLocalStr);
    setEditingEvent({
      _id: ev._id,
      slug: ev.slug,
      title: ev.title,
      date: ev.date,
      endDate: ev.endDate,
      location: ev.location || "Het Textielhuis, Kortrijk",
      body: ev.body || "",
      isCancelled: Boolean(ev.isCancelled),
      cancelReason: ev.cancelReason || "",
      groups: ev.groups ? [...ev.groups] : [],
    });
    setEventModalError(null);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;

    if (!editingEvent.title.trim()) {
      setEventModalError("Event title is required.");
      return;
    }
    if (!editingEvent.slug.trim()) {
      setEventModalError("Event slug is required.");
      return;
    }
    if (!eventDateLocal) {
      setEventModalError("Date and start time are required.");
      return;
    }

    const utcIso = brusselsLocalToUtcIso(eventDateLocal);
    if (!utcIso) {
      setEventModalError("Invalid Date or Time format.");
      return;
    }

    let endUtcIso: string | undefined = undefined;
    if (eventEndDateLocal.trim()) {
      endUtcIso = brusselsLocalToUtcIso(eventEndDateLocal.trim());
      if (!endUtcIso) {
        setEventModalError("Invalid End Date or Time format.");
        return;
      }
      if (new Date(endUtcIso).getTime() < new Date(utcIso).getTime()) {
        setEventModalError("End date & time must be after the start date & time.");
        return;
      }
    }

    setSavingEvent(true);
    setEventModalError(null);

    try {
      await saveEventMutation({
        id: editingEvent._id,
        slug: editingEvent.slug,
        title: editingEvent.title,
        date: utcIso,
        endDate: endUtcIso,
        location: editingEvent.location?.trim() || "Het Textielhuis, Kortrijk",
        body: editingEvent.body,
        isCancelled: editingEvent.isCancelled,
        cancelReason: editingEvent.cancelReason,
        groups: editingEvent.groups,
      });
      setEditingEvent(null);
    } catch (err: any) {
      console.error("Error saving event:", err);
      setEventModalError(err.message || "Failed to save event");
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = async (id: any) => {
    if (!confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      return;
    }

    setDeletingEventId(id);
    try {
      await deleteEventMutation({ id });
      if (editingEvent?._id === id) {
        setEditingEvent(null);
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete event");
    } finally {
      setDeletingEventId(null);
    }
  };

  const handleOpenNewDragon = () => {
    setEditingDragon({
      name: "",
      title: "",
      image: "",
      body: "",
      order: (dragons?.length ?? 0) + 1,
    });
    setDragonModalError(null);
  };

  const handleOpenEditDragon = (drg: any) => {
    setEditingDragon({
      _id: drg._id,
      name: drg.name,
      title: drg.title || "",
      image: drg.image || "",
      body: drg.body || "",
      order: drg.order ?? 0,
    });
    setDragonModalError(null);
  };

  const handleSaveDragon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDragon) return;

    if (!editingDragon.name.trim()) {
      setDragonModalError("Dragon name is required.");
      return;
    }

    setSavingDragon(true);
    setDragonModalError(null);

    try {
      await saveDragonMutation({
        id: editingDragon._id,
        name: editingDragon.name,
        title: editingDragon.title || undefined,
        image: editingDragon.image || undefined,
        body: editingDragon.body || undefined,
        order: editingDragon.order,
      });
      setEditingDragon(null);
    } catch (err: any) {
      console.error("Error saving dragon:", err);
      setDragonModalError(err.message || "Failed to save dragon");
    } finally {
      setSavingDragon(false);
    }
  };

  const handleDeleteDragon = async (id: any) => {
    if (!confirm("Are you sure you want to delete this dragon? This action cannot be undone.")) {
      return;
    }

    setDeletingDragonId(id);
    try {
      await deleteDragonMutation({ id });
      if (editingDragon?._id === id) {
        setEditingDragon(null);
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete dragon");
    } finally {
      setDeletingDragonId(null);
    }
  };

  // Sponsors handlers
  const handleOpenNewSponsor = () => {
    setEditingSponsor({
      name: "",
      link: "",
      snippet: "",
      body: "",
      image: "",
      order: (sponsors?.length ?? 0) + 1,
    });
    setSponsorModalError(null);
  };

  const handleOpenEditSponsor = (sp: any) => {
    setEditingSponsor({
      _id: sp._id,
      name: sp.name,
      link: sp.link,
      snippet: sp.snippet,
      body: sp.body || "",
      image: sp.image || "",
      order: sp.order ?? 0,
    });
    setSponsorModalError(null);
  };

  const handleSaveSponsor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSponsor) return;

    if (!editingSponsor.name.trim()) {
      setSponsorModalError("Sponsor name is required.");
      return;
    }
    if (!editingSponsor.link.trim()) {
      setSponsorModalError("Sponsor link is required.");
      return;
    }

    setSavingSponsor(true);
    setSponsorModalError(null);

    try {
      await saveSponsorMutation({
        id: editingSponsor._id,
        name: editingSponsor.name,
        link: editingSponsor.link,
        snippet: editingSponsor.snippet,
        body: editingSponsor.body || undefined,
        image: editingSponsor.image || undefined,
        order: editingSponsor.order,
      });
      setEditingSponsor(null);
    } catch (err: any) {
      console.error("Error saving sponsor:", err);
      setSponsorModalError(err.message || "Failed to save sponsor");
    } finally {
      setSavingSponsor(false);
    }
  };

  const handleDeleteSponsor = async (id: any) => {
    if (!confirm("Are you sure you want to delete this sponsor deal? This action cannot be undone.")) {
      return;
    }

    setDeletingSponsorId(id);
    try {
      await deleteSponsorMutation({ id });
      if (editingSponsor?._id === id) {
        setEditingSponsor(null);
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete sponsor");
    } finally {
      setDeletingSponsorId(null);
    }
  };

  // Pages handlers
  const handleOpenNewPage = () => {
    setEditingPage({
      slug: "",
      title: "",
      body: "",
      language: "nl",
      enabled: true,
      hideFromHeader: false,
      weight: 100,
      snippet: "",
      icon: "",
      iconName: "Sparkles",
      translationSlug: "",
    });
    setPageModalError(null);
  };

  const handleOpenEditPage = (pg: any) => {
    setEditingPage({
      _id: pg._id,
      slug: pg.slug,
      title: pg.title,
      body: pg.body || "",
      language: pg.language || "nl",
      enabled: pg.enabled !== false,
      hideFromHeader: Boolean(pg.hideFromHeader),
      weight: pg.weight ?? 100,
      snippet: pg.snippet || "",
      icon: pg.icon || "",
      iconName: pg.iconName || "",
      translationSlug: pg.translationSlug || "",
    });
    setPageModalError(null);
  };

  const handleSavePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPage) return;

    if (!editingPage.slug.trim()) {
      setPageModalError("Page slug (URL) is required.");
      return;
    }
    if (!editingPage.title.trim()) {
      setPageModalError("Page title is required.");
      return;
    }

    setSavingPage(true);
    setPageModalError(null);

    try {
      await savePageMutation({
        id: editingPage._id,
        slug: editingPage.slug,
        title: editingPage.title,
        body: editingPage.body,
        language: editingPage.language,
        enabled: editingPage.enabled,
        hideFromHeader: editingPage.hideFromHeader,
        weight: editingPage.weight,
        snippet: editingPage.snippet || undefined,
        icon: editingPage.icon || undefined,
        iconName: editingPage.iconName || undefined,
        translationSlug: editingPage.translationSlug || undefined,
      });
      setEditingPage(null);
    } catch (err: any) {
      console.error("Error saving page:", err);
      setPageModalError(err.message || "Failed to save page");
    } finally {
      setSavingPage(false);
    }
  };

  const handleDeletePage = async (id: any) => {
    if (!confirm("Are you sure you want to delete this page? This action cannot be undone.")) {
      return;
    }

    setDeletingPageId(id);
    try {
      await deletePageMutation({ id });
      if (editingPage?._id === id) {
        setEditingPage(null);
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete page");
    } finally {
      setDeletingPageId(null);
    }
  };

  // Auth gate checks
  if (!isLoaded || (isSignedIn && currentUser === undefined)) {
    return (
      <div className="dragon-admin-container">
        <div className="dragon-panel" style={{ textAlign: "center", padding: "3rem" }}>
          <p style={{ color: "var(--secondary)" }}>Loading dragon archives...</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="dragon-admin-container">
        <div className="dragon-panel" style={{ textAlign: "center", padding: "3rem" }}>
          <h2 style={{ color: "#f87171", marginBottom: "1rem" }}>Dragon Access Required</h2>
          <p style={{ color: "var(--secondary)", marginBottom: "1.5rem" }}>
            You must be signed in to view this council.
          </p>
          <Link href="/" className="auth-btn">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  if (!isDragon) {
    return (
      <div className="dragon-admin-container">
        <div className="dragon-panel" style={{ textAlign: "center", padding: "3rem" }}>
          <h2 style={{ color: "#f87171", marginBottom: "1rem" }}>Access Denied</h2>
          <p style={{ color: "var(--secondary)", marginBottom: "1.5rem" }}>
            This sanctum is reserved for Dragons. You currently have the &quot;{currentUser?.role || "user"}&quot; role.
          </p>
          <Link href="/" className="auth-btn">
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole = roleFilter === "all" || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const filteredEvents = (events ? [...events] : [])
    .filter((ev) => {
      return (
        ev.title.toLowerCase().includes(eventSearchQuery.toLowerCase()) ||
        ev.slug.toLowerCase().includes(eventSearchQuery.toLowerCase())
      );
    })
    .sort((a, b) => {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return timeB - timeA; // Newest / latest dates first
    });

  const filteredDragons = (dragons || []).filter((d) => {
    return (
      d.name.toLowerCase().includes(dragonSearchQuery.toLowerCase()) ||
      (d.title && d.title.toLowerCase().includes(dragonSearchQuery.toLowerCase()))
    );
  });

  const filteredSponsors = (sponsors || []).filter((sp) => {
    return (
      sp.name.toLowerCase().includes(sponsorSearchQuery.toLowerCase()) ||
      sp.snippet.toLowerCase().includes(sponsorSearchQuery.toLowerCase())
    );
  });

  const filteredPages = (pages || []).filter((pg) => {
    return (
      pg.title.toLowerCase().includes(pageSearchQuery.toLowerCase()) ||
      pg.slug.toLowerCase().includes(pageSearchQuery.toLowerCase())
    );
  });

  return (
    <div className="dragon-admin-container">
      <div className="dragon-admin-header">
        <h1>
          <span>🐉</span> Dragon Council
        </h1>
        <p>Manage events, dragon cards, sponsor deals, pages, and users across Tarragon.</p>
      </div>

      <div className="dragon-tabs">
        <button
          className={`dragon-tab ${activeTab === "events" ? "active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          Events ({events ? events.length : "..."})
        </button>
        <button
          className={`dragon-tab ${activeTab === "dragons" ? "active" : ""}`}
          onClick={() => setActiveTab("dragons")}
        >
          Dragons ({dragons ? dragons.length : "..."})
        </button>
        <button
          className={`dragon-tab ${activeTab === "sponsors" ? "active" : ""}`}
          onClick={() => setActiveTab("sponsors")}
        >
          Sponsors ({sponsors ? sponsors.length : "..."})
        </button>
        <button
          className={`dragon-tab ${activeTab === "pages" ? "active" : ""}`}
          onClick={() => setActiveTab("pages")}
        >
          Pages ({pages ? pages.length : "..."})
        </button>
        <button
          className={`dragon-tab ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users ({users.length})
        </button>
      </div>

      {activeTab === "dragons" && (
        <div className="dragon-panel">
          <div className="dragon-controls">
            <input
              type="text"
              className="dragon-search-input"
              placeholder="Search dragons by name or title..."
              value={dragonSearchQuery}
              onChange={(e) => setDragonSearchQuery(e.target.value)}
            />

            <button
              type="button"
              className="dragon-btn-primary"
              onClick={handleOpenNewDragon}
            >
              + Add Dragon
            </button>
          </div>

          {dragons === undefined ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              Loading dragons from Convex...
            </div>
          ) : filteredDragons.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              No dragons found.
            </div>
          ) : (
            <div className="dragon-table-wrapper">
              <table className="dragon-users-table">
                <thead>
                  <tr>
                    <th>Dragon</th>
                    <th>Title</th>
                    <th>Image</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDragons.map((drg) => (
                    <tr
                      key={drg._id}
                      className="dragon-table-row-clickable"
                      onClick={() => handleOpenEditDragon(drg)}
                    >
                      <td>
                        <div className="dragon-user-info">
                          {drg.image ? (
                            <Image
                              src={drg.image}
                              alt={drg.name}
                              width={40}
                              height={40}
                              className="dragon-avatar"
                            />
                          ) : (
                            <div className="dragon-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
                              {drg.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="dragon-fullname">{drg.name}</span>
                        </div>
                      </td>
                      <td style={{ color: "var(--secondary)" }}>
                        {drg.title || "—"}
                      </td>
                      <td style={{ color: "rgba(242, 211, 180, 0.7)", fontFamily: "monospace", fontSize: "0.85rem" }}>
                        {drg.image || "Default logo"}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="dragon-btn-secondary"
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                            onClick={() => handleOpenEditDragon(drg)}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Dragon Modal */}
      {editingDragon && (
        <div className="dragon-modal-backdrop" onClick={() => !savingDragon && setEditingDragon(null)}>
          <div className="dragon-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dragon-modal-header">
              <h2>{editingDragon._id ? "Edit Dragon" : "Add Dragon Card"}</h2>
              <button
                type="button"
                className="dragon-modal-close"
                onClick={() => setEditingDragon(null)}
                disabled={savingDragon}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDragon} style={{ display: "contents" }}>
              <div className="dragon-modal-body">
                {dragonModalError && (
                  <div
                    style={{
                      background: "rgba(220, 38, 38, 0.2)",
                      color: "#f87171",
                      padding: "0.75rem 1rem",
                      borderRadius: "0.5rem",
                    }}
                  >
                    {dragonModalError}
                  </div>
                )}

                <div className="dragon-form-group">
                  <label htmlFor="dragon-name">Name *</label>
                  <input
                    id="dragon-name"
                    type="text"
                    required
                    className="dragon-form-input"
                    value={editingDragon.name}
                    onChange={(e) =>
                      setEditingDragon({ ...editingDragon, name: e.target.value })
                    }
                    placeholder="e.g. Jasper"
                  />
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="dragon-title">Title / Role</label>
                  <input
                    id="dragon-title"
                    type="text"
                    className="dragon-form-input"
                    value={editingDragon.title || ""}
                    onChange={(e) =>
                      setEditingDragon({ ...editingDragon, title: e.target.value })
                    }
                    placeholder="e.g. Thane, HR, Secretary"
                  />
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="dragon-image">Image URL / Path</label>
                  <input
                    id="dragon-image"
                    type="text"
                    className="dragon-form-input"
                    value={editingDragon.image || ""}
                    onChange={(e) =>
                      setEditingDragon({ ...editingDragon, image: e.target.value })
                    }
                    placeholder="/uploads/Jasper.jpg"
                  />
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="dragon-body">Bio / Description (optional)</label>
                  <textarea
                    id="dragon-body"
                    rows={4}
                    className="dragon-form-textarea"
                    value={editingDragon.body || ""}
                    onChange={(e) =>
                      setEditingDragon({ ...editingDragon, body: e.target.value })
                    }
                    placeholder="Short description..."
                  />
                </div>
              </div>

              <div className="dragon-modal-footer">
                <div>
                  {editingDragon._id && (
                    <button
                      type="button"
                      className="dragon-btn-danger"
                      disabled={savingDragon || deletingDragonId === editingDragon._id}
                      onClick={() => handleDeleteDragon(editingDragon._id)}
                    >
                      {deletingDragonId === editingDragon._id ? "Deleting..." : "Delete Dragon"}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="dragon-btn-secondary"
                    disabled={savingDragon}
                    onClick={() => setEditingDragon(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="dragon-btn-primary"
                    disabled={savingDragon}
                  >
                    {savingDragon ? "Saving..." : editingDragon._id ? "Save Changes" : "Create Dragon"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === "events" && (
        <div className="dragon-panel">
          <div className="dragon-controls">
            <input
              type="text"
              className="dragon-search-input"
              placeholder="Search events by title or slug..."
              value={eventSearchQuery}
              onChange={(e) => setEventSearchQuery(e.target.value)}
            />

            <button
              type="button"
              className="dragon-btn-primary"
              onClick={handleOpenNewEvent}
            >
              + Create Event
            </button>
          </div>

          {events === undefined ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              Loading events from Convex...
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              No events found.
            </div>
          ) : (
            <div className="dragon-table-wrapper">
              <table className="dragon-users-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Slug</th>
                    <th>Groups / Slots</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((ev) => {
                    const evDate = new Date(ev.date);
                    const isMulti = isMultiDayEvent(ev.date, ev.endDate);
                    const durationDays = getEventDurationDays(ev.date, ev.endDate);
                    const evEndDate = ev.endDate ? new Date(ev.endDate) : null;

                    let formattedDate = isNaN(evDate.getTime())
                      ? ev.date
                      : evDate.toLocaleDateString("nl-BE", {
                          timeZone: "Europe/Brussels",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        });

                    let formattedTime = isNaN(evDate.getTime())
                      ? ""
                      : evDate.toLocaleTimeString("en-GB", {
                          timeZone: "Europe/Brussels",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        });

                    if (isMulti && evEndDate && !isNaN(evEndDate.getTime())) {
                      const startDayMo = evDate.toLocaleDateString("nl-BE", {
                        timeZone: "Europe/Brussels",
                        day: "numeric",
                        month: "short",
                      });
                      const endDayMoYear = evEndDate.toLocaleDateString("nl-BE", {
                        timeZone: "Europe/Brussels",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      });
                      formattedDate = `${startDayMo} – ${endDayMoYear}`;

                      const startWd = evDate.toLocaleDateString("en-US", {
                        timeZone: "Europe/Brussels",
                        weekday: "short",
                      });
                      const endWd = evEndDate.toLocaleDateString("en-US", {
                        timeZone: "Europe/Brussels",
                        weekday: "short",
                      });
                      const startTime = evDate.toLocaleTimeString("en-GB", {
                        timeZone: "Europe/Brussels",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                      const endTime = evEndDate.toLocaleTimeString("en-GB", {
                        timeZone: "Europe/Brussels",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                      formattedTime = `${startWd} ${startTime} → ${endWd} ${endTime}`;
                    } else if (evEndDate && !isNaN(evEndDate.getTime())) {
                      const endTime = evEndDate.toLocaleTimeString("en-GB", {
                        timeZone: "Europe/Brussels",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      });
                      formattedTime = `${formattedTime} – ${endTime}`;
                    }

                    const totalSlots = ev.groups?.reduce((acc, g) => acc + g.maxSlots, 0) || 0;

                    return (
                      <tr
                        key={ev._id}
                        className="dragon-table-row-clickable"
                        onClick={() => handleOpenEditEvent(ev)}
                      >
                        <td style={{ color: "var(--secondary)", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span style={{ fontWeight: 600, color: "var(--light)" }}>{formattedDate}</span>
                              {isMulti && (
                                <span
                                  style={{
                                    background: "rgba(56, 189, 248, 0.15)",
                                    border: "1px solid rgba(56, 189, 248, 0.4)",
                                    color: "#7dd3fc",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "0.05rem 0.35rem",
                                    borderRadius: "0.25rem",
                                  }}
                                >
                                  {durationDays}d
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: "0.82rem", color: "var(--secondary)", fontWeight: 500 }}>
                              {formattedTime ? `⏰ ${formattedTime}` : "—"}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, color: "var(--light)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span>{ev.title}</span>
                            {ev.isCancelled && (
                              <span
                                style={{
                                  background: "rgba(239, 68, 68, 0.2)",
                                  border: "1px solid rgba(239, 68, 68, 0.5)",
                                  color: "#fca5a5",
                                  fontSize: "0.7rem",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: "0.3rem",
                                  fontWeight: 700,
                                }}
                              >
                                {ev.cancelReason ? `CLOSED: ${ev.cancelReason}` : "CLOSED / CANCELLED"}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "var(--secondary)", fontWeight: 400, marginTop: "0.2rem" }}>
                            📍 {ev.location?.trim() || "Het Textielhuis, Kortrijk"}
                          </div>
                        </td>
                        <td style={{ color: "rgba(242, 211, 180, 0.7)", fontFamily: "monospace", fontSize: "0.85rem" }}>
                          {ev.slug}
                        </td>
                        <td>
                          {ev.groups && ev.groups.length > 0 ? (
                            <span style={{ fontSize: "0.85rem", color: "var(--secondary)" }}>
                              {ev.groups.length} tables ({totalSlots} slots)
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.3)" }}>
                              None
                            </span>
                          )}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button
                              type="button"
                              className="dragon-btn-secondary"
                              style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                              onClick={() => handleOpenEditEvent(ev)}
                            >
                              Edit
                            </button>
                            <Link
                              href={`/event/${ev.slug}`}
                              target="_blank"
                              className="dragon-btn-secondary"
                              style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem", textDecoration: "none" }}
                            >
                              View ↗
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Event Modal */}
      {editingEvent && (
        <div className="dragon-modal-backdrop" onClick={() => !savingEvent && setEditingEvent(null)}>
          <div className="dragon-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dragon-modal-header">
              <h2>{editingEvent._id ? "Edit Event" : "Create New Event"}</h2>
              <button
                type="button"
                className="dragon-modal-close"
                onClick={() => setEditingEvent(null)}
                disabled={savingEvent}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEvent} style={{ display: "contents" }}>
              <div className="dragon-modal-body">
                {eventModalError && (
                  <div
                    style={{
                      background: "rgba(220, 38, 38, 0.2)",
                      color: "#f87171",
                      padding: "0.75rem 1rem",
                      borderRadius: "0.5rem",
                    }}
                  >
                    {eventModalError}
                  </div>
                )}

                <div className="dragon-form-group">
                  <label htmlFor="event-title">Title *</label>
                  <input
                    id="event-title"
                    type="text"
                    required
                    className="dragon-form-input"
                    value={editingEvent.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      if (!editingEvent._id) {
                        // Generate slug suggestion from title + date
                        const slugSuffix = title.replace(/[^a-zA-Z0-9]/g, "");
                        const datePrefix = eventDateLocal ? eventDateLocal.slice(0, 10).replace(/-/g, "") : "";
                        setEditingEvent({
                          ...editingEvent,
                          title,
                          slug: `${datePrefix}_${slugSuffix}`,
                        });
                      } else {
                        setEditingEvent({ ...editingEvent, title });
                      }
                    }}
                    placeholder="e.g. One Shot Night!"
                  />
                </div>

                <div className="dragon-form-row-2col">
                  <div className="dragon-form-group">
                    <label htmlFor="event-slug">Slug (Filename/URL) *</label>
                    <input
                      id="event-slug"
                      type="text"
                      required
                      className="dragon-form-input"
                      value={editingEvent.slug}
                      onChange={(e) =>
                        setEditingEvent({
                          ...editingEvent,
                          slug: e.target.value.replace(/\.mdx$/, ""),
                        })
                      }
                      placeholder="e.g. 20260923_Oneshot"
                    />
                  </div>

                  <div className="dragon-form-group">
                    <label htmlFor="event-location">Location</label>
                    <input
                      id="event-location"
                      type="text"
                      className="dragon-form-input"
                      placeholder="e.g. Het Textielhuis, Kortrijk"
                      value={editingEvent.location ?? "Het Textielhuis, Kortrijk"}
                      onChange={(e) =>
                        setEditingEvent({
                          ...editingEvent,
                          location: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="dragon-form-row-2col">
                  <div className="dragon-form-group">
                    <label htmlFor="event-date">Start Date & Time (Brussels 24h) *</label>
                    <input
                      id="event-date"
                      type="datetime-local"
                      required
                      className="dragon-form-input"
                      value={eventDateLocal}
                      onChange={(e) => setEventDateLocal(e.target.value)}
                    />
                  </div>

                  <div className="dragon-form-group">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label htmlFor="event-end-date" style={{ margin: 0 }}>
                        End Date & Time (Brussels 24h)
                      </label>
                      {eventEndDateLocal && (
                        <button
                          type="button"
                          onClick={() => setEventEndDateLocal("")}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#f87171",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <input
                      id="event-end-date"
                      type="datetime-local"
                      className="dragon-form-input"
                      value={eventEndDateLocal}
                      onChange={(e) => setEventEndDateLocal(e.target.value)}
                    />
                    {eventEndDateLocal && (
                      <span style={{ fontSize: "0.78rem", color: "var(--secondary)", marginTop: "0.25rem", display: "block" }}>
                        {eventDateLocal && eventEndDateLocal < eventDateLocal
                          ? "⚠️ End time cannot be before start time"
                          : eventDateLocal && eventDateLocal.slice(0, 10) !== eventEndDateLocal.slice(0, 10)
                          ? `🗓️ Multi-day event (${getEventDurationDays(brusselsLocalToUtcIso(eventDateLocal), brusselsLocalToUtcIso(eventEndDateLocal))} days)`
                          : "Single-day event with designated end time"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Closure / Cancellation Warning Section */}
                <div
                  style={{
                    background: editingEvent.isCancelled ? "rgba(239, 68, 68, 0.12)" : "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${editingEvent.isCancelled ? "rgba(239, 68, 68, 0.4)" : "rgba(255, 255, 255, 0.08)"}`,
                    borderRadius: "0.6rem",
                    padding: "1rem",
                    marginBottom: "1rem",
                    transition: "all 0.2s ease",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", fontWeight: 600, color: editingEvent.isCancelled ? "#fca5a5" : "var(--light)" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editingEvent.isCancelled)}
                      onChange={(e) =>
                        setEditingEvent({
                          ...editingEvent,
                          isCancelled: e.target.checked,
                        })
                      }
                      style={{ width: "1.1rem", height: "1.1rem", cursor: "pointer" }}
                    />
                    <span>⚠️ Mark as Closed / No Event Exception (Warning)</span>
                  </label>

                  {editingEvent.isCancelled && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <label htmlFor="event-cancel-reason" style={{ fontSize: "0.85rem", color: "var(--secondary)", display: "block", marginBottom: "0.3rem" }}>
                        Closure / Warning Reason (shown in calendar & event list)
                      </label>
                      <input
                        id="event-cancel-reason"
                        type="text"
                        className="dragon-form-input"
                        placeholder="e.g. Het Textielhuis is closed (Geen evenement)"
                        value={editingEvent.cancelReason || ""}
                        onChange={(e) =>
                          setEditingEvent({
                            ...editingEvent,
                            cancelReason: e.target.value,
                          })
                        }
                      />
                    </div>
                  )}
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="event-body">Event Description (Markdown)</label>
                  <textarea
                    id="event-body"
                    rows={8}
                    className="dragon-form-textarea"
                    value={editingEvent.body}
                    onChange={(e) =>
                      setEditingEvent({ ...editingEvent, body: e.target.value })
                    }
                    placeholder="Curious about Dungeons & Dragons? ..."
                  />
                </div>

                <div className="dragon-form-group">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <label style={{ margin: 0 }}>Signup Table Groups</label>
                    <button
                      type="button"
                      className="dragon-btn-secondary"
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                      onClick={() =>
                        setEditingEvent({
                          ...editingEvent,
                          groups: [
                            ...editingEvent.groups,
                            {
                              name: `Table ${editingEvent.groups.length + 1}`,
                              description: "",
                              maxSlots: 6,
                            },
                          ],
                        })
                      }
                    >
                      + Add Group / Table
                    </button>
                  </div>

                  {editingEvent.groups.length === 0 ? (
                    <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.85rem", margin: 0 }}>
                      No signup groups configured. Users won&apos;t see internal table signups.
                    </p>
                  ) : (
                    editingEvent.groups.map((grp, idx) => (
                      <div key={idx} className="dragon-group-row">
                        <input
                          type="text"
                          className="dragon-form-input"
                          placeholder="Group Name (e.g. Table 1)"
                          value={grp.name}
                          required
                          onChange={(e) => {
                            const newGroups = [...editingEvent.groups];
                            newGroups[idx].name = e.target.value;
                            setEditingEvent({ ...editingEvent, groups: newGroups });
                          }}
                        />
                        <input
                          type="text"
                          className="dragon-form-input"
                          placeholder="Description (optional)"
                          value={grp.description || ""}
                          onChange={(e) => {
                            const newGroups = [...editingEvent.groups];
                            newGroups[idx].description = e.target.value;
                            setEditingEvent({ ...editingEvent, groups: newGroups });
                          }}
                        />
                        <input
                          type="number"
                          min={1}
                          max={50}
                          className="dragon-form-input"
                          placeholder="Max"
                          value={grp.maxSlots}
                          required
                          onChange={(e) => {
                            const newGroups = [...editingEvent.groups];
                            newGroups[idx].maxSlots = parseInt(e.target.value, 10) || 1;
                            setEditingEvent({ ...editingEvent, groups: newGroups });
                          }}
                        />
                        <button
                          type="button"
                          className="dragon-btn-danger"
                          onClick={() => {
                            const newGroups = editingEvent.groups.filter((_, i) => i !== idx);
                            setEditingEvent({ ...editingEvent, groups: newGroups });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="dragon-modal-footer">
                <div>
                  {editingEvent._id && (
                    <button
                      type="button"
                      className="dragon-btn-danger"
                      disabled={savingEvent || deletingEventId === editingEvent._id}
                      onClick={() => handleDeleteEvent(editingEvent._id)}
                    >
                      {deletingEventId === editingEvent._id ? "Deleting..." : "Delete Event"}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="dragon-btn-secondary"
                    disabled={savingEvent}
                    onClick={() => setEditingEvent(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="dragon-btn-primary"
                    disabled={savingEvent}
                  >
                    {savingEvent ? "Saving..." : editingEvent._id ? "Save Changes" : "Create Event"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SPONSORS TAB */}
      {activeTab === "sponsors" && (
        <div className="dragon-panel">
          <div className="dragon-controls">
            <input
              type="text"
              className="dragon-search-input"
              placeholder="Search sponsors by name or deal..."
              value={sponsorSearchQuery}
              onChange={(e) => setSponsorSearchQuery(e.target.value)}
            />

            <button
              type="button"
              className="dragon-btn-primary"
              onClick={handleOpenNewSponsor}
            >
              + Add Sponsor Deal
            </button>
          </div>

          {sponsors === undefined ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              Loading sponsors from Convex...
            </div>
          ) : filteredSponsors.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              No sponsors found.
            </div>
          ) : (
            <div className="dragon-table-wrapper">
              <table className="dragon-users-table">
                <thead>
                  <tr>
                    <th>Sponsor</th>
                    <th>Link</th>
                    <th>Deal / Snippet</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSponsors.map((sp) => (
                    <tr
                      key={sp._id}
                      className="dragon-table-row-clickable"
                      onClick={() => handleOpenEditSponsor(sp)}
                    >
                      <td>
                        <div className="dragon-user-info">
                          {sp.image ? (
                            <Image
                              src={sp.image}
                              alt={sp.name}
                              width={40}
                              height={40}
                              className="dragon-avatar"
                              style={{ objectFit: "contain", background: "white" }}
                            />
                          ) : (
                            <div className="dragon-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
                              {sp.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="dragon-fullname">{sp.name}</span>
                        </div>
                      </td>
                      <td style={{ color: "var(--secondary)" }}>
                        <a
                          href={sp.link}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "var(--secondary)", textDecoration: "underline" }}
                        >
                          {sp.link.replace(/^https?:\/\//, "").slice(0, 30)}...
                        </a>
                      </td>
                      <td style={{ color: "rgba(242, 211, 180, 0.7)", fontSize: "0.85rem", maxWidth: "300px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {sp.snippet.replace(/[\n#*]/g, " ").trim()}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="dragon-btn-secondary"
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                            onClick={() => handleOpenEditSponsor(sp)}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Sponsor Modal */}
      {editingSponsor && (
        <div className="dragon-modal-backdrop" onClick={() => !savingSponsor && setEditingSponsor(null)}>
          <div className="dragon-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dragon-modal-header">
              <h2>{editingSponsor._id ? "Edit Sponsor" : "Add Sponsor Deal"}</h2>
              <button
                type="button"
                className="dragon-modal-close"
                onClick={() => setEditingSponsor(null)}
                disabled={savingSponsor}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSponsor} style={{ display: "contents" }}>
              <div className="dragon-modal-body">
                {sponsorModalError && (
                  <div
                    style={{
                      background: "rgba(220, 38, 38, 0.2)",
                      color: "#f87171",
                      padding: "0.75rem 1rem",
                      borderRadius: "0.5rem",
                    }}
                  >
                    {sponsorModalError}
                  </div>
                )}

                <div className="dragon-form-group">
                  <label htmlFor="sponsor-name">Partner Name *</label>
                  <input
                    id="sponsor-name"
                    type="text"
                    required
                    className="dragon-form-input"
                    value={editingSponsor.name}
                    onChange={(e) =>
                      setEditingSponsor({ ...editingSponsor, name: e.target.value })
                    }
                    placeholder="e.g. Paul's Fresh Food Boutique"
                  />
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="sponsor-link">Website / Link *</label>
                  <input
                    id="sponsor-link"
                    type="url"
                    required
                    className="dragon-form-input"
                    value={editingSponsor.link}
                    onChange={(e) =>
                      setEditingSponsor({ ...editingSponsor, link: e.target.value })
                    }
                    placeholder="https://..."
                  />
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="sponsor-image">Logo Image URL</label>
                  <input
                    id="sponsor-image"
                    type="text"
                    className="dragon-form-input"
                    value={editingSponsor.image || ""}
                    onChange={(e) =>
                      setEditingSponsor({ ...editingSponsor, image: e.target.value })
                    }
                    placeholder="/uploads/logoPauls2015.png"
                  />
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="sponsor-snippet">Deal Snippet (Markdown) *</label>
                  <textarea
                    id="sponsor-snippet"
                    rows={4}
                    required
                    className="dragon-form-textarea"
                    value={editingSponsor.snippet}
                    onChange={(e) =>
                      setEditingSponsor({ ...editingSponsor, snippet: e.target.value })
                    }
                    placeholder="## Paul's Boutique\n\n€ 2 discount when purchasing a burger."
                  />
                </div>
              </div>

              <div className="dragon-modal-footer">
                <div>
                  {editingSponsor._id && (
                    <button
                      type="button"
                      className="dragon-btn-danger"
                      disabled={savingSponsor || deletingSponsorId === editingSponsor._id}
                      onClick={() => handleDeleteSponsor(editingSponsor._id)}
                    >
                      {deletingSponsorId === editingSponsor._id ? "Deleting..." : "Delete Deal"}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="dragon-btn-secondary"
                    disabled={savingSponsor}
                    onClick={() => setEditingSponsor(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="dragon-btn-primary"
                    disabled={savingSponsor}
                  >
                    {savingSponsor ? "Saving..." : editingSponsor._id ? "Save Changes" : "Create Deal"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAGES TAB */}
      {activeTab === "pages" && (
        <div className="dragon-panel">
          <div className="dragon-controls">
            <input
              type="text"
              className="dragon-search-input"
              placeholder="Search pages by title or slug..."
              value={pageSearchQuery}
              onChange={(e) => setPageSearchQuery(e.target.value)}
            />

            <button
              type="button"
              className="dragon-btn-primary"
              onClick={handleOpenNewPage}
            >
              + Add Page
            </button>
          </div>

          {pages === undefined ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              Loading pages from Convex...
            </div>
          ) : filteredPages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              No pages found.
            </div>
          ) : (
            <div className="dragon-table-wrapper">
              <table className="dragon-users-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Slug</th>
                    <th>Language</th>
                    <th>Status</th>
                    <th>Header</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPages.map((pg) => (
                    <tr
                      key={pg._id}
                      className="dragon-table-row-clickable"
                      onClick={() => handleOpenEditPage(pg)}
                    >
                      <td style={{ fontWeight: 600, color: "var(--light)" }}>
                        {pg.title}
                      </td>
                      <td style={{ color: "rgba(242, 211, 180, 0.7)", fontFamily: "monospace", fontSize: "0.85rem" }}>
                        /{pg.language}/{pg.slug}
                      </td>
                      <td>
                        <span className="role-badge" style={{ background: "rgba(255,255,255,0.05)", textTransform: "uppercase" }}>
                          {pg.language}
                        </span>
                      </td>
                      <td>
                        {pg.enabled ? (
                          <span className="role-badge role-member">Active</span>
                        ) : (
                          <span className="role-badge" style={{ color: "var(--secondary)" }}>Draft</span>
                        )}
                      </td>
                      <td>
                        {pg.hideFromHeader ? (
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.85rem" }}>Hidden</span>
                        ) : (
                          <span style={{ color: "var(--secondary)", fontSize: "0.85rem" }}>Visible</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="dragon-btn-secondary"
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
                            onClick={() => handleOpenEditPage(pg)}
                          >
                            Edit
                          </button>
                          <Link
                            href={`/${pg.language}/${pg.slug}`}
                            target="_blank"
                            className="dragon-btn-secondary"
                            style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem", textDecoration: "none" }}
                          >
                            View ↗
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Page Modal */}
      {editingPage && (
        <div className="dragon-modal-backdrop" onClick={() => !savingPage && setEditingPage(null)}>
          <div className="dragon-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dragon-modal-header">
              <h2>{editingPage._id ? "Edit Page" : "Create New Page"}</h2>
              <button
                type="button"
                className="dragon-modal-close"
                onClick={() => setEditingPage(null)}
                disabled={savingPage}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePage} style={{ display: "contents" }}>
              <div className="dragon-modal-body">
                {pageModalError && (
                  <div
                    style={{
                      background: "rgba(220, 38, 38, 0.2)",
                      color: "#f87171",
                      padding: "0.75rem 1rem",
                      borderRadius: "0.5rem",
                    }}
                  >
                    {pageModalError}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
                  <div className="dragon-form-group">
                    <label htmlFor="page-title">Page Title *</label>
                    <input
                      id="page-title"
                      type="text"
                      required
                      className="dragon-form-input"
                      value={editingPage.title}
                      onChange={(e) => {
                        const title = e.target.value;
                        if (!editingPage._id && !editingPage.slug) {
                          setEditingPage({
                            ...editingPage,
                            title,
                            slug: title.replace(/[^a-zA-Z0-9]/g, ""),
                          });
                        } else {
                          setEditingPage({ ...editingPage, title });
                        }
                      }}
                      placeholder="e.g. Donate"
                    />
                  </div>

                  <div className="dragon-form-group">
                    <label htmlFor="page-language">Language *</label>
                    <select
                      id="page-language"
                      className="dragon-filter-select"
                      value={editingPage.language}
                      onChange={(e) =>
                        setEditingPage({ ...editingPage, language: e.target.value })
                      }
                    >
                      <option value="nl">Dutch (NL)</option>
                      <option value="en">English (EN)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="dragon-form-group">
                    <label htmlFor="page-slug">Slug (URL filename) *</label>
                    <input
                      id="page-slug"
                      type="text"
                      required
                      className="dragon-form-input"
                      value={editingPage.slug}
                      onChange={(e) =>
                        setEditingPage({
                          ...editingPage,
                          slug: e.target.value.replace(/\.mdx$/, ""),
                        })
                      }
                      placeholder="e.g. Donate"
                    />
                  </div>

                  <div className="dragon-form-group">
                    <label htmlFor="page-translationSlug">Translation Slug (Other Language)</label>
                    <input
                      id="page-translationSlug"
                      type="text"
                      className="dragon-form-input"
                      value={editingPage.translationSlug || ""}
                      onChange={(e) =>
                        setEditingPage({
                          ...editingPage,
                          translationSlug: e.target.value,
                        })
                      }
                      placeholder="e.g. Doneren"
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div className="dragon-form-group">
                    <label htmlFor="page-iconName">Lucide Icon (optional)</label>
                    <input
                      id="page-iconName"
                      type="text"
                      className="dragon-form-input"
                      value={editingPage.iconName || ""}
                      onChange={(e) =>
                        setEditingPage({ ...editingPage, iconName: e.target.value })
                      }
                      placeholder="Sparkles, Dices, Calendar, Users, Map..."
                    />
                  </div>

                  <div className="dragon-form-group">
                    <label htmlFor="page-weight">Weight (Order in navigation)</label>
                    <input
                      id="page-weight"
                      type="number"
                      className="dragon-form-input"
                      value={editingPage.weight ?? 100}
                      onChange={(e) =>
                        setEditingPage({
                          ...editingPage,
                          weight: parseInt(e.target.value, 10) || 100,
                        })
                      }
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: "2rem", margin: "0.5rem 0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={editingPage.enabled}
                      onChange={(e) =>
                        setEditingPage({ ...editingPage, enabled: e.target.checked })
                      }
                    />
                    <span>Page Enabled</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editingPage.hideFromHeader)}
                      onChange={(e) =>
                        setEditingPage({
                          ...editingPage,
                          hideFromHeader: e.target.checked,
                        })
                      }
                    />
                    <span>Hide from Header Navigation</span>
                  </label>
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="page-snippet">Card Snippet on Home Page (Markdown)</label>
                  <textarea
                    id="page-snippet"
                    rows={3}
                    className="dragon-form-textarea"
                    value={editingPage.snippet || ""}
                    onChange={(e) =>
                      setEditingPage({ ...editingPage, snippet: e.target.value })
                    }
                    placeholder="Short description snippet for homepage featurette..."
                  />
                </div>

                <div className="dragon-form-group">
                  <label htmlFor="page-body">Page Body (Markdown / MDX)</label>
                  <textarea
                    id="page-body"
                    rows={10}
                    required
                    className="dragon-form-textarea"
                    value={editingPage.body}
                    onChange={(e) =>
                      setEditingPage({ ...editingPage, body: e.target.value })
                    }
                    placeholder="# Page Header&#10;&#10;Content goes here..."
                  />
                </div>
              </div>

              <div className="dragon-modal-footer">
                <div>
                  {editingPage._id && (
                    <button
                      type="button"
                      className="dragon-btn-danger"
                      disabled={savingPage || deletingPageId === editingPage._id}
                      onClick={() => handleDeletePage(editingPage._id)}
                    >
                      {deletingPageId === editingPage._id ? "Deleting..." : "Delete Page"}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="dragon-btn-secondary"
                    disabled={savingPage}
                    onClick={() => setEditingPage(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="dragon-btn-primary"
                    disabled={savingPage}
                  >
                    {savingPage ? "Saving..." : editingPage._id ? "Save Changes" : "Create Page"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="dragon-panel">
          <div className="dragon-controls">
            <input
              type="text"
              className="dragon-search-input"
              placeholder="Search by full name, email, or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className="dragon-filter-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">All Roles ({users.length})</option>
              <option value="dragon">
                Dragons ({users.filter((u) => u.role === "dragon").length})
              </option>
              <option value="member">
                Members ({users.filter((u) => u.role === "member").length})
              </option>
              <option value="user">
                Standard Users ({users.filter((u) => u.role === "user").length})
              </option>
            </select>
          </div>

          {errorMessage && (
            <div
              style={{
                background: "rgba(220, 38, 38, 0.2)",
                color: "#f87171",
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              {errorMessage}
            </div>
          )}

          {loadingUsers ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              Loading user registry...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--secondary)" }}>
              No users match your criteria.
            </div>
          ) : (
            <div className="dragon-table-wrapper">
              <table className="dragon-users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Membership</th>
                    <th>Role</th>
                    <th style={{ textAlign: "center" }}>Voidmaster</th>
                    <th style={{ textAlign: "center" }}>Void Manager</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="dragon-user-info">
                          {u.imageUrl ? (
                            <Image
                              src={u.imageUrl}
                              alt={u.fullName}
                              width={40}
                              height={40}
                              className="dragon-avatar"
                            />
                          ) : (
                            <div className="dragon-avatar" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
                              {u.fullName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="dragon-user-names">
                            <span className="dragon-fullname">{u.fullName}</span>
                            {u.username && (
                              <span className="dragon-username">@{u.username}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "var(--secondary)" }}>{u.email}</td>
                      <td>
                        {u.role === "dragon" ? (
                          <span className="role-badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                            Dragon
                          </span>
                        ) : u.isMember ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                            <span className="role-badge role-member">Active</span>
                            {u.hasStripeSubscription ? (
                              <span style={{ fontSize: "0.75rem", color: "var(--secondary)", opacity: 0.8 }}>
                                Stripe Subscription
                              </span>
                            ) : u.membershipExpiresAt ? (
                              <span style={{ fontSize: "0.75rem", color: "var(--secondary)", opacity: 0.8 }}>
                                Exp: {new Date(u.membershipExpiresAt).toLocaleDateString()}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span
                            className="role-badge"
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              color: "var(--secondary)",
                            }}
                          >
                            None
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <select
                            className={`role-select role-${u.role}`}
                            value={u.role}
                            disabled={updatingUserId === u.id}
                            onChange={(e) =>
                              handleRoleChange(u, e.target.value as Role)
                            }
                          >
                            <option value="user">User</option>
                            <option value="member">Member</option>
                            <option value="dragon">Dragon (Admin)</option>
                          </select>

                          {updatingUserId === u.id && (
                            <span className="status-indicator saving">
                              Updating...
                            </span>
                          )}
                          {savedUserId === u.id && (
                            <span className="status-indicator saved">
                              ✓ Saved
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: updatingUserId === u.id ? "not-allowed" : "pointer",
                            padding: "0.25rem",
                          }}
                          title="Sets Clerk publicMetadata.gamemaster"
                        >
                          <input
                            type="checkbox"
                            style={{
                              width: "1.1rem",
                              height: "1.1rem",
                              cursor: "pointer",
                              accentColor: "var(--secondary)",
                            }}
                            checked={Boolean(u.voidmaster)}
                            disabled={updatingUserId === u.id}
                            onChange={(e) =>
                              handleToggleVoidmaster(u, e.target.checked)
                            }
                          />
                        </label>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: updatingUserId === u.id ? "not-allowed" : "pointer",
                            padding: "0.25rem",
                          }}
                          title="Sets Clerk publicMetadata.admin"
                        >
                          <input
                            type="checkbox"
                            style={{
                              width: "1.1rem",
                              height: "1.1rem",
                              cursor: "pointer",
                              accentColor: "#ef4444",
                            }}
                            checked={Boolean(u.voidManager)}
                            disabled={updatingUserId === u.id}
                            onChange={(e) =>
                              handleToggleVoidManager(u, e.target.checked)
                            }
                          />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

