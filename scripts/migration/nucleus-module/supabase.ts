// The ported logic imports its database client from './supabase'. In the old tool that file created its own client from
// VITE_ environment variables. In Nucleus the one shared, generated client is used instead, so the signed-in user's
// session (and therefore the row-level security rules) applies to every query the module makes.
export { supabase } from "@/integrations/supabase/client";
