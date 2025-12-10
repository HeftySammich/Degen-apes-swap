import React from 'react';
import './ProgressModal.css';

interface ProgressModalProps {
  isOpen: boolean;
  current: number;
  total: number;
  currentNFT?: number;
  title?: string;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({
  isOpen,
  current,
  total,
  currentNFT,
  title = '🔄 Swapping NFTs...'
}) => {
  if (!isOpen) return null;

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="progress-modal-overlay">
      <div className="progress-modal-content">
        <div className="progress-modal-header">
          <h2>{title}</h2>
        </div>
        <div className="progress-modal-body">
          <div className="progress-stats">
            <p className="progress-count">
              <strong>{current}</strong> of <strong>{total}</strong> NFTs swapped
            </p>
            {currentNFT && (
              <p className="progress-current">
                Currently swapping: <strong>#{currentNFT}</strong>
              </p>
            )}
          </div>
          
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${percentage}%` }}
            >
              <span className="progress-percentage">{percentage}%</span>
            </div>
          </div>

          <p className="progress-warning">
            ⚠️ Please keep this window open until the swap is complete
          </p>
        </div>
      </div>
    </div>
  );
};

