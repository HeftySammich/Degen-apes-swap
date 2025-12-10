import { useState, useEffect } from 'react';
import { fetchAccountNFTs } from '../utils/nftQuery';
import type { NFTWithImage, NFTPage } from '../utils/nftQuery';
import { swapSingleNFT, swapMultipleNFTs, associateToken } from '../utils/swapTransaction';
import { getDAppConnector } from '../utils/walletConnect';
import { AccountId } from '@hashgraph/sdk';
import { Modal } from './Modal';
import { ProgressModal } from './ProgressModal';
import './NFTList.css';

const NEW_TOKEN_ID = import.meta.env.VITE_NEW_TOKEN_ID;

interface NFTListProps {
  accountId: string | null;
}

export const NFTList = ({ accountId }: NFTListProps) => {
  const [nfts, setNfts] = useState<NFTWithImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<Set<number>>(new Set());
  const [massSwapping, setMassSwapping] = useState(false);

  // Pagination states
  const [pageSize, setPageSize] = useState(25);
  const [hasMore, setHasMore] = useState(false);
  const [nextLink, setNextLink] = useState<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  // Modal states
  const [showAssociationModal, setShowAssociationModal] = useState(false);
  const [showSwapConfirmModal, setShowSwapConfirmModal] = useState(false);
  const [pendingSwapSerial, setPendingSwapSerial] = useState<number | null>(null);
  const [pendingMassSwap, setPendingMassSwap] = useState(false);

  // Success/Error modal states
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ title: string; message: string; isSuccess: boolean } | null>(null);

  // Progress modal states
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [swapProgress, setSwapProgress] = useState({ current: 0, total: 0, currentNFT: 0 });

  const loadNFTs = async (reset: boolean = true) => {
    if (!accountId) {
      setNfts([]);
      return;
    }

    if (reset) {
      setLoading(true);
      setNfts([]);
      setNextLink(undefined);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const result: NFTPage = await fetchAccountNFTs(
        accountId,
        pageSize,
        reset ? undefined : nextLink
      );
      console.log('Fetched NFTs:', result);

      if (reset) {
        setNfts(result.nfts);
      } else {
        setNfts(prev => [...prev, ...result.nfts]);
      }

      setHasMore(result.hasMore);
      setNextLink(result.nextLink);
    } catch (err) {
      console.error('Failed to load NFTs:', err);
      setError('Failed to load your NFTs. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadNFTs(true);
  }, [accountId, pageSize]);

  const handleSwapSingle = async (serialNumber: number) => {
    if (!accountId) return;

    // Store the serial number and show confirmation modal
    setPendingSwapSerial(serialNumber);
    setShowSwapConfirmModal(true);
  };

  const executeSwap = async (serialNumber: number) => {
    if (!accountId) return;

    setSwapping(prev => new Set(prev).add(serialNumber));

    try {
      const result = await swapSingleNFT(accountId, serialNumber);

      if (result.success) {
        setResultMessage({
          title: '✅ Swap Successful!',
          message: `Successfully swapped NFT #${serialNumber}!\n\nTransaction ID: ${result.transactionId}`,
          isSuccess: true
        });
        setShowResultModal(true);
        await loadNFTs(true);
      } else {
        setResultMessage({
          title: '❌ Swap Failed',
          message: `Swap failed for NFT #${serialNumber}\n\n${result.error}`,
          isSuccess: false
        });
        setShowResultModal(true);
      }
    } catch (error) {
      console.error('Swap error:', error);

      // Check if it's a token association error
      if (error instanceof Error && error.message === 'TOKEN_NOT_ASSOCIATED') {
        setShowAssociationModal(true);
        setSwapping(prev => {
          const next = new Set(prev);
          next.delete(serialNumber);
          return next;
        });
        return;
      }

      setResultMessage({
        title: '❌ Swap Failed',
        message: `Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isSuccess: false
      });
      setShowResultModal(true);
    } finally {
      setSwapping(prev => {
        const next = new Set(prev);
        next.delete(serialNumber);
        return next;
      });
    }
  };

  const handleAssociateToken = async () => {
    if (!accountId) return;

    setShowAssociationModal(false);

    try {
      const dAppConnector = getDAppConnector();
      if (!dAppConnector) {
        throw new Error('Wallet not connected');
      }

      const signer = dAppConnector.getSigner(AccountId.fromString(accountId));
      if (!signer) {
        throw new Error('No signer available');
      }

      // Associate the token
      await associateToken(accountId, NEW_TOKEN_ID, signer);

      setResultMessage({
        title: '✅ Token Association Successful!',
        message: 'You can now proceed with the swap.',
        isSuccess: true
      });
      setShowResultModal(true);

      // Retry the swap if there was a pending one
      if (pendingSwapSerial !== null) {
        await executeSwap(pendingSwapSerial);
      }
    } catch (error) {
      console.error('Association error:', error);
      setResultMessage({
        title: '❌ Token Association Failed',
        message: `Token association failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isSuccess: false
      });
      setShowResultModal(true);
    }
  };

  const handleSwapAll = async () => {
    if (!accountId || nfts.length === 0) return;

    setPendingMassSwap(true);
    setShowSwapConfirmModal(true);
  };

  const executeMassSwap = async () => {
    if (!accountId || nfts.length === 0) return;

    setMassSwapping(true);
    setShowProgressModal(true);
    setSwapProgress({ current: 0, total: nfts.length, currentNFT: 0 });

    try {
      const serialNumbers = nfts.map(nft => nft.serial_number);

      // Progress callback
      const onProgress = (completed: number, total: number, currentSerial?: number) => {
        setSwapProgress({
          current: completed,
          total: total,
          currentNFT: currentSerial || 0
        });
      };

      const results = await swapMultipleNFTs(accountId, serialNumbers, onProgress);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      // Hide progress modal
      setShowProgressModal(false);

      if (failed === 0) {
        setResultMessage({
          title: '✅ Mass Swap Successful!',
          message: `Successfully swapped all ${successful} NFTs!`,
          isSuccess: true
        });
      } else {
        setResultMessage({
          title: '⚠️ Mass Swap Partially Complete',
          message: `Swapped ${successful} NFTs successfully.\n${failed} failed.`,
          isSuccess: false
        });
      }
      setShowResultModal(true);

      await loadNFTs(true);
    } catch (error) {
      console.error('Mass swap error:', error);

      // Hide progress modal
      setShowProgressModal(false);

      // Check if it's a token association error
      if (error instanceof Error && error.message === 'TOKEN_NOT_ASSOCIATED') {
        setShowAssociationModal(true);
        setMassSwapping(false);
        return;
      }

      setResultMessage({
        title: '❌ Mass Swap Failed',
        message: `Mass swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isSuccess: false
      });
      setShowResultModal(true);
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
      <div className="nft-list-header">
        <h2>Your Eligible NFTs ({nfts.length})</h2>
        <div className="page-size-selector">
          <label htmlFor="pageSize">NFTs per page:</label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            disabled={loading || loadingMore}
          >
            <option value={5}>5</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
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

      {/* Load More Button */}
      {hasMore && (
        <div className="load-more-section">
          <button
            className="load-more-button"
            onClick={() => loadNFTs(false)}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load More NFTs'}
          </button>
        </div>
      )}

      {/* Mass Swap Button */}
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

      {/* Token Association Modal */}
      <Modal
        isOpen={showAssociationModal}
        onClose={() => setShowAssociationModal(false)}
        onConfirm={handleAssociateToken}
        title="⚠️ Token Association Required"
        confirmText="Associate Token"
        cancelText="Cancel"
      >
        <p>
          Before you can receive the new Degen Ape NFT, you need to associate your account with the new token.
        </p>
        <p>
          <strong>This is a one-time fee of approximately $0.05 (paid in HBAR).</strong>
        </p>
        <p>
          After association, you'll be able to receive and swap your NFTs.
        </p>
      </Modal>

      {/* Swap Confirmation Modal */}
      <Modal
        isOpen={showSwapConfirmModal}
        onClose={() => {
          setShowSwapConfirmModal(false);
          setPendingSwapSerial(null);
          setPendingMassSwap(false);
        }}
        onConfirm={() => {
          setShowSwapConfirmModal(false);
          if (pendingMassSwap) {
            setPendingMassSwap(false);
            executeMassSwap();
          } else if (pendingSwapSerial !== null) {
            const serial = pendingSwapSerial;
            setPendingSwapSerial(null);
            executeSwap(serial);
          }
        }}
        title="🔄 NFT Swap Process"
        confirmText="Continue"
        cancelText="Cancel"
      >
        {pendingMassSwap ? (
          <>
            <p>
              <strong>You are about to swap {nfts.length} NFTs.</strong>
            </p>
            <p>
              <strong>Step 1:</strong> You will send your old Degen Ape NFTs to the burn address
            </p>
            <p>
              <strong>Step 2:</strong> You will automatically receive the new Degen Ape NFTs with royalties
            </p>
            <p>
              ⚠️ <strong>Your wallet will show "You receive: nothing" - this is normal!</strong>
            </p>
            <p>
              The new NFTs will be sent to you immediately after.
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>Step 1:</strong> You will send your old Degen Ape #{pendingSwapSerial} to the burn address
            </p>
            <p>
              <strong>Step 2:</strong> You will automatically receive the new Degen Ape #{pendingSwapSerial} with royalties
            </p>
            <p>
              ⚠️ <strong>Your wallet will show "You receive: nothing" - this is normal!</strong>
            </p>
            <p>
              The new NFT will be sent to you immediately after.
            </p>
          </>
        )}
      </Modal>

      {/* Success/Error Result Modal */}
      <Modal
        isOpen={showResultModal}
        onClose={() => {
          setShowResultModal(false);
          setResultMessage(null);
        }}
        onConfirm={() => {
          setShowResultModal(false);
          setResultMessage(null);
        }}
        title={resultMessage?.title || ''}
        confirmText="OK"
        showCancel={false}
      >
        <p style={{ whiteSpace: 'pre-line' }}>{resultMessage?.message}</p>
      </Modal>

      {/* Progress Modal */}
      <ProgressModal
        isOpen={showProgressModal}
        current={swapProgress.current}
        total={swapProgress.total}
        currentNFT={swapProgress.currentNFT}
      />
    </div>
  );
};
