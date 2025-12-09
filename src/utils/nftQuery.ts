// Query NFTs from Hedera Mirror Node
const MIRROR_NODE_URL = 'https://mainnet-public.mirrornode.hedera.com';
const OLD_TOKEN_ID = import.meta.env.VITE_OLD_TOKEN_ID;

export type NFT = {
  token_id: string;
  serial_number: number;
  account_id: string;
  metadata?: string;
};

export type NFTWithImage = NFT & {
  imageUrl?: string;
  name?: string;
};

// Fetch NFTs owned by an account for a specific token
export const fetchAccountNFTs = async (accountId: string): Promise<NFTWithImage[]> => {
  try {
    const url = `${MIRROR_NODE_URL}/api/v1/accounts/${accountId}/nfts?token.id=${OLD_TOKEN_ID}`;
    console.log('Fetching NFTs from:', url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Mirror node request failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('NFT data received:', data);

    // Process NFTs to extract image URLs from metadata
    const nftsWithImages = await Promise.all((data.nfts || []).map(async (nft: NFT) => {
      const metadata = decodeMetadata(nft.metadata);
      console.log(`NFT #${nft.serial_number} raw metadata:`, nft.metadata);
      console.log(`NFT #${nft.serial_number} decoded metadata:`, metadata);

      // Try multiple common metadata formats
      let imageUrl = null;
      let name = `Degen Ape #${nft.serial_number}`;

      if (metadata) {
        // If metadata is a string (IPFS URL to JSON file)
        if (typeof metadata === 'string') {
          let metadataUrl = metadata;

          // Handle IPFS URLs
          if (metadataUrl.startsWith('ipfs://')) {
            metadataUrl = metadataUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
          }

          // If it's a JSON file, fetch it
          if (metadataUrl.endsWith('.json')) {
            try {
              console.log(`Fetching metadata JSON for NFT #${nft.serial_number}:`, metadataUrl);
              const metadataResponse = await fetch(metadataUrl);
              const metadataJson = await metadataResponse.json();
              console.log(`NFT #${nft.serial_number} metadata JSON:`, metadataJson);

              imageUrl = metadataJson.image || metadataJson.imageUrl || metadataJson.image_url;
              name = metadataJson.name || name;

              // Handle IPFS URLs in the image field
              if (imageUrl && imageUrl.startsWith('ipfs://')) {
                imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
              }
            } catch (error) {
              console.error(`Error fetching metadata JSON for NFT #${nft.serial_number}:`, error);
            }
          } else {
            // Direct image URL
            imageUrl = metadataUrl;
          }
        }
        // If metadata is already an object
        else if (typeof metadata === 'object') {
          imageUrl = metadata.image ||
                     metadata.imageUrl ||
                     metadata.image_url ||
                     metadata.properties?.image ||
                     metadata.properties?.files?.[0]?.uri;
          name = metadata.name || name;

          // Handle IPFS URLs
          if (imageUrl && imageUrl.startsWith('ipfs://')) {
            imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
          }
        }
      }

      console.log(`NFT #${nft.serial_number} final imageUrl:`, imageUrl);

      return {
        ...nft,
        imageUrl: imageUrl || undefined,
        name,
      };
    }));

    return nftsWithImages;
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    throw error;
  }
};

// Decode base64 metadata if present
export const decodeMetadata = (base64Metadata?: string): any => {
  if (!base64Metadata) return null;

  try {
    const decoded = atob(base64Metadata);

    // Try to parse as JSON first
    try {
      return JSON.parse(decoded);
    } catch {
      // If not JSON, it might be a direct URL string
      return decoded;
    }
  } catch (error) {
    console.error('Error decoding metadata:', error);
    return null;
  }
};

