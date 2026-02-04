import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const { data, error } = await supabase.from('pipelines').select('*').limit(1);

if (error) {
  console.error('Error:', error);
} else {
  console.log('Pipeline count:', data?.length || 0);
  if (data && data.length > 0) {
    console.log('Sample pipeline:', JSON.stringify(data[0], null, 2));
  }
}
