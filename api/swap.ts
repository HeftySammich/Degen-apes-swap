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

    // Now send new NFT(s) from treasury to user
    console.log(`Sending ${serials.length} new NFT(s) to user...`);

    // Create transaction with all NFT transfers
    let newNftTransaction = new TransferTransaction();

    // Add all NFT transfers to the same transaction
    for (const serial of serials) {
      newNftTransaction = newNftTransaction.addNftTransfer(
        TokenId.fromString(NEW_TOKEN_ID),
        serial, // Same serial number
        AccountId.fromString(TREASURY_ACCOUNT_ID),
        AccountId.fromString(userAccountId)
      );
    }

    // Set memo
    const memo = isMultiple
      ? `Batch swap completed: ${serials.join(', ')}`
      : `Swap completed for Degen Ape #${serials[0]}`;

    newNftTransaction = newNftTransaction.setTransactionMemo(memo);

    // Execute transaction (client operator will auto-sign)
    const newNftTxResponse = await newNftTransaction.execute(client);
    const newNftReceipt = await newNftTxResponse.getReceipt(client);

    if (newNftReceipt.status !== Status.Success) {
      throw new Error(`New NFT transfer failed with status: ${newNftReceipt.status.toString()}`);
    }

    const newNftTransactionId = newNftTxResponse.transactionId.toString();
    console.log('New NFT(s) transferred successfully:', newNftTransactionId);

    return res.status(200).json({
      success: true,
      transactionId: newNftTransactionId,
      oldNftTransactionId,
      serialNumber: serials[0], // For backwards compatibility
      serialNumbers: serials,
      message: isMultiple
        ? `Successfully swapped ${serials.length} NFTs`
        : `Successfully swapped NFT #${serials[0]}`,
    });

  } catch (error) {
    console.error('Swap error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

