import { TransferTransaction, AccountId, TokenId } from '@hashgraph/sdk';
import { getDAppConnector } from './walletConnect';

const OLD_TOKEN_ID = import.meta.env.VITE_OLD_TOKEN_ID;
const BLACKHOLE_ACCOUNT_ID = import.meta.env.VITE_BLACKHOLE_ACCOUNT_ID;

export interface SwapResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  serialNumber?: number;
}

/**
 * Swap a single NFT
 * Step 1: User signs and executes transaction to send old NFT to blackhole
 * Step 2: Backend verifies receipt and sends new NFT to user
 */
export const swapSingleNFT = async (
  userAccountId: string,
  serialNumber: number
): Promise<SwapResult> => {
  try {
    console.log(`Starting swap for NFT #${serialNumber}`);

    const dAppConnector = getDAppConnector();
    if (!dAppConnector) {
      throw new Error('Wallet not connected');
    }

    // Get the signer for the user's account
    const signer = dAppConnector.getSigner(AccountId.fromString(userAccountId));
    if (!signer) {
      throw new Error('No signer available');
    }

    console.log('Creating transfer transaction...');

    // Create transfer transaction: Send old NFT to blackhole
    const transaction = await new TransferTransaction()
      .addNftTransfer(
        TokenId.fromString(OLD_TOKEN_ID),
        serialNumber,
        AccountId.fromString(userAccountId),
        AccountId.fromString(BLACKHOLE_ACCOUNT_ID)
      )
      .setTransactionMemo(`Swap Degen Ape #${serialNumber}`);

    console.log('Transaction created, requesting signature and execution from wallet...');

    // Execute transaction through the signer (wallet will sign and submit)
    const txResponse = await transaction.executeWithSigner(signer);

    console.log('Transaction submitted, waiting for receipt...');

    // Get the receipt
    const receipt = await txResponse.getReceiptWithSigner(signer);

    console.log('Transaction receipt:', receipt.status.toString());

    if (receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`Transaction failed with status: ${receipt.status.toString()}`);
    }

    const transactionId = txResponse.transactionId.toString();
    console.log('Old NFT transferred successfully:', transactionId);

    // Now call backend to send new NFT
    console.log('Calling backend to send new NFT...');

    const response = await fetch('/api/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldNftTransactionId: transactionId,
        userAccountId,
        serialNumber,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Backend swap failed');
    }

    const result = await response.json();
    console.log('Swap completed successfully:', result);

    return {
      success: true,
      transactionId: result.transactionId,
      serialNumber,
    };
  } catch (error) {
    console.error('Swap failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      serialNumber,
    };
  }
};

/**
 * Swap multiple NFTs in sequence
 */
export const swapMultipleNFTs = async (
  userAccountId: string,
  serialNumbers: number[]
): Promise<SwapResult[]> => {
  console.log(`Starting mass swap for ${serialNumbers.length} NFTs`);
  
  const results: SwapResult[] = [];
  
  for (const serialNumber of serialNumbers) {
    const result = await swapSingleNFT(userAccountId, serialNumber);
    results.push(result);
    
    // If one fails, continue with others but log it
    if (!result.success) {
      console.error(`Failed to swap NFT #${serialNumber}:`, result.error);
    }
    
    // Small delay between swaps to avoid overwhelming the network
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
};

