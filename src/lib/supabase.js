import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zbbusjcdfczaywhnfhos.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiYnVzamNkZmN6YXl3aG5maG9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzUxNjksImV4cCI6MjA5NzcxMTE2OX0.tfsd4cMShxMonFYBQMweIIQeNq6SKnRwwacS8TyRL7I'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
