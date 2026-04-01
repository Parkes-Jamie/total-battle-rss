import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tlnzpbaxcgcgahuwuylx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsbnpwYmF4Y2djZ2FodXd1eWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTgxMzcsImV4cCI6MjA5MDYzNDEzN30.NkuCgJMPUoAK4nbxpHotOxT3Mu1wDAazh4KZDo9-IL0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
