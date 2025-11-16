// Stub types for Supabase edge functions that import from a URL.
// This is only to keep Next/TypeScript happy during build.

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  // If you have @supabase/supabase-js installed, you *could*
  // re-export its types. To keep it simple and robust, we
  // just declare everything as `any` here.
  export const createClient: any;
  const _default: any;
  export default _default;
}

// Deno global used in Edge Functions
declare const Deno: any;
