export const DEFAULT_TTL = 7;
export const MAX_RELAY_CACHE = 1000;
export const SCAN_INTERVAL = 5000;
export const ANNOUNCE_INTERVAL = 10000;

export const CHANNELS = [
  "#general", "#emergency", "#trading", "#dev", "#offtopic"
];

export const CHANNEL_METADATA: Record<string, { topic: string; description: string }> = {
  "#general": { 
    topic: "The Root entry point. Decentralized and resilient.", 
    description: "Main broadcast frequency for all mesh nodes. Used for general coordination and system announcements."
  },
  "#emergency": { 
    topic: "CRITICAL COMMS ONLY. NO SPAM.", 
    description: "High-priority channel reserved for urgent situations where mesh connectivity is vital for safety."
  },
  "#trading": { 
    topic: "P2P Barter & Exchange Node. Trust but verify.", 
    description: "Decentralized marketplace for physical and digital goods within physical proximity."
  },
  "#dev": { 
    topic: "Root-OS Kernel Debugging & Protocol talk.", 
    description: "Technical discussion regarding mesh routing, encryption standards, and binary protocol improvements."
  },
  "#offtopic": { 
    topic: "Signal noise. Anything goes.", 
    description: "Unfiltered stream of consciousness from across the mesh network."
  }
};