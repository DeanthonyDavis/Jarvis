const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const STATE_TABLE = "apex_user_state";
const WORKSPACE_TABLE = "apex_workspaces";
const NOTIFICATION_TABLE = "apex_notifications";
const UPLOAD_TABLE = "apex_uploads";

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
