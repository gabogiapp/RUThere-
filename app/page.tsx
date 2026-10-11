"use client";

import React, { useState, useEffect, useMemo } from "react";
import Fuse from "fuse.js";
import {
  Globe,
  Search,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  RefreshCw,
  Play,
  Zap,
  CheckCircle2,
  AlertCircle,
  Users,
  Code2,
  Send,
  Sparkles,
} from "lucide-react";

interface Club {
  id?: string | number;
  handle: string;
  name: string;
  category?: string;
  biography?: string;
  followers?: number;
  following?: number;
  posts_count?: number;
  url?: string;
  profile_image_link?: string;
  is_verified?: boolean;
}

interface ClubEvent {
  id: string;
  club_id?: string | number;
  club_handle: string;
  club_name: string;
  instagram_post_id: string;
  post_url: string;
  title: string;
  date?: string;
  time?: string;
  location: string;
  description?: string;
  important_links?: string[];
  image_url?: string;
  event_time?: string;
  is_event: boolean;
  extraction_source?: "gemini" | "heuristic";
}

const PRESET_CLUBS = [
  { label: "@rutgersu", url: "https://www.instagram.com/rutgersu" },
  { label: "@rutgers.usg", url: "https://www.instagram.com/rutgers.usg" },
  { label: "@ru_rudo", url: "https://www.instagram.com/ru_rudo" },
  { label: "@rutgersesports", url: "https://www.instagram.com/rutgersesports" },
  { label: "@rutgers_ieee", url: "https://www.instagram.com/rutgers_ieee" },
];

