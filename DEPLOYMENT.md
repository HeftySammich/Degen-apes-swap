# Degen Ape Swap - Deployment Guide

## Overview
This application allows users to swap their old Degen Ape NFTs (without royalties) for new ones (with royalties).

## Architecture
- **Frontend**: React + Vite + TypeScript
- **Wallet**: Hedera Wallet Connect
- **Backend**: Vercel Serverless Functions
- **Blockchain**: Hedera Mainnet

## Prerequisites
1. **Treasury Account**: Holds the new NFTs to distribute
2. **Blackhole Account**: Receives the old NFTs (burns them)
3. **New Token**: The new NFT collection with royalties
4. **WalletConnect Project ID**: From https://cloud.walletconnect.com/

## Environment Variables

### Frontend (.env.local)
```bash
VITE_HEDERA_NETWORK=mainnet
VITE_OLD_TOKEN_ID=0.0.10034080
VITE_NEW_TOKEN_ID=0.0.10172732
VITE_BLACKHOLE_ACCOUNT_ID=0.0.10172931
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### Backend (Vercel Dashboard)
Set these in Vercel project settings → Environment Variables:
```bash
TREASURY_ACCOUNT_ID=0.0.9300000
TREASURY_PRIVATE_KEY=302e...your_key_here
BLACKHOLE_ACCOUNT_ID=0.0.10172931
OLD_TOKEN_ID=0.0.10034080
NEW_TOKEN_ID=0.0.10172732
HEDERA_NETWORK=mainnet
```

## Local Development

1. **Install dependencies**:
```bash
npm install
```

2. **Create `.env.local`** (copy from `.env.example`):
```bash
cp .env.example .env.local
```

3. **Fill in your environment variables** in `.env.local`

4. **Run development server**:
```bash
npm run dev
```

5. **Test locally** at `http://localhost:5173`

## Deployment to Vercel

### Option 1: Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Set environment variables
vercel env add TREASURY_ACCOUNT_ID
vercel env add TREASURY_PRIVATE_KEY
vercel env add BLACKHOLE_ACCOUNT_ID
vercel env add OLD_TOKEN_ID
vercel env add NEW_TOKEN_ID
vercel env add HEDERA_NETWORK

# Deploy to production
vercel --prod
```

### Option 2: Vercel Dashboard
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure project:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variables in Settings → Environment Variables
5. Deploy!

## How It Works

### User Flow
1. User connects wallet (HashPack, Blade, etc.)
2. App fetches user's old Degen Ape NFTs
3. User clicks "Swap" on an NFT
4. User signs transaction to send old NFT to blackhole
5. Backend verifies transaction and sends new NFT to user
6. User receives new NFT with royalties!

### Technical Flow
```
User Wallet → Old NFT → Blackhole Account
                ↓
         Backend Verifies
                ↓
Treasury Account → New NFT → User Wallet
```

## Security Considerations

1. **Private Keys**: NEVER commit private keys to git
2. **Treasury Key**: Store securely in Vercel environment variables
3. **Verification**: Backend verifies old NFT was received before sending new one
4. **Rate Limiting**: Consider adding rate limiting to prevent abuse

## Testing

### Test on Testnet First
1. Change `VITE_HEDERA_NETWORK=testnet`
2. Use testnet token IDs and accounts
3. Test full swap flow
4. Verify transactions on HashScan testnet

### Production Checklist
- [ ] Treasury account has enough new NFTs
- [ ] All environment variables set correctly
- [ ] Tested on testnet
- [ ] Private keys secured
- [ ] Frontend deployed and accessible
- [ ] Backend API endpoints working
- [ ] Wallet connection working

## Monitoring

- **Frontend**: Vercel Analytics
- **Backend**: Vercel Function Logs
- **Blockchain**: HashScan (https://hashscan.io/mainnet)

## Troubleshooting

### "Wallet not connected"
- Ensure WalletConnect Project ID is set
- Check browser console for errors

### "Transaction failed"
- Check user has associated with old token
- Verify user owns the NFT
- Check Hedera network status

### "Backend error"
- Check Vercel function logs
- Verify environment variables are set
- Ensure treasury has NFTs to send

## Support
For issues, check:
1. Browser console logs
2. Vercel function logs
3. HashScan transaction details

