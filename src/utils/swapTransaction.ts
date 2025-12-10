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

export interface BatchSwapResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  serialNumbers: number[];
  successfulSerials?: number[];
  failedSerials?: number[];
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
 * Swap a batch of NFTs in a SINGLE transaction
 * User signs ONCE to transfer multiple NFTs (up to 10) to blackhole
 */
export const swapBatchNFTs = async (
  userAccountId: string,
  serialNumbers: number[]
): Promise<BatchSwapResult> => {
  try {
    console.log(`Starting batch swap for ${serialNumbers.length} NFTs in single transaction`);

    const dAppConnector = getDAppConnector();
    if (!dAppConnector) {
      throw new Error('Wallet not connected');
    }

    // Get the signer for the user's account
    const signer = dAppConnector.getSigner(AccountId.fromString(userAccountId));
    if (!signer) {
      throw new Error('No signer available');
    }

    // Check token association (only need to check once for the batch)
    console.log('Checking token association for new token...');
    const isAssociated = await isTokenAssociated(userAccountId, NEW_TOKEN_ID);

    if (!isAssociated) {
      throw new Error('TOKEN_NOT_ASSOCIATED');
    }

    console.log('User already associated with new token ✓');
    console.log('Creating batched transfer transaction...');

    // Create a SINGLE transaction with MULTIPLE NFT transfers
    let transaction = new TransferTransaction();

    // Add all NFT transfers to the same transaction
    for (const serialNumber of serialNumbers) {
      transaction = transaction.addNftTransfer(
        TokenId.fromString(OLD_TOKEN_ID),
        serialNumber,
        AccountId.fromString(userAccountId),
        AccountId.fromString(BLACKHOLE_ACCOUNT_ID)
      );
    }

    // Set memo with all serial numbers
    transaction = transaction.setTransactionMemo(
      `Batch swap: ${serialNumbers.join(', ')}`
    );

    console.log('Batched transaction created, requesting signature from wallet...');

    // Execute transaction through the signer (wallet will sign ONCE for all NFTs)
    const txResponse = await transaction.executeWithSigner(signer);

    console.log('Transaction submitted, waiting for receipt...');

    // Get the receipt
    const receipt = await txResponse.getReceiptWithSigner(signer);

    console.log('Transaction receipt:', receipt.status.toString());

    if (receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`Transaction failed with status: ${receipt.status.toString()}`);
    }

    const transactionId = txResponse.transactionId.toString();
    console.log('Batch of old NFTs transferred successfully:', transactionId);

    // Now call backend to send all new NFTs in one batch
    console.log('Calling backend to send batch of new NFTs...');

    const response = await fetch('/api/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldNftTransactionId: transactionId,
        userAccountId,
        serialNumbers, // Send array of serial numbers
        isBatch: true,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Backend batch swap failed');
    }

    const result = await response.json();
    console.log('Batch swap completed successfully:', result);

    return {
      success: true,
      transactionId: result.transactionId,
      serialNumbers,
      successfulSerials: serialNumbers,
    };
  } catch (error) {
    console.error('Batch swap failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      serialNumbers,
      failedSerials: serialNumbers,
    };
  }
};

/**
 * Swap multiple NFTs in batches with progress callback
 * Hedera limit: ~10 NFT transfers per transaction to avoid throttling
 * NOW USES TRUE BATCHING: 1 signature per 10 NFTs instead of 10 signatures
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

  // Process each batch as a SINGLE transaction
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} NFTs`);

    // Swap entire batch in ONE transaction
    const batchResult = await swapBatchNFTs(userAccountId, batch);

    // Convert batch result to individual results for compatibility
    if (batchResult.success) {
      for (const serialNumber of batch) {
        results.push({
          success: true,
          transactionId: batchResult.transactionId,
          serialNumber,
        });

        // Call progress callback
        if (onProgress) {
          onProgress(results.length, serialNumbers.length, serialNumber);
        }
      }
    } else {
      // If batch failed, mark all as failed
      for (const serialNumber of batch) {
        results.push({
          success: false,
          error: batchResult.error,
          serialNumber,
        });

        // Call progress callback
        if (onProgress) {
          onProgress(results.length, serialNumbers.length, serialNumber);
        }
      }
    }

    // Delay between batches to avoid overwhelming the network
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`Batch swap complete: ${results.filter(r => r.success).length}/${serialNumbers.length} successful`);
  return results;
};

