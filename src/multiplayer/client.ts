/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const IS_MP_ENABLED = Boolean(url && key);

export const supabase: SupabaseClient = IS_MP_ENABLED
  ? createClient(url!, key!)
  : (null as unknown as SupabaseClient);