export default function Home() {
  const [urlInput, setUrlInput] = useState("https://www.instagram.com/rutgersu");
  const [activeTab, setActiveTab] = useState<"events" | "clubs" | "architecture" | "raw">("events");
  const [searchQuery, setSearchQuery] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<string | null>(null);
  const [pollingSeconds, setPollingSeconds] = useState(0);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [webhookMessage, setWebhookMessage] = useState<string | null>(null);

  // Load existing clubs and events on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [clubsRes, eventsRes] = await Promise.all([
        fetch("/api/clubs"),
        fetch("/api/events"),
      ]);
      const clubsData = await clubsRes.json();
      const eventsData = await eventsRes.json();
      if (clubsData.clubs) setClubs(clubsData.clubs);
      if (eventsData.events) setEvents(eventsData.events);
    } catch (err) {
      console.error("Failed to load initial data", err);
    }
  };

  // Setup Fuse.js for fuzzy event search
  const fuse = useMemo(() => {
    return new Fuse(events, {
      keys: ["title", "location", "club_name", "club_handle", "description"],
      threshold: 0.35,
    });
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    return fuse.search(searchQuery).map((result) => result.item);
  }, [events, searchQuery, fuse]);

  // Handle URL presets
  const handleAddPreset = (url: string) => {
    const lines = urlInput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.includes(url)) {
      setUrlInput(lines.length > 0 ? `${urlInput.trim()}\n${url}` : url);
    }
  };

  const getCleanUrls = (): string[] => {
    return urlInput
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
  };

  // Run Scrape (Live)
  const handleRunScrape = async (asyncOnly = false) => {
    const urls = getCleanUrls();
    if (urls.length === 0) {
      alert("Please provide at least one valid Instagram URL.");
      return;
    }

    setIsLoading(true);
    setStatusMessage(asyncOnly ? "Triggering async scrape job..." : "Sending scrape request to Bright Data...");
    setRawResponse(null);
    setWebhookMessage(null);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, asyncOnly }),
      });

      const data = await res.json();
      setRawResponse(data);

      if (data.status === "complete") {
        setStatusMessage(`Scrape completed! Extracted ${data.events_extracted || 0} events.`);
        if (data.clubs) setClubs(data.clubs);
        if (data.events) setEvents(data.events);
        setIsLoading(false);
      } else if (data.status === "running" && data.snapshot_id) {
        setSnapshotId(data.snapshot_id);
        setSnapshotStatus("running");
        setStatusMessage(`Job is running asynchronously on Bright Data. Snapshot ID: ${data.snapshot_id}`);
        startPolling(data.snapshot_id);
      } else {
        setStatusMessage(data.message || data.error || "Scrape requested.");
        setIsLoading(false);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
      setIsLoading(false);
    }
  };

  // Auto-polling mechanism for Bright Data snapshots
  const startPolling = (sid: string) => {
    let seconds = 0;
    setPollingSeconds(0);

    const interval = setInterval(async () => {
      seconds += 5;
      setPollingSeconds(seconds);

      try {
        const res = await fetch(`/api/scrape?snapshot_id=${encodeURIComponent(sid)}`);
        const data = await res.json();
        setRawResponse(data);

        if (data.status === "ready") {
          clearInterval(interval);
          setSnapshotStatus("ready");
          setIsLoading(false);
          setStatusMessage(`Snapshot ${sid} is READY! Retrieved ${data.raw_records_count} profiles.`);
          if (data.clubs) setClubs(data.clubs);
          if (data.events) setEvents(data.events);
        } else if (data.status === "failed") {
          clearInterval(interval);
          setSnapshotStatus("failed");
          setIsLoading(false);
          setStatusMessage(`Snapshot ${sid} failed.`);
        } else {
          setSnapshotStatus(data.status || "running");
          setStatusMessage(`Polling Bright Data (elapsed: ${seconds}s, status: ${data.status || "running"})...`);
        }
      } catch (pollErr: any) {
        console.error("Poll check failed", pollErr);
      }
    }, 5000);
  };

  // Manual Poll
  const handleManualPoll = async () => {
    if (!snapshotId) return;
    setIsLoading(true);
    setStatusMessage(`Checking status of snapshot ${snapshotId}...`);
    try {
      const res = await fetch(`/api/scrape?snapshot_id=${encodeURIComponent(snapshotId)}`);
      const data = await res.json();
      setRawResponse(data);
      if (data.status === "ready") {
        setStatusMessage(`Snapshot is ready! Ingested records.`);
        if (data.clubs) setClubs(data.clubs);
        if (data.events) setEvents(data.events);
      } else {
        setStatusMessage(`Status: ${data.status}`);
      }
    } catch (e: any) {
      setStatusMessage(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate Webhook Ingestion
  const handleSimulateWebhook = async () => {
    setIsLoading(true);
    setStatusMessage("Simulating Bright Data Webhook delivery to /api/webhooks/brightdata...");
    try {
      // Load realistic Rutgers club events fixture for Gemini extraction test
      const fixtureRes = await fetch("/sample_club_events.json")
        .catch(() => null)
        .then((r) => (r && r.ok ? r : fetch("/sample_snapshot.json").catch(() => null)));
      let payload;
      if (fixtureRes && fixtureRes.ok) {
        payload = await fixtureRes.json();
      } else {
        // Fallback sample payload
        payload = [
          {
            account: "rutgersu",
            full_name: "Rutgers University",
            biography: "The State University of New Jersey #Rutgers",
            followers: 125000,
            posts_count: 3200,
            url: "https://www.instagram.com/rutgersu",
            posts: [
              {
                id: "test_post_001",
                caption: "Join us for our Fall Involvement Fair!\nWhen: Wednesday, Oct 24\nTime: 8:00 PM - 9:30 PM\nWhere: College Ave Student Center\nRegister with link in bio!",
                datetime: new Date().toISOString(),
                url: "https://www.instagram.com/p/test001",
              },
            ],
          },
        ];
      }

      const res = await fetch("/api/webhooks/brightdata?secret=test_secret_token_123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      setRawResponse(resData);
      setWebhookMessage(`Webhook Accepted! ${resData.clubs_updated} clubs updated, ${resData.events_extracted} events extracted.`);
      await fetchData();
    } catch (err: any) {
      setWebhookMessage(`Webhook simulation failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger Cron Simulation
  const handleTriggerCron = async () => {
    setIsLoading(true);
    setStatusMessage("Triggering Phase 1 Cron (/api/cron/trigger-scrape)...");
    try {
      const res = await fetch("/api/cron/trigger-scrape");
      const data = await res.json();
      setRawResponse(data);
      setStatusMessage(data.message || "Cron executed successfully.");
      if (data.snapshot_ids && data.snapshot_ids.length > 0) {
        setSnapshotId(data.snapshot_ids[0]);
        setSnapshotStatus("running");
        startPolling(data.snapshot_ids[0]);
      }
    } catch (err: any) {
      setStatusMessage(`Cron failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px" }}>
      {/* Top Header */}
      <header style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: "var(--rutgers-red)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 20,
                color: "#fff",
                boxShadow: "0 4px 14px rgba(204, 0, 51, 0.4)",
              }}
            >
              R
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px" }}>
              RUThere <span style={{ color: "var(--rutgers-red)" }}>Instagram Scraper</span>
            </h1>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Rutgers Club Events Aggregator • Bright Data Ingestion Engine & Testing Suite
          </p>
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "var(--accent-green)",
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <CheckCircle2 size={14} /> Bright Data API Ready
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              color: "var(--accent-blue)",
              fontSize: 12,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Sparkles size={14} /> Gemini 3.5 Flash Active
          </div>
          <div
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            dataset: gd_l1vikfch901nx3by4
          </div>
        </div>
      </header>

      {/* Main Scraper Test Console */}
      <section
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          padding: 24,
          marginBottom: 32,
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <Globe size={18} color="var(--rutgers-red)" /> Scrape URLs Input (Array)
          </h2>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Enter one or more Instagram profile URLs
          </span>
        </div>

        {/* Textarea */}
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          rows={3}
          placeholder="https://www.instagram.com/rutgersu&#10;https://www.instagram.com/rutgers.usg"
          style={{
            width: "100%",
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            padding: 12,
            color: "var(--text-primary)",
            fontSize: 14,
            fontFamily: "JetBrains Mono, monospace",
            resize: "vertical",
            marginBottom: 12,
            outline: "none",
          }}
        />

        {/* Quick Add Preset Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>
            Quick Rutgers Presets:
          </span>
          {PRESET_CLUBS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handleAddPreset(preset.url)}
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--rutgers-red)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => handleRunScrape(false)}
            disabled={isLoading}
            style={{
              backgroundColor: "var(--rutgers-red)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
            Scrape URLs (Live API)
          </button>

          <button
            onClick={() => handleRunScrape(true)}
            disabled={isLoading}
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Zap size={16} color="var(--accent-amber)" />
            Trigger Async Only
          </button>

          <button
            onClick={handleTriggerCron}
            disabled={isLoading}
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Clock size={16} color="var(--accent-blue)" />
            Run Cron Dispatch (/cron)
          </button>

          <button
            onClick={handleSimulateWebhook}
            disabled={isLoading}
            style={{
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              color: "var(--accent-blue)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: 8,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              cursor: isLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Send size={16} />
            Simulate Webhook Delivery
          </button>
        </div>

        {/* Live Status or Poller Banner */}
        {(statusMessage || snapshotId) && (
          <div
            style={{
              marginTop: 20,
              padding: "14px 18px",
              borderRadius: 8,
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isLoading ? (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "var(--accent-amber)",
                    boxShadow: "0 0 10px var(--accent-amber)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "var(--accent-green)",
                  }}
                />
              )}
              <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{statusMessage}</span>
            </div>

            {snapshotId && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  Snapshot: {snapshotId}
                </span>
                <button
                  onClick={handleManualPoll}
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Check Status
                </button>
              </div>
            )}
          </div>
        )}

        {webhookMessage && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 8,
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              color: "var(--accent-green)",
              fontSize: 13,
            }}
          >
            {webhookMessage}
          </div>
        )}
      </section>

      {/* Tabs Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-color)",
          marginBottom: 24,
          gap: 24,
        }}
      >
        <button
          onClick={() => setActiveTab("events")}
          style={{
            padding: "12px 0",
            background: "none",
            border: "none",
            color: activeTab === "events" ? "var(--rutgers-red)" : "var(--text-secondary)",
            borderBottom: activeTab === "events" ? "2px solid var(--rutgers-red)" : "2px solid transparent",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Calendar size={18} /> Extracted Events ({filteredEvents.length})
        </button>

        <button
          onClick={() => setActiveTab("clubs")}
          style={{
            padding: "12px 0",
            background: "none",
            border: "none",
            color: activeTab === "clubs" ? "var(--rutgers-red)" : "var(--text-secondary)",
            borderBottom: activeTab === "clubs" ? "2px solid var(--rutgers-red)" : "2px solid transparent",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Users size={18} /> Rutgers Clubs ({clubs.length})
        </button>

        <button
          onClick={() => setActiveTab("architecture")}
          style={{
            padding: "12px 0",
            background: "none",
            border: "none",
            color: activeTab === "architecture" ? "var(--rutgers-red)" : "var(--text-secondary)",
            borderBottom: activeTab === "architecture" ? "2px solid var(--rutgers-red)" : "2px solid transparent",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Sparkles size={18} /> Architecture & Pipeline
        </button>

        <button
          onClick={() => setActiveTab("raw")}
          style={{
            padding: "12px 0",
            background: "none",
            border: "none",
            color: activeTab === "raw" ? "var(--rutgers-red)" : "var(--text-secondary)",
            borderBottom: activeTab === "raw" ? "2px solid var(--rutgers-red)" : "2px solid transparent",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Code2 size={18} /> Raw JSON Debugger
        </button>
      </div>

      {/* Tab 1: Extracted Events */}
      {activeTab === "events" && (
        <div>
          {/* Fuse.js Instant Fuzzy Search Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              padding: "10px 16px",
              marginBottom: 20,
            }}
          >
            <Search size={18} color="var(--text-muted)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Instant Fuse.js search events by keyword, location (e.g. 'Busch', 'GBM', 'Workshop')..."
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontSize: 14,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Clear
              </button>
            )}
          </div>

          {filteredEvents.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                border: "1px dashed var(--border-color)",
                borderRadius: 12,
                color: "var(--text-secondary)",
              }}
            >
              <Calendar size={36} color="var(--text-muted)" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>No events found yet</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 460, margin: "0 auto" }}>
                Click &quot;Scrape URLs (Live API)&quot; or &quot;Simulate Webhook Delivery&quot; above to ingest Instagram posts and extract upcoming Rutgers club events.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
              {filteredEvents.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transition: "transform 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(204, 0, 51, 0.4)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-color)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <div>
                    {/* Club header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--rutgers-red)",
                            backgroundColor: "rgba(204, 0, 51, 0.1)",
                            padding: "3px 8px",
                            borderRadius: 6,
                          }}
                        >
                          @{ev.club_handle}
                        </span>
                        {ev.extraction_source === "gemini" && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--accent-blue)",
                              backgroundColor: "rgba(59, 130, 246, 0.15)",
                              padding: "2px 8px",
                              borderRadius: 6,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Sparkles size={11} /> Gemini AI
                          </span>
                        )}
                      </div>
                      <a
                        href={ev.post_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
                      >
                        Instagram <ExternalLink size={12} />
                      </a>
                    </div>

                    {/* Title */}
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>
                      {ev.title}
                    </h3>

                    {/* Date, Time, Location pills */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                        <Calendar size={14} color="var(--accent-blue)" />
                        <span>{ev.date || "Date TBA"}</span>
                        <span style={{ color: "var(--border-color)" }}>•</span>
                        <Clock size={14} color="var(--accent-amber)" />
                        <span>{ev.time || "Time TBA"}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                        <MapPin size={14} color="var(--rutgers-red)" />
                        <span>{ev.location}</span>
                      </div>
                    </div>

                    {/* Important links */}
                    {ev.important_links && ev.important_links.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                          Links & Info:
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                          {ev.important_links.map((link, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 4,
                                backgroundColor: "var(--bg-tertiary)",
                                border: "1px solid var(--border-color)",
                                color: "var(--accent-blue)",
                              }}
                            >
                              {link}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Caption preview footer */}
                  {ev.description && (
                    <details style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-color)" }}>
                      <summary style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}>
                        View full post caption
                      </summary>
                      <p
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          marginTop: 8,
                          whiteSpace: "pre-line",
                          lineHeight: 1.4,
                          maxHeight: 180,
                          overflowY: "auto",
                        }}
                      >
                        {ev.description}
                      </p>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Clubs Directory */}
      {activeTab === "clubs" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {clubs.map((c) => (
            <div
              key={c.handle}
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                {c.profile_image_link ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.profile_image_link}
                    alt={c.name}
                    style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      backgroundColor: "var(--bg-tertiary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      color: "var(--rutgers-red)",
                    }}
                  >
                    @{c.handle[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {c.name}
                    {c.is_verified && <CheckCircle2 size={14} color="var(--accent-blue)" />}
                  </h4>
                  <a
                    href={c.url || `https://www.instagram.com/${c.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 13, color: "var(--text-secondary)" }}
                  >
                    @{c.handle}
                  </a>
                </div>
              </div>

              {c.category && (
                <div style={{ marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 12,
                      backgroundColor: "var(--bg-tertiary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {c.category}
                  </span>
                </div>
              )}

              {c.biography && (
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 14, lineHeight: 1.4 }}>
                  {c.biography}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 16,
                  borderTop: "1px solid var(--border-color)",
                  paddingTop: 10,
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>{c.followers?.toLocaleString() || 0}</strong> followers
                </div>
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>{c.posts_count || 0}</strong> posts
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Architecture & Pipeline */}
      {activeTab === "architecture" && (
        <div
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            Rutgers Club Events Aggregator Architecture
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
            As documented in <code style={{ color: "var(--rutgers-red)" }}>ARCHITECTURE.md</code>, the system decouples long-running Instagram scraping (~1-3 minutes) from serverless requests using an asynchronous pipeline.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div style={{ backgroundColor: "var(--bg-primary)", padding: 18, borderRadius: 10, border: "1px solid var(--border-color)" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--accent-blue)", marginBottom: 8 }}>
                Phase 1: The Trigger
              </h3>
              <ol style={{ fontSize: 13, color: "var(--text-secondary)", paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Vercel Cron triggers <code style={{ color: "var(--text-primary)" }}>/api/cron/trigger-scrape</code> at 12:00 AM & 12:00 PM.</li>
                <li>Backend batches club URLs in chunks of 20.</li>
                <li>Sends POST to Bright Data <code style={{ color: "var(--text-primary)" }}>/datasets/v3/trigger</code> with webhook delivery URL.</li>
                <li>Returns HTTP 200 immediately (no serverless timeout).</li>
              </ol>
            </div>

            <div style={{ backgroundColor: "var(--bg-primary)", padding: 18, borderRadius: 10, border: "1px solid var(--border-color)" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--accent-green)", marginBottom: 8 }}>
                Phase 2: Webhook Processing
              </h3>
              <ol style={{ fontSize: 13, color: "var(--text-secondary)", paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Bright Data scrapes Instagram profiles & posts.</li>
                <li>Delivers completed JSON records via POST to <code style={{ color: "var(--text-primary)" }}>/api/webhooks/brightdata?secret=...</code></li>
                <li>Backend validates security token.</li>
                <li>Parses captions adhering to <code style={{ color: "var(--text-primary)" }}>example.json</code> schema and upserts to Neon database.</li>
              </ol>
            </div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
            Bright Data Webhook Delivery Endpoint:
          </h3>
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 13,
              color: "var(--text-primary)",
            }}
          >
            POST https://your-deployment.vercel.app/api/webhooks/brightdata?secret=test_secret_token_123
          </div>
        </div>
      )}

      {/* Tab 4: Raw JSON Debugger */}
      {activeTab === "raw" && (
        <div
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Active API Response Data</h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>JSON Inspector</span>
          </div>

          <pre
            style={{
              backgroundColor: "var(--bg-primary)",
              padding: 16,
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              fontSize: 12,
              color: "#38bdf8",
              maxHeight: 500,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {rawResponse
              ? JSON.stringify(rawResponse, null, 2)
              : JSON.stringify({ message: "No requests run yet. Trigger a scrape to view output." }, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
