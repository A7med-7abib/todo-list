const SUPABASE_URL = "https://taqxiivbyntqdfzcsuiz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_RTTdukXp6EQBXHVBKOIFow_FDYWjoOE";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper functions for database operations
async function fetchDeliveries() {
  const { data, error } = await supabaseClient
    .from('deliveries')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error fetching from Supabase:', error);
    return null;
  }
  return data;
}

async function insertDelivery(delivery) {
  console.log('Attempting to insert delivery:', JSON.stringify(delivery, null, 2));
  const { data, error } = await supabaseClient
    .from('deliveries')
    .insert([delivery])
    .select();
    
  if (error) {
    console.error('Error inserting to Supabase:', JSON.stringify(error, null, 2));
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', error.details);
    console.error('Error hint:', error.hint);
    alert('Supabase Error: ' + error.message + '\nCode: ' + error.code + '\nHint: ' + (error.hint || 'none'));
    return null;
  }
  console.log('Insert successful:', data);
  return data ? data[0] : null;
}

async function updateDelivery(id, updates) {
  const { data, error } = await supabaseClient
    .from('deliveries')
    .update(updates)
    .eq('id', id);
    
  if (error) {
    console.error('Error updating Supabase:', error);
    return false;
  }
  return true;
}

async function deleteDeliveryDb(id) {
  const { error } = await supabaseClient
    .from('deliveries')
    .delete()
    .eq('id', id);
    
  if (error) {
    console.error('Error deleting from Supabase:', error);
    return false;
  }
  return true;
}