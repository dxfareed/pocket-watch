import { NextRequest, NextResponse } from 'next/server';
import { fetcUsers } from '@/app/utils/user-check.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getAndCacheUser(username: string) {
  const { data: cachedUser } = await supabase
    .from('users')
    .select('*')
    .eq('username', username.toLowerCase())
    .single();

  if (cachedUser) {
    console.log(`CACHE HIT for user: ${username}`);
    return cachedUser;
  }
  console.log(`CACHE MISS for user: ${username}`);
  const neynarUser = await fetcUsers(username);

  const primaryAddress = neynarUser.verified_addresses?.primary?.eth_address
  
  console.log(`[getAndCacheUser] Selected primary address for ${username}: ${primaryAddress}`);

  if (!primaryAddress) {
    throw new Error(`User '${username}' has no primary, custody, or verified address.`);
  }

  const userDataToCache = {
    username: neynarUser.username.toLowerCase(),
    fid: neynarUser.fid,
    display_name: neynarUser.display_name,
    pfp_url: neynarUser.pfp_url,
    wallet_address: primaryAddress,
    last_updated_at: new Date().toISOString(),
  };

  const { data: upsertedUser, error } = await supabase
    .from('users')
    .upsert(userDataToCache, { onConflict: 'username' })
    .select()
    .single();
  
  if (error) {
    console.error("Supabase upsert error:", error);
    return { id: null, ...userDataToCache };
  }
  
  return upsertedUser;
}

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
  const searcherUsername = searchParams.get('searcherUsername');

  if (!username) {
    return NextResponse.json(
      { error: 'username is required' },
      { status: 400, headers: corsHeaders() },
    );
  }

  try {
    const searchedUser = await getAndCacheUser(username);
    
    if (searcherUsername) {
      const searcherUser = await getAndCacheUser(searcherUsername);
      
      if (searcherUser?.id && searchedUser?.id) {
        // Log the search event in the background
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

    const neynarLikeResponse = {
        fid: searchedUser.fid,
        username: searchedUser.username,
        display_name: searchedUser.display_name,
        pfp: { url: searchedUser.pfp_url },
        custody_address: searchedUser.wallet_address,
        verified_addresses: {
            primary: {
                eth_address: searchedUser.wallet_address
            },
            eth_addresses: [searchedUser.wallet_address] 
        }
    };
    
    return NextResponse.json({ user: neynarLikeResponse }, { status: 200, headers: corsHeaders() });

  } catch (error: unknown) {
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