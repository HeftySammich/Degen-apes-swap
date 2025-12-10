// Mirror Node Service with automatic rotation and fallback
// Cycles through multiple mirror nodes to avoid rate limits

const MIRROR_NODES = [
  'https://mainnet-public.mirrornode.hedera.com',
  'https://mainnet.mirrornode.hedera.com',
  // Add more community mirror nodes as backups
];

let currentNodeIndex = 0;
let requestCounts = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 10000; // 10 seconds
const MAX_REQUESTS_PER_WINDOW = 80; // Conservative limit (Hedera allows ~100)

/**
 * Get the next available mirror node URL
 */
function getNextMirrorNode(): string {
  currentNodeIndex = (currentNodeIndex + 1) % MIRROR_NODES.length;
  return MIRROR_NODES[currentNodeIndex];
}

/**
 * Check if we're approaching rate limit for a node
 */
function isApproachingRateLimit(nodeUrl: string): boolean {
  const now = Date.now();
  const stats = requestCounts.get(nodeUrl);

  if (!stats) return false;

  // Reset counter if window has passed
  if (now > stats.resetTime) {
    requestCounts.delete(nodeUrl);
    return false;
  }

  return stats.count >= MAX_REQUESTS_PER_WINDOW;
}

/**
 * Track a request to a mirror node
 */
function trackRequest(nodeUrl: string): void {
  const now = Date.now();
  const stats = requestCounts.get(nodeUrl);

  if (!stats || now > stats.resetTime) {
    requestCounts.set(nodeUrl, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
  } else {
    stats.count++;
  }
}

/**
 * Fetch from mirror node with automatic rotation on rate limits
 */
export async function fetchFromMirrorNode(
  endpoint: string,
  maxRetries: number = 3
): Promise<any> {
  let lastError: Error | null = null;
  let attempts = 0;

  while (attempts < maxRetries) {
    const currentNode = MIRROR_NODES[currentNodeIndex];

    // If approaching rate limit, switch to next node
    if (isApproachingRateLimit(currentNode)) {
      console.log(`Rate limit approaching for ${currentNode}, switching to next node`);
      getNextMirrorNode();
      continue;
    }

    try {
      const url = `${currentNode}${endpoint}`;
      console.log(`Fetching from mirror node: ${url}`);

      trackRequest(currentNode);
      const response = await fetch(url);

      if (response.status === 429) {
        // Rate limited - switch to next node
        console.warn(`Rate limited by ${currentNode}, switching to next node`);
        getNextMirrorNode();
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        continue;
      }

      if (!response.ok) {
        throw new Error(`Mirror node request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching from ${currentNode}:`, error);
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Try next node
      getNextMirrorNode();
      attempts++;

      if (attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
      }
    }
  }

  throw lastError || new Error('All mirror nodes failed');
}

/**
 * Fetch NFTs with pagination support
 */
export async function fetchNFTsWithPagination(
  accountId: string,
  tokenId: string,
  limit: number = 25,
  nextLink?: string
): Promise<{ nfts: any[]; links: { next?: string } }> {
  const endpoint = nextLink
    ? nextLink.replace(/^https?:\/\/[^\/]+/, '') // Remove base URL from next link
    : `/api/v1/accounts/${accountId}/nfts?token.id=${tokenId}&limit=${limit}`;

  const data = await fetchFromMirrorNode(endpoint);

  return {
    nfts: data.nfts || [],
    links: data.links || {},
  };
}

/**
 * Check token association with retry
 */
export async function checkTokenAssociation(
  accountId: string,
  tokenId: string
): Promise<boolean> {
  try {
    const data = await fetchFromMirrorNode(
      `/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`
    );
    return data.tokens && data.tokens.length > 0;
  } catch (error) {
    console.error('Error checking token association:', error);
    return false;
  }
}

