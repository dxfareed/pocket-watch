import { NextRequest, NextResponse } from 'next/server';
import { fetcUsers } from '@/app/utils/user-check.js';
import { createClient } from '@supabase/supabase-js';

// 1. INITIALIZE THE SUPABASE CLIENT
// These must match the names in your .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);


// 2. CREATE A HELPER FUNCTION FOR CACHING
/**
 * Gets a user from the database cache. If not present, fetches from Neynar,
 * caches the result, and then returns it.
 * @param {string} username - The Farcaster username to look up.
 * @returns {Promise<object>} The user record from the database.
 */
async function getAndCacheUser(username: string) {
  // Check the database first (case-insensitive)
  const { data: cachedUser } = await supabase
    .from('users')
    .select('*')
    .eq('username', username.toLowerCase())
    .single();

  if (cachedUser) {
    // You could add TTL (Time-To-Live) logic here later if needed
    console.log(`CACHE HIT for user: ${username}`);
    return cachedUser;
  }

  // If not in cache, fetch from Neynar
  console.log(`CACHE MISS for user: ${username}`);
  const neynarUser = await fetcUsers(username);

  // Prepare the data for our database schema
  const userDataToCache = {
    username: neynarUser.username.toLowerCase(),
    fid: neynarUser.fid,
    display_name: neynarUser.display_name,
    pfp_url: neynarUser.pfp_url,
    // The Neynar client returns multiple addresses, we'll take the first as primary
    wallet_address: neynarUser.verified_addresses.eth_addresses[0],
    last_updated_at: new Date().toISOString(),
  };

  // Save the new user data to our database and return the new record
  const { data: upsertedUser, error } = await supabase
    .from('users')
    .upsert(userDataToCache, { onConflict: 'username' })
    .select()
    .single();
  
  if (error) {
    console.error("Supabase upsert error:", error);
    // If caching fails, return a structure that includes a null ID but still has the data
    return { id: null, ...userDataToCache };
  }
  
  return upsertedUser;
}

// (The corsHeaders and OPTIONS functions remain unchanged)
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  } as Record<string, string>;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(),
  });
}


export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  // 3. GET THE NEW `searcherUsername` PARAMETER
  const searcherUsername = searchParams.get('searcherUsername');

  if (!username) {
    return NextResponse.json(
      { error: 'username is required' },
      { status: 400, headers: corsHeaders() },
    );
  }

  try {
    // 4. USE THE HELPER TO GET THE SEARCHED USER
    const searchedUser = await getAndCacheUser(username);
    
    // 5. IF A SEARCHER EXISTS, LOG THE EVENT
    if (searcherUsername) {
      // Use the same helper to ensure the searcher is also in our database
      const searcherUser = await getAndCacheUser(searcherUsername);
      
      // Call our custom database function to log the search
      if (searcherUser?.id && searchedUser?.id) {
        // We call this without `await` to let it run in the background
        // so it doesn't slow down the response to the user.
        supabase.rpc('log_search_event', {
          searcher_id: searcherUser.id,
          searched_id: searchedUser.id,
        }).then(({ error }) => {
          if (error) {
            console.error('Failed to log search via RPC:', error);
          } else {
            console.log(`Logged/Updated search: ${searcherUser.username} -> ${searchedUser.username}`);
          }
        });
      }
    }

    // 6. SHAPE THE RESPONSE to match what the frontend expects
    const neynarLikeResponse = {
        fid: searchedUser.fid,
        username: searchedUser.username,
        display_name: searchedUser.display_name,
        // The property from Neynar is `pfp_url` but our cached version is `pfp_url`
        pfp: { url: searchedUser.pfp_url },
        verified_addresses: {
            primary: {
                eth_address: searchedUser.wallet_address
            },
            // Add the array format for consistency with the original Neynar response
            eth_addresses: [searchedUser.wallet_address]
        }
    };
    
    return NextResponse.json({ user: neynarLikeResponse }, { status: 200, headers: corsHeaders() });

  } catch (error: unknown) {
    // This error handling logic remains the same and is correct
    console.error(`Error fetching user '${username}':`, error);
    if (error instanceof Error && error.message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const message = (error as Error)?.message || 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders() },
    );
  }
}