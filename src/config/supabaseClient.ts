import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Ensure environment variables are loaded even when this module is imported before index.ts runs dotenv.config()
dotenv.config();

export interface ISupabaseClient {
  from: SupabaseClient["from"];
  rpc: SupabaseClient["rpc"];
}

export const createSupabaseClient = (): ISupabaseClient => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase credentials missing (SUPABASE_URL / SUPABASE_SERVICE_KEY)",
    );
  }

  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
};
