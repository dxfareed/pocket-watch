
import { parseUnits, encodeFunctionData } from 'viem';
import type { Address } from 'viem';

const USDC_CONTRACT_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as const;

const minimalUsdcAbi = [
  {
    "inputs": [
      { "name": "to", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
] as const;

export function createUsdcTipTransaction(recipientAddress: Address, amountInUsd: string) {
  if (!recipientAddress || !amountInUsd) {
    return null;
  }

  const amount = parseUnits(amountInUsd, 6);

  const data = encodeFunctionData({
    abi: minimalUsdcAbi,
    functionName: 'transfer',
    args: [recipientAddress, amount]
  });

  return [{
    to: USDC_CONTRACT_ADDRESS,
    // @ts-expect-error viem currently expects `value` to be a number, but USDC transfers should have a value of 0
    value: 0n,
    data: data,
  }] as const;
}