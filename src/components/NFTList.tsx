import { useState, useEffect } from 'react';
import { fetchAccountNFTs } from '../utils/nftQuery';
import type { NFTWithImage } from '../utils/nftQuery';
import { swapSingleNFT, swapMultipleNFTs } from '../utils/swapTransaction';
import './NFTList.css';

interface NFTListProps {
  accountId: string | null;
}

export const NFTList = ({ accountId }: NFTListProps) => {
  const [nfts, setNfts] = useState<NFTWithImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<Set<number>>(new Set());
  const [massSwapping, setMassSwapping] = useState(false);

  useEffect(() => {
    const loadNFTs = async () => {
      if (!accountId) {
        setNfts([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const fetchedNFTs = await fetchAccountNFTs(accountId);
        console.log('Fetched NFTs:', fetchedNFTs);
        setNfts(fetchedNFTs);
      } catch (err) {
        console.error('Failed to load NFTs:', err);
        setError('Failed to load your NFTs. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadNFTs();
  }, [accountId]);

  const handleSwapSingle = async (serialNumber: number) => {
    if (!accountId) return;

    // Show confirmation dialog explaining the process
    const confirmed = confirm(
      `🔄 NFT Swap Process:\n\n` +
      `Step 1: You will send your old Degen Ape #${serialNumber} to the burn address\n` +
      `Step 2: You will automatically receive the new Degen Ape #${serialNumber} with royalties\n\n` +
      `⚠️ Your wallet will show "You receive: nothing" - this is normal!\n` +
      `The new NFT will be sent to you immediately after.\n\n` +
      `Continue with swap?`
    );

    if (!confirmed) return;

    setSwapping(prev => new Set(prev).add(serialNumber));

    try {
      const result = await swapSingleNFT(accountId, serialNumber);

      if (result.success) {
        alert(`✅ Successfully swapped NFT #${serialNumber}!\nTransaction ID: ${result.transactionId}`);
        // Reload NFTs to show updated list
        await loadNFTs();
      } else {
        alert(`❌ Swap failed for NFT #${serialNumber}\n${result.error}`);
      }
    } catch (error) {
      console.error('Swap error:', error);
      alert(`❌ Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSwapping(prev => {
        const next = new Set(prev);
        next.delete(serialNumber);
        return next;
      });
    }
  };

  const handleSwapAll = async () => {
    if (!accountId || nfts.length === 0) return;

    const confirmed = confirm(`Are you sure you want to swap all ${nfts.length} NFTs?`);
    if (!confirmed) return;

    setMassSwapping(true);

    try {
      const serialNumbers = nfts.map(nft => nft.serial_number);
      const results = await swapMultipleNFTs(accountId, serialNumbers);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      if (failed === 0) {
        alert(`✅ Successfully swapped all ${successful} NFTs!`);
      } else {
        alert(`⚠️ Swapped ${successful} NFTs successfully.\n${failed} failed.`);
      }

      // Reload NFTs to show updated list
      await loadNFTs();
    } catch (error) {
      console.error('Mass swap error:', error);
      alert(`❌ Mass swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setMassSwapping(false);
    }
  };

  if (!accountId) {
    return (
      <div className="nft-list-empty">
        <h2>Connect your wallet to view your eligible NFTs</h2>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="nft-list-loading">
        <h2>Loading your NFTs...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nft-list-error">
        <h2>{error}</h2>
      </div>
    );
  }

  if (nfts.length === 0) {
    return (
      <div className="nft-list-empty">
        <h2>No eligible NFTs found</h2>
        <p>You don't own any old Degen Ape NFTs that can be swapped.</p>
      </div>
    );
  }

  return (
    <div className="nft-list">
      <h2>Your Eligible NFTs ({nfts.length})</h2>
      <div className="nft-feed">
        {nfts.map((nft) => (
          <div key={`${nft.token_id}-${nft.serial_number}`} className="nft-swap-card">
            <div className="swap-card-content">
              <div className="nft-left">
                <div className="nft-image-container">
                  {nft.imageUrl ? (
                    <img src={nft.imageUrl} alt={nft.name} className="nft-image" />
                  ) : (
                    <div className="nft-placeholder">#{nft.serial_number}</div>
                  )}
                </div>
                <div className="nft-details">
                  <h3>{nft.name}</h3>
                  <p className="nft-serial">Serial: {nft.serial_number}</p>
                </div>
              </div>

              <div className="swap-arrow">→</div>

              <div className="nft-right">
                <div className="nft-image-container">
                  {nft.imageUrl ? (
                    <img src={nft.imageUrl} alt={`New ${nft.name}`} className="nft-image" />
                  ) : (
                    <div className="nft-placeholder">#{nft.serial_number}</div>
                  )}
                </div>
                <div className="nft-details">
                  <h3>New {nft.name}</h3>
                  <p className="nft-serial">With Royalties</p>
                </div>
              </div>

              <button
                className="swap-button"
                onClick={() => handleSwapSingle(nft.serial_number)}
                disabled={swapping.has(nft.serial_number) || massSwapping}
              >
                {swapping.has(nft.serial_number) ? 'Swapping...' : 'Swap'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {nfts.length > 1 && (
        <div className="mass-swap-section">
          <button
            className="mass-swap-button"
            onClick={handleSwapAll}
            disabled={massSwapping || swapping.size > 0}
          >
            {massSwapping ? 'Swapping All...' : `Swap All ${nfts.length} NFTs`}
          </button>
        </div>
      )}
    </div>
  );
};

