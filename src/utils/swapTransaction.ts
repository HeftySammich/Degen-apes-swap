import { TransferTransaction, AccountId, TokenId, TokenAssociateTransaction } from '@hashgraph/sdk';
import { getDAppConnector } from './walletConnect';

const OLD_TOKEN_ID = import.meta.env.VITE_OLD_TOKEN_ID;
const NEW_TOKEN_ID = import.meta.env.VITE_NEW_TOKEN_ID;
const BLACKHOLE_ACCOUNT_ID = import.meta.env.VITE_BLACKHOLE_ACCOUNT_ID;

export interface SwapResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  serialNumber?: number;
}

/**
 * Check if an account is associated with a token by querying the mirror node
 */
async function isTokenAssociated(accountId: string, tokenId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`
    );

    if (!response.ok) {
      console.error('Failed to check token association:', response.status);
      return false;
    }

    const data = await response.json();
    return data.tokens && data.tokens.length > 0;
  } catch (error) {
    console.error('Error checking token association:', error);
    return false;
  }
}

/**
 * Associate an account with a token
 * User pays the association fee (~$0.05)
 */
export async function associateToken(
  userAccountId: string,
  tokenId: string,
  signer: any
): Promise<void> {
  console.log(`Associating account ${userAccountId} with token ${tokenId}...`);

  const associateTx = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(userAccountId))
    .setTokenIds([TokenId.fromString(tokenId)]);

  const txResponse = await associateTx.executeWithSigner(signer);
  const receipt = await txResponse.getReceiptWithSigner(signer);

  if (receipt.status.toString() !== 'SUCCESS') {
    throw new Error(`Token association failed with status: ${receipt.status.toString()}`);
  }

  console.log('Token association successful!');
}

/**
 * Swap a single NFT
 * Step 0: Check if user is associated with new token, if not, throw error to trigger modal
 * Step 1: User signs and executes transaction to send old NFT to blackhole
 * Step 2: Backend verifies receipt and sends new NFT to user
 */
export const swapSingleNFT = async (
  userAccountId: string,
  serialNumber: number,
  skipAssociationCheck: boolean = false
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

    // Step 0: Check if user is associated with the new token (unless skipping)
    if (!skipAssociationCheck) {
      console.log('Checking token association for new token...');
      const isAssociated = await isTokenAssociated(userAccountId, NEW_TOKEN_ID);

      if (!isAssociated) {
        // Throw special error to trigger association modal
        throw new Error('TOKEN_NOT_ASSOCIATED');
      }

      console.log('User already associated with new token ✓');
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
 * Swap multiple NFTs in batches with progress callback
 * Hedera limit: ~10 NFT transfers per transaction to avoid throttling
 */
export const swapMultipleNFTs = async (
  userAccountId: string,
  serialNumbers: number[],
  onProgress?: (completed: number, total: number, currentSerial?: number) => void
): Promise<SwapResult[]> => {
  console.log(`Starting batch swap for ${serialNumbers.length} NFTs`);

  const BATCH_SIZE = 10; // Hedera's safe limit per transaction
  const results: SwapResult[] = [];
  const batches: number[][] = [];

  // Split into batches of 10
  for (let i = 0; i < serialNumbers.length; i += BATCH_SIZE) {
    batches.push(serialNumbers.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${batches.length} batches of up to ${BATCH_SIZE} NFTs each`);

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} NFTs`);

    // Process NFTs in current batch sequentially
    for (const serialNumber of batch) {
      const result = await swapSingleNFT(userAccountId, serialNumber);
      results.push(result);

      // Call progress callback
      if (onProgress) {
        onProgress(results.length, serialNumbers.length, serialNumber);
      }

      // If one fails, continue with others but log it
      if (!result.success) {
        console.error(`Failed to swap NFT #${serialNumber}:`, result.error);
      }

      // Small delay between individual swaps within batch
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Longer delay between batches to avoid overwhelming the network
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`Batch swap complete: ${results.filter(r => r.success).length}/${serialNumbers.length} successful`);
  return results;
};

