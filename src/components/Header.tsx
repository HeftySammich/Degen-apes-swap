import { useState, useEffect } from 'react';
import { connectWallet, disconnectWallet, getConnectedAccount } from '../utils/walletConnect';
import logo from '../assets/logo.jpg';
import './Header.css';

interface HeaderProps {
  onAccountChange: (accountId: string | null) => void;
}

export const Header = ({ onAccountChange }: HeaderProps) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Check if already connected
    const account = getConnectedAccount();
    if (account) {
      setAccountId(account);
      onAccountChange(account);
    }
  }, [onAccountChange]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const account = await connectWallet();
      if (account) {
        setAccountId(account);
        onAccountChange(account);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
      setAccountId(null);
      onAccountChange(null);
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  const formatAccountId = (id: string) => {
    return `${id.slice(0, 7)}...${id.slice(-4)}`;
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo-section">
          <img src={logo} alt="Degen Ape" className="logo" />
          <h1>Degen Ape Swap</h1>
        </div>
        
        <div className="wallet-section">
          {accountId ? (
            <div className="connected">
              <span className="account-id">{formatAccountId(accountId)}</span>
              <button onClick={handleDisconnect} className="disconnect-btn">
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              onClick={handleConnect} 
              disabled={isConnecting}
              className="connect-btn"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

