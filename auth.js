const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const STATE_TABLE = "apex_user_state";

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
