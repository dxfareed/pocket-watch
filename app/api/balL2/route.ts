export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Utils } from 'alchemy-sdk';

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string | null;
}

interface AlchemyTokenMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
}

interface PricedToken {
  name: string;
  symbol: string;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  address: string;
}

interface UnpricedToken {
  name: string;
  symbol: string;
  balance: number;
  address: string;
}


const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_RPC = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;

const NATIVE_TOKEN_PRICE_ADDRESS = '0x4200000000000000000000000000000000000006';
const MINIMUM_LIQUIDITY_USD = 1000;

async function rpc(method: string, params: (string | object)[]): Promise<unknown> {
  const res = await fetch(ALCHEMY_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    referrerPolicy: 'no-referrer',
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (!res.ok) {
    throw new Error(`RPC ${method} failed with status ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`RPC ${method} error: ${JSON.stringify(data.error)}`);
  }
  return data.result;
}

async function getPricesFromDexScreener(tokenAddresses: string[]) {
  const allPrices = new Map<string, { priceUsd: number; liquidity: number }>();
  if (tokenAddresses.length === 0) return allPrices;
  const CHUNK_SIZE = 30;
  const unique = Array.from(new Set(tokenAddresses.map((a) => a.toLowerCase())));
  const promises = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const apiUrl = `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`;
    promises.push(fetch(apiUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  const results = await Promise.all(promises);
  for (const result of results) {
    if (result?.pairs) {
      for (const pair of result.pairs) {
        const tokenAddress = pair.baseToken?.address?.toLowerCase();
        if (!tokenAddress) continue; 

        const liquidity = pair.liquidity?.usd || 0;
        const priceUsd = Number(pair.priceUsd) || 0;
        const prev = allPrices.get(tokenAddress);
        if (!prev || liquidity > (prev.liquidity || 0)) {
          allPrices.set(tokenAddress, { priceUsd, liquidity });
        }
      }
    }
  }
  return allPrices;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');

  if (!ALCHEMY_API_KEY) {
    return NextResponse.json({ error: 'Missing ALCHEMY_API_KEY' }, { status: 500, headers: corsHeaders() });
  }
  if (!address) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400, headers: corsHeaders() });
  }

  try {
    
    const pricedErc20Tokens: PricedToken[] = [];
    const unpricedErc20Tokens: UnpricedToken[] = [];
    let totalPortfolioValueUsd = 0;

    const nativeBalanceHex = await rpc('eth_getBalance', [address, 'latest']) as string;
    const nativeBalanceEth = Number(Utils.formatEther(BigInt(nativeBalanceHex)));

    const tokenBalancesRes = await rpc('alchemy_getTokenBalances', [address, 'erc20']) as { tokenBalances: AlchemyTokenBalance[] };
    const tokenBalances = tokenBalancesRes?.tokenBalances || [];

    const KNOWN_TOKEN_ADDRESSES = [
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base
    ];

    const tokenMap = new Map<string, AlchemyTokenBalance>();
    tokenBalances.forEach((t) => tokenMap.set(t.contractAddress.toLowerCase(), t));

    KNOWN_TOKEN_ADDRESSES.forEach((addr) => {
      const lowerAddr = addr.toLowerCase();
      if (!tokenMap.has(lowerAddr)) {
        tokenMap.set(lowerAddr, { contractAddress: addr, tokenBalance: '0x0' });
      }
    });

    const allTokens = Array.from(tokenMap.values());

    try {
      const usdcAddress = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
      const balanceOfData = '0x70a08231' + address.substring(2).padStart(64, '0');
      const usdcBalanceHex = await rpc('eth_call', [{ to: usdcAddress, data: balanceOfData }, 'latest']) as string;
      
      const usdcToken = allTokens.find(t => t.contractAddress.toLowerCase() === usdcAddress);
      if (usdcToken && usdcBalanceHex && usdcBalanceHex !== '0x') {
        usdcToken.tokenBalance = usdcBalanceHex;
      }
    } catch (e) {
      console.error("Direct USDC balance check failed:", e);
    }

    const allTokenAddresses = allTokens.map((t) => t.contractAddress);
    allTokenAddresses.push(NATIVE_TOKEN_PRICE_ADDRESS);
    const prices = await getPricesFromDexScreener(allTokenAddresses);

    const nativePriceData = prices.get(NATIVE_TOKEN_PRICE_ADDRESS.toLowerCase());
    const nativePriceUsd = nativePriceData?.priceUsd || 0;
    const nativeValueUsd = nativeBalanceEth * nativePriceUsd;
    totalPortfolioValueUsd += nativeValueUsd;

    const metadataResults = await Promise.all(
      allTokens.map((t) => rpc('alchemy_getTokenMetadata', [t.contractAddress]).catch(() => null)),
    ) as (AlchemyTokenMetadata | null)[];

    for (let i = 0; i < allTokens.length; i++) {
      const token = allTokens[i];
      const metadata = metadataResults[i];

      const name = metadata?.name || 'Unknown Token';
      const symbol = metadata?.symbol || token.contractAddress.slice(0, 6);
      const decimals = typeof metadata?.decimals === 'number' ? metadata.decimals : 18;

      const raw = (token.tokenBalance || '0').toString();
      let balance = 0;
      try {
        const value = raw.startsWith('0x') ? BigInt(raw) : BigInt(raw);
        balance = Number(Utils.formatUnits(value, decimals));
      } catch {}

      let priceData = prices.get(token.contractAddress.toLowerCase());
      const isKnownToken = KNOWN_TOKEN_ADDRESSES.includes(token.contractAddress.toLowerCase());

      if (isKnownToken && !priceData) {
        priceData = { priceUsd: 1.00, liquidity: 1_000_000_000 };
      }

      if (priceData && (priceData.liquidity > MINIMUM_LIQUIDITY_USD || isKnownToken)) {
        const valueUsd = balance * (priceData.priceUsd || 0);
        if (balance > 0) {
          pricedErc20Tokens.push({
            name,
            symbol,
            balance,
            priceUsd: priceData.priceUsd || 0,
            valueUsd,
            address: token.contractAddress,
          });
          totalPortfolioValueUsd += valueUsd;
        }
      } else {
        if (balance > 0) {
          unpricedErc20Tokens.push({
            name,
            symbol,
            balance,
            address: token.contractAddress,
          });
        }
      }
    }

    pricedErc20Tokens.sort((a, b) => b.valueUsd - a.valueUsd);

    const nativeToken = {
      name: 'Ethereum',
      symbol: 'ETH',
      balance: nativeBalanceEth,
      priceUsd: nativePriceUsd,
      valueUsd: nativeValueUsd,
    };

    return NextResponse.json(
      { totalPortfolioValueUsd, nativeToken, pricedErc20Tokens, unpricedErc20Tokens },
      { status: 200, headers: corsHeaders() },
    );
  } catch (error) {
    console.error('A critical error occurred:', error);
    return NextResponse.json({ error: 'An internal error occurred' }, { status: 500, headers: corsHeaders() });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}