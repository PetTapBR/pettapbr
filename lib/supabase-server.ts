import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseServerClient() {
  return Boolean(supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey));
}

export function createSupabaseServerClient() {
  if (!supabaseUrl || (!supabaseServiceRoleKey && !supabaseAnonKey)) {
    throw new Error(
      "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY) para integrar o backend.",
    );
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey ?? supabaseAnonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
