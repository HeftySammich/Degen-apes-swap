import { HederaSessionEvent, HederaJsonRpcMethod, DAppConnector, HederaChainId } from '@hashgraph/hedera-wallet-connect';
import { LedgerId } from '@hashgraph/sdk';

// WalletConnect (Reown) Project ID
const PROJECT_ID = '507c142323639ce7d209b398e39d1642';

// App metadata
const APP_METADATA = {
  name: 'Degen Ape Swap',
  description: 'Swap your old Degen Ape NFTs for new ones with royalties',
  url: window.location.origin,
  icons: ['https://avatars.githubusercontent.com/u/31002956'],
};

let dAppConnector: DAppConnector | null = null;

// Initialize WalletConnect
export const initWalletConnect = async () => {
  if (dAppConnector) return dAppConnector;

  // CRITICAL: Second parameter must be LedgerId.MAINNET, not HederaChainId.Mainnet!
  dAppConnector = new DAppConnector(
    APP_METADATA,
    LedgerId.MAINNET,
    PROJECT_ID,
    Object.values(HederaJsonRpcMethod),
    [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
    [HederaChainId.Mainnet]
  );

  await dAppConnector.init({ logger: 'debug' });
  return dAppConnector;
};

// Connect wallet
export const connectWallet = async () => {
  const connector = await initWalletConnect();
  const session = await connector.openModal();
  
  if (session) {
    const accountId = session.namespaces?.hedera?.accounts?.[0]?.split(':')[2];
    return accountId;
  }
  
  return null;
};

// Disconnect wallet
export const disconnectWallet = async () => {
  if (dAppConnector) {
    await dAppConnector.disconnectAll();
    dAppConnector = null;
  }
};

// Get connected account
export const getConnectedAccount = () => {
  if (!dAppConnector) return null;
  
  const session = dAppConnector.signers[0];
  if (session) {
    const accountId = session.getAccountId()?.toString();
    return accountId;
  }
  
  return null;
};

// Get DAppConnector instance
export const getDAppConnector = () => dAppConnector;

