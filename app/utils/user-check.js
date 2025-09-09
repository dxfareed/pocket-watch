const NEYNAR_API_KEYS = [
  process.env.NEYNAR_API_KEY,
  process.env.NEYNAR_BACKUP_1,
].filter(Boolean);


export async function fetcUsers(username) {
  if (!username || typeof username !== 'string') {
    throw new Error('Username is required');
  }

  if (!NEYNAR_API_KEYS.length) {
    throw new Error('Missing NEYNAR_API_KEY environment variable');
  }

  const neynarUrl = `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(
    username,
  )}`;

  let lastError;

  for (const apiKey of NEYNAR_API_KEYS) {
    try {
      const response = await fetch(neynarUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
          'x-neynar-experimental': 'false',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (!data || !data.user) {
          throw new Error('User not found.');
        }
        return data.user;
      }

      if (response.status === 429 || response.status === 401) {
        lastError = new Error(
          `Neynar responded with ${response.status}. Trying next API key...`,
        );
        continue;
      }

      const text = await response.text().catch(() => '');
      throw new Error(`Neynar error ${response.status}: ${text || 'Unknown error'}`);
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error('All Neynar API keys failed');
}

export default fetcUsers;
