const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const STATE_TABLE = "apex_user_state";
const WORKSPACE_TABLE = "apex_workspaces";
const NOTIFICATION_TABLE = "apex_notifications";
const UPLOAD_TABLE = "apex_uploads";
const SYLLABUS_TABLE = "apex_syllabi";
const NOTE_TABLE = "apex_notes";
const INTEGRATION_TABLE = "apex_integrations";
const INTEGRATION_EVENT_TABLE = "apex_integration_events";
const ACTIVITY_TABLE = "apex_activity_log";

export async function loadRuntimeConfig() {
  if (typeof fetch === "undefined") return { supabaseUrl: "", supabaseAnonKey: "" };
  try {
    const response = await fetch("/api/config", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Config returned ${response.status}`);
    const config = await response.json();
    return {
      supabaseUrl: config.supabaseUrl || "",
      supabaseAnonKey: config.supabaseAnonKey || "",
    };
  } catch {
    return {
      supabaseUrl: globalThis.APEX_CONFIG?.supabaseUrl || "",
      supabaseAnonKey: globalThis.APEX_CONFIG?.supabaseAnonKey || "",
    };
  }
}

export async function initAuthClient() {
  const config = await loadRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return { enabled: false, client: null, session: null, user: null, error: "Supabase is not configured yet." };
  }
  try {
    const { createClient } = await import(SUPABASE_CDN);
    const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return {
      enabled: true,
      client,
      session: data.session,
      user: data.session?.user || null,
      error: "",
    };
  } catch (error) {
    return {
      enabled: false,
      client: null,
      session: null,
      user: null,
      error: error instanceof Error ? error.message : "Unable to start Supabase Auth.",
    };
  }
}

export async function signInWithPassword(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword(client, email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut(client) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function loadUserWorkspace(client, userId) {
  const { data, error } = await client
    .from(STATE_TABLE)
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.state || null;
}

export async function saveUserWorkspace(client, userId, state) {
  const { error } = await client.from(STATE_TABLE).upsert({
    user_id: userId,
    state,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function ensureUserWorkspace(client, userId) {
  const existing = await client
    .from(WORKSPACE_TABLE)
    .select("id, name, updated_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const created = await client
    .from(WORKSPACE_TABLE)
    .insert({ owner_user_id: userId, name: "My APEX Workspace" })
    .select("id, name, updated_at")
    .single();
  if (created.error) throw created.error;
  return created.data;
}

export async function loadNotificationRecords(client, workspaceId, userId) {
  const { data, error } = await client
    .from(NOTIFICATION_TABLE)
    .select("id, type, title, body, severity, source_entity_type, source_entity_id, action_payload, created_at, read_at, resolved_at, dismissed_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

export async function createNotificationRecord(client, workspaceId, userId, notification) {
  const { data, error } = await client
    .from(NOTIFICATION_TABLE)
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      type: notification.type || "app",
      title: notification.title,
      body: notification.body || "",
      severity: notification.severity || "info",
      source_entity_type: notification.sourceEntityType || null,
      source_entity_id: notification.sourceEntityId || null,
      action_payload: notification.actionPayload || {},
    })
    .select("id, type, title, body, severity, source_entity_type, source_entity_id, action_payload, created_at, read_at, resolved_at, dismissed_at")
    .single();
  if (error) throw error;
  return data;
}

export async function markNotificationRecordRead(client, notificationId, userId) {
  const { data, error } = await client
    .from(NOTIFICATION_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select("id, read_at")
    .single();
  if (error) throw error;
  return data;
}

export async function dismissNotificationRecord(client, notificationId, userId) {
  const { data, error } = await client
    .from(NOTIFICATION_TABLE)
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .select("id, dismissed_at")
    .single();
  if (error) throw error;
  return data;
}

export async function loadUploadRecords(client, workspaceId) {
  const { data, error } = await client
    .from(UPLOAD_TABLE)
    .select("id, original_filename, mime_type, file_size_bytes, upload_status, extracted_text_status, storage_path, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function createUploadRecord(client, workspaceId, file) {
  const storagePath = `pending/${workspaceId}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
  const { data, error } = await client
    .from(UPLOAD_TABLE)
    .insert({
      workspace_id: workspaceId,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type || null,
      file_size_bytes: file.size || 0,
      upload_status: "uploaded",
      extracted_text_status: "pending",
    })
    .select("id, original_filename, mime_type, file_size_bytes, upload_status, extracted_text_status, storage_path, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function loadSyllabusRecords(client, workspaceId) {
  const { data, error } = await client
    .from(SYLLABUS_TABLE)
    .select("id, upload_id, title, parse_status, parsed_summary, confidence, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function createSyllabusRecord(client, workspaceId, syllabus) {
  const { data, error } = await client
    .from(SYLLABUS_TABLE)
    .insert({
      workspace_id: workspaceId,
      upload_id: syllabus.uploadId || null,
      title: syllabus.title,
      parse_status: syllabus.parseStatus || "needs_review",
      parsed_summary: syllabus.parsedSummary || {},
      confidence: syllabus.confidence ?? null,
    })
    .select("id, upload_id, title, parse_status, parsed_summary, confidence, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSyllabusRecord(client, syllabusId, patch) {
  const update = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.parseStatus !== undefined) update.parse_status = patch.parseStatus;
  if (patch.parsedSummary !== undefined) update.parsed_summary = patch.parsedSummary;
  if (patch.confidence !== undefined) update.confidence = patch.confidence;
  update.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from(SYLLABUS_TABLE)
    .update(update)
    .eq("id", syllabusId)
    .select("id, upload_id, title, parse_status, parsed_summary, confidence, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function loadNoteRecords(client, workspaceId) {
  const { data, error } = await client
    .from(NOTE_TABLE)
    .select("id, title, body, tags, domain, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function createNoteRecord(client, workspaceId, note) {
  const { data, error } = await client
    .from(NOTE_TABLE)
    .insert({
      workspace_id: workspaceId,
      title: note.title || "Untitled note",
      body: note.body || note.summary || "",
      tags: Array.isArray(note.tags) ? note.tags : [],
      domain: note.domain || "notebook",
    })
    .select("id, title, body, tags, domain, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function updateNoteRecord(client, noteId, patch) {
  const update = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.body !== undefined) update.body = patch.body;
  if (patch.summary !== undefined && patch.body === undefined) update.body = patch.summary;
  if (patch.tags !== undefined) update.tags = Array.isArray(patch.tags) ? patch.tags : [];
  if (patch.domain !== undefined) update.domain = patch.domain || "notebook";
  update.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from(NOTE_TABLE)
    .update(update)
    .eq("id", noteId)
    .select("id, title, body, tags, domain, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

const legacyIntegrationColumns = "id, provider, provider_type, status, scopes, token_ref, last_synced_at, next_sync_at, last_error, metadata, created_at, updated_at";
const integrationColumns = "id, provider, provider_type, status, auth_state, webhook_status, sync_status, scopes, token_ref, refresh_token_ref, token_expires_at, refresh_status, last_synced_at, next_sync_at, last_tested_at, last_sync_result, error_count, last_error, metadata, created_at, updated_at";

export async function loadIntegrationRecords(client, workspaceId) {
  const query = client
    .from(INTEGRATION_TABLE)
    .select(integrationColumns)
    .eq("workspace_id", workspaceId)
    .order("provider_type", { ascending: true })
    .order("provider", { ascending: true });
  const { data, error } = await query;
  if (error && /column .* does not exist/i.test(error.message || "")) {
    const fallback = await client
      .from(INTEGRATION_TABLE)
      .select(legacyIntegrationColumns)
      .eq("workspace_id", workspaceId)
      .order("provider_type", { ascending: true })
      .order("provider", { ascending: true });
    if (fallback.error) throw fallback.error;
    return fallback.data || [];
  }
  if (error) throw error;
  return data || [];
}

export async function upsertIntegrationRecord(client, workspaceId, integration) {
  const providerType = integration.providerType || integration.provider_type;
  const basePayload = {
      workspace_id: workspaceId,
      provider: integration.provider,
      provider_type: providerType,
      status: integration.status || "disconnected",
      scopes: Array.isArray(integration.scopes) ? integration.scopes : [],
      token_ref: integration.tokenRef || integration.token_ref || null,
      last_synced_at: integration.lastSyncedAt || integration.last_synced_at || null,
      next_sync_at: integration.nextSyncAt || integration.next_sync_at || integration.metadata?.nextSyncAt || null,
      last_error: integration.lastError || integration.last_error || null,
      metadata: {
        ...(integration.metadata || {}),
        nextSyncAt: integration.nextSyncAt || integration.next_sync_at || integration.metadata?.nextSyncAt || null,
      },
      updated_at: new Date().toISOString(),
    };
  const payload = {
    ...basePayload,
    auth_state: integration.authState || integration.auth_state || "not_connected",
    webhook_status: integration.webhookStatus || integration.webhook_status || "not_configured",
    sync_status: integration.syncStatus || integration.sync_status || "idle",
    refresh_token_ref: integration.refreshTokenRef || integration.refresh_token_ref || null,
    token_expires_at: integration.tokenExpiresAt || integration.token_expires_at || null,
    refresh_status: integration.refreshStatus || integration.refresh_status || "not_required",
    last_tested_at: integration.lastTestedAt || integration.last_tested_at || null,
    last_sync_result: integration.lastSyncResult || integration.last_sync_result || {},
    error_count: Number(integration.errorCount ?? integration.error_count ?? 0),
  };

  const existing = await client
    .from(INTEGRATION_TABLE)
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", integration.provider)
    .eq("provider_type", providerType)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const writeIntegration = (nextPayload) => existing.data
    ? client.from(INTEGRATION_TABLE).update(nextPayload).eq("id", existing.data.id)
    : client.from(INTEGRATION_TABLE).insert(nextPayload);

  let { data, error } = await writeIntegration(payload)
    .select(integrationColumns)
    .single();
  if (error && /column .* does not exist/i.test(error.message || "")) {
    const fallback = await writeIntegration(basePayload)
      .select(legacyIntegrationColumns)
      .single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return data;
}

export async function createIntegrationEventRecord(client, workspaceId, integration, event) {
  const integrationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(integration.id || ""))
    ? integration.id
    : null;
  const payload = {
    workspace_id: workspaceId,
    integration_id: integrationId,
    provider: integration.provider,
    event_type: event.eventType || event.type || "sync",
    status: event.status || "info",
    message: event.message || "",
    result: event.result || {},
  };
  const { data, error } = await client
    .from(INTEGRATION_EVENT_TABLE)
    .insert(payload)
    .select("id, workspace_id, integration_id, provider, event_type, status, message, result, created_at")
    .single();
  if (error) throw error;
  return data;
}

export async function loadActivityLogRecords(client, workspaceId) {
  const { data, error } = await client
    .from(ACTIVITY_TABLE)
    .select("id, workspace_id, user_id, entity_type, entity_id, action_type, before_state, after_state, source, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function createActivityLogRecord(client, workspaceId, userId, activity) {
  const { data, error } = await client
    .from(ACTIVITY_TABLE)
    .insert({
      workspace_id: workspaceId,
      user_id: userId || null,
      entity_type: activity.entityType || activity.entity_type || "workspace",
      entity_id: activity.entityId || activity.entity_id || null,
      action_type: activity.actionType || activity.action_type || "updated",
      before_state: activity.beforeState ?? activity.before_state ?? null,
      after_state: activity.afterState ?? activity.after_state ?? {},
      source: activity.source || "app",
    })
    .select("id, workspace_id, user_id, entity_type, entity_id, action_type, before_state, after_state, source, created_at")
    .single();
  if (error) throw error;
  return data;
}
