"use client";

import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Transaction, TransactionButton, TransactionResponse } from "@coinbase/onchainkit/transaction";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import type { Address, Hex } from 'viem';
import { createUsdcTipTransaction } from "../../lib/transactions";
import { Button } from "../components/DemoComponents";
import { Icon } from "../components/DemoComponents";
import Image from "next/image";

type Call = {
  to: Address;
  value: bigint;
  data: Hex;
};

type TipTransactionCalls = readonly [Call] | null;

interface TokenData {
  totalPortfolioValueUsd: number;
  nativeToken: {
    name: string;
    symbol: string;
    balance: number;
    priceUsd: number;
    valueUsd: number;
  };
  pricedErc20Tokens: Array<{
    name: string;
    symbol: string;
    balance: number;
    priceUsd: number;
    valueUsd: number;
  }>;
  unpricedErc20Tokens: Array<{
    name: string;
    symbol: string;
    balance: number;
  }>;
}

export default function RaftPage() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("slokh");
  const [searchedUsername, setSearchedUsername] = useState("");
  const [showAllPriced, setShowAllPriced] = useState(false);
  const [showAllUnpriced, setShowAllUnpriced] = useState(false);
  const [showSpam, setShowSpam] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const { isConnected } = useAccount();
  const recipientAddress = process.env.NEXT_PUBLIC_TIP_ADDRESS as `0x${string}`;


  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  const fetchTokenData = useCallback(async () => {
    if (!username) {
      setError("Please enter a username.");
      return;
    }
    setLoading(true);
    setError(null);
    setTokenData(null);
    setSearchedUsername(username);

    try {
      const userResponse = await fetch(`/api/user?username=${username}`);
       if (!userResponse.ok) {
      if (userResponse.status === 500) {
        throw new Error("Hit rate limit. Please try again in a moment.");
      }

      throw new Error(`Could not find user '${username}'. Please check the username and try again.`);
    }
      const userData = await userResponse.json();
      const address = userData.user?.verified_addresses?.primary?.eth_address;

      if (!address) {
        throw new Error(`User '${username}' does not have a warplet account yet.`);
      }

      const balanceResponse = await fetch(`/api/balL2?address=${address}`);
      if (!balanceResponse.ok) {
        console.log(error)
         if (balanceResponse.status === 500) {
        throw new Error("Hit rate limit. Please try again in a moment.");
      }
        throw new Error(`Failed to fetch token balance: ${balanceResponse.status}`);
      }
      const data = await balanceResponse.json();
      console.log(data);
      setTokenData(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (username) {
      fetchTokenData();
    }
  }, []);

  const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  const formatNumber = (value: number) => {
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
    if (value >= 1_000) return (value / 1_000).toFixed(2) + 'K';
    return value.toFixed(4);
  };

  const pricedSubtotal = useMemo(() => {
    if (!tokenData) return 0;
    return tokenData.pricedErc20Tokens.reduce((sum, t) => sum + t.valueUsd, 0);
  }, [tokenData]);

  const tipTransaction = useMemo((): TipTransactionCalls => {
    return createUsdcTipTransaction(recipientAddress, '1');
  }, [recipientAddress]);


  const controls = (
    <div className="pt-2">
      {isConnected && recipientAddress && tipTransaction ? (
        <Transaction
          // @ts-expect-error: tipTransaction is correctly typed
          calls={tipTransaction}
          onSuccess={(response: TransactionResponse) => alert(`Tip sent! Tx: ${response.transactionReceipts[0].transactionHash}`)}
        >
          <TransactionButton
            text={
              <div className="flex items-center justify-center">
                <Icon name="heart" size="sm" />
                <span className="ml-2">tip me</span>
              </div>
            }

            className="w-1/2 mx-auto block !bg-farcaster-purple text-white hover:!bg-farcaster-purple/90"
          />
        </Transaction>
      ) : (
        <Button
          disabled
          className="w-1/2 mx-auto block"
          size="md"
          icon={<Icon name="heart" size="sm" />}
        >
          {recipientAddress ? "Connect Wallet to Tip" : "Tip Address Not Configured"}
        </Button>
      )}
    </div>
  );


  return (
    <div className="flex flex-col min-h-screen font-sans text-[var(--app-foreground)] mini-app-theme from-[var(--app-background)] to-[var(--app-gray)]">
      <div className="w-full max-w-md mx-auto px-4 py-3">
        <header className="flex justify-between items-center mb-3 h-11">
          <div>
          </div>
        </header>

        <main className="flex-1">
          <div className="space-y-4">
            <div className="text-center py-4">
              <Image
                src="/info-name.png"
                alt="Pocket Watch"
                width={300}
                height={190}
                className="mx-auto"
              />
              <p className="text-farcaster-purple text-sm mt-2 font-semibold">
                i luv 2 pocket watch
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Farcaster Username:</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm"
                placeholder="(e.g. dwr.eth)"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={fetchTokenData}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "Loading..." : "Search"}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setUsername("")}
                  className="w-full"
                >
                  Clear
                </Button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-red-700 text-sm">
                  <strong>Error:</strong> {error}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex justify-center items-center p-4">
                <img
                  src='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40" stroke="%230052FF"><g fill="none" fill-rule="evenodd"><g transform="translate(2 2)" stroke-width="4"><circle stroke-opacity=".5" cx="18" cy="18" r="18"/><path d="M36 18c0-9.94-8.06-18-18-18"><animateTransform attributeName="transform" type="rotate" from="0 18 18" to="360 18 18" dur="1s" repeatCount="indefinite"/></path></g></g></svg>'
                  alt="Loading..."
                  className="w-10 h-10"
                />
              </div>
            )}

            {tokenData && !loading && (
              <div>
                <div className="bg-white rounded-lg shadow-lg p-4 border-2 border-gray-200" ref={receiptRef}>
                  <div className="font-mono">
                    <div className="text-center border-b-2 border-dashed border-gray-300 pb-3 mb-4">
                      <div className="text-lg font-extrabold tracking-widest">@{searchedUsername}</div>
                      <div className="text-xs text-gray-500 mt-1">{new Date().toLocaleString()}</div>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Value</span>
                        <span className="font-bold">{formatCurrency(tokenData.totalPortfolioValueUsd)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Priced Tokens ({tokenData.pricedErc20Tokens.length})</span>
                        <span>{formatCurrency(pricedSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Unpriced Tokens ({tokenData.unpricedErc20Tokens.length})</span>
                        <span>—</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-300 pt-3 mt-2 mb-2">
                      <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Native</div>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold">{tokenData.nativeToken.name}</div>
                          <div className="text-[11px] text-gray-500">{tokenData.nativeToken.symbol}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{formatNumber(tokenData.nativeToken.balance)}</div>
                          <div className="text-[11px] text-gray-500">{formatCurrency(tokenData.nativeToken.valueUsd)}</div>
                        </div>
                      </div>
                    </div>

                    {tokenData.pricedErc20Tokens.length > 0 && (
                      <div className="border-t border-dashed border-gray-300 pt-3 mt-2">
                        <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">VERIFIED TOKEN(S)</div>
                        <div className={'space-y-1 max-h-96 overflow-y-auto'}>
                          {(showAllPriced ? tokenData.pricedErc20Tokens : tokenData.pricedErc20Tokens.slice(0, 15))
                            .sort((a, b) => b.valueUsd - a.valueUsd)
                            .map((token, idx) => (
                              <div key={idx} className="flex justify-between items-center">
                                <div className="min-w-0">
                                  <div className={"font-semibold truncate"}>{token.name}</div>
                                  <div className="text-[11px] text-gray-500">{token.symbol}</div>
                                </div>
                                <div className="text-right ml-2">
                                  <div className="font-semibold">{formatNumber(token.balance)}</div>
                                  <div className="text-[11px] text-gray-500">{formatCurrency(token.valueUsd)}</div>
                                </div>
                              </div>
                            ))}
                          {tokenData.pricedErc20Tokens.length > 15 && (
                            <div className="pt-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs w-full"
                                onClick={() => setShowAllPriced(!showAllPriced)}
                              >
                                {showAllPriced ? 'Show less' : `Show ${tokenData.pricedErc20Tokens.length - 15} more`}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {tokenData.unpricedErc20Tokens.length > 0 && (
                      <div className="border-t border-dashed border-gray-300 pt-3 mt-2">
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-[11px] uppercase tracking-widest text-gray-500">SPAM TOKEN(S)</div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setShowSpam(!showSpam)}
                          >
                            {showSpam ? 'Hide' : 'View'}
                          </Button>
                        </div>
                        {showSpam && (
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {(showAllUnpriced ? tokenData.unpricedErc20Tokens : tokenData.unpricedErc20Tokens.slice(0, 20))
                              .sort((a, b) => b.balance - a.balance)
                              .map((token, idx) => (
                                <div key={idx} className="flex justify-between items-center">
                                  <div className="min-w-0">
                                    <div className="font-semibold truncate">{token.name}</div>
                                    <div className="text-[11px] text-gray-500">{token.symbol}</div>
                                  </div>
                                  <div className="text-right ml-2">
                                    <div className="font-semibold">{formatNumber(token.balance)}</div>
                                    <div className="text-[11px] text-gray-400">No price</div>
                                  </div>
                                </div>
                              ))}
                            {tokenData.unpricedErc20Tokens.length > 20 && (
                              <div className="pt-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs w-full"
                                  onClick={() => setShowAllUnpriced(!showAllUnpriced)}
                                >
                                  {showAllUnpriced ? 'Show less' : `Show ${tokenData.unpricedErc20Tokens.length - 20} more`}
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-center border-t-2 border-dashed border-gray-300 pt-3 mt-4 space-y-1">
                      <div className="text-xs text-gray-500">Thank you for using Pocket Watch! ;)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          <div className="pt-2">{controls}</div>
            
          </div>
        </main>

        <footer className="mt-2 pt-4 flex justify-center">
          <p className="text-[var(--ock-text-foreground-muted)] text-xs">
            made with minikit by dxfareed
          </p>
        </footer>
      </div>
    </div>
  );
}