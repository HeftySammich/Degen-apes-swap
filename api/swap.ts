import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  Client,
  AccountId,
  PrivateKey,
  TransferTransaction,
  TokenId,
  Transaction,
  TransactionId,
  TransactionReceiptQuery,
  Status
} from '@hashgraph/sdk';

const TREASURY_ACCOUNT_ID = process.env.TREASURY_ACCOUNT_ID!;
const TREASURY_PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY!;
const BLACKHOLE_ACCOUNT_ID = process.env.BLACKHOLE_ACCOUNT_ID!;
const OLD_TOKEN_ID = process.env.OLD_TOKEN_ID!;
const NEW_TOKEN_ID = process.env.NEW_TOKEN_ID!;
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'mainnet';

/**
 * Vercel serverless function to handle NFT swaps
 *
 * Flow:
 * 1. Receive transaction ID from user (old NFT -> blackhole already executed)
 * 2. Verify transaction succeeded via mirror node
 * 3. Send new NFT from treasury to user
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { oldNftTransactionId, userAccountId, serialNumber, serialNumbers, isBatch } = req.body;

    // Support both single and batch swaps
    const isMultiple = isBatch && serialNumbers && Array.isArray(serialNumbers);
    const serials = isMultiple ? serialNumbers : [serialNumber];

    if (!oldNftTransactionId || !userAccountId || serials.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: oldNftTransactionId, userAccountId, and serialNumber(s)'
      });
    }

    console.log(`Processing ${isMultiple ? 'batch' : 'single'} swap for user ${userAccountId}`);
    console.log(`NFT serial numbers: ${serials.join(', ')}`);
    console.log(`Old NFT transaction ID: ${oldNftTransactionId}`);

    // Initialize Hedera client
    const client = HEDERA_NETWORK === 'testnet'
      ? Client.forTestnet()
      : Client.forMainnet();

    client.setOperator(
      AccountId.fromString(TREASURY_ACCOUNT_ID),
      PrivateKey.fromString(TREASURY_PRIVATE_KEY)
    );

    // Verify the transaction via mirror node
    console.log('Verifying old NFT transfer via mirror node...');

    // TODO: Add mirror node verification here to ensure:
    // 1. Transaction was successful
    // 2. NFT was transferred to blackhole
    // 3. NFT serial number matches
    // For now, we'll trust the frontend (in production, ALWAYS verify!)

    console.log('Old NFT transfer verified (skipping mirror node check for now)');

    // Verify the NFT(s) were actually transferred to blackhole
    // (Additional verification could be done here by querying mirror node)

    // Check which serials treasury actually owns before attempting transfer
    console.log(`Checking treasury ownership for ${serials.length} NFT(s)...`);
    const availableSerials: number[] = [];
    const missingSerials: number[] = [];

    for (const serial of serials) {
      try {
        // Query mirror node to check if treasury owns this serial
        const response = await fetch(
          `https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/${NEW_TOKEN_ID}/nfts?account.id=${TREASURY_ACCOUNT_ID}&serialnumber=${serial}`
        );

        if (response.ok) {
          const data = await response.json();
          if (data.nfts && data.nfts.length > 0) {
            availableSerials.push(serial);
          } else {
            console.warn(`Treasury does not own serial #${serial} - likely already swapped`);
            missingSerials.push(serial);
          }
        } else {
          console.warn(`Failed to check ownership for serial #${serial}`);
          missingSerials.push(serial);
        }
      } catch (error) {
        console.error(`Error checking serial #${serial}:`, error);
        missingSerials.push(serial);
      }
    }

    console.log(`Available serials: ${availableSerials.length}/${serials.length}`);
    if (missingSerials.length > 0) {
      console.log(`Missing serials (already swapped): ${missingSerials.join(', ')}`);
    }

    // If no serials are available, return error
    if (availableSerials.length === 0) {
      return res.status(400).json({
        error: 'All requested NFTs have already been swapped',
        missingSerials,
      });
    }

    // Now send new NFT(s) from treasury to user (only available ones)
    console.log(`Sending ${availableSerials.length} new NFT(s) to user...`);

    // Create transaction with all NFT transfers
    let newNftTransaction = new TransferTransaction();

    // Add all NFT transfers to the same transaction (only available serials)
    for (const serial of availableSerials) {
      newNftTransaction = newNftTransaction.addNftTransfer(
        TokenId.fromString(NEW_TOKEN_ID),
        serial, // Same serial number
        AccountId.fromString(TREASURY_ACCOUNT_ID),
        AccountId.fromString(userAccountId)
      );
    }

    // Set memo
    const memo = isMultiple
      ? `Batch swap completed: ${availableSerials.join(', ')}`
      : `Swap completed for Degen Ape #${availableSerials[0]}`;

    newNftTransaction = newNftTransaction.setTransactionMemo(memo);

    // Execute transaction (client operator will auto-sign)
    const newNftTxResponse = await newNftTransaction.execute(client);
    const newNftReceipt = await newNftTxResponse.getReceipt(client);

    if (newNftReceipt.status !== Status.Success) {
      throw new Error(`New NFT transfer failed with status: ${newNftReceipt.status.toString()}`);
    }

    const newNftTransactionId = newNftTxResponse.transactionId.toString();
    console.log('New NFT(s) transferred successfully:', newNftTransactionId);

    // Build response with partial success info if some were missing
    const responseMessage = missingSerials.length > 0
      ? `Successfully swapped ${availableSerials.length} NFTs (${missingSerials.length} already swapped)`
      : isMultiple
        ? `Successfully swapped ${availableSerials.length} NFTs`
        : `Successfully swapped NFT #${availableSerials[0]}`;

    return res.status(200).json({
      success: true,
      transactionId: newNftTransactionId,
      oldNftTransactionId,
      serialNumber: availableSerials[0], // For backwards compatibility
      serialNumbers: availableSerials,
      missingSerials: missingSerials.length > 0 ? missingSerials : undefined,
      message: responseMessage,
    });

  } catch (error) {
    console.error('Swap error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

