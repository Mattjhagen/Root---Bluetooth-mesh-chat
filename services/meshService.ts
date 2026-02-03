import { MessageType, Peer, BitchatPacket, ChatMessage } from '../types';
import { DEFAULT_TTL, ANNOUNCE_INTERVAL } from '../constants';
import { cryptoService } from './cryptoService';

type PacketHandler = (packet: BitchatPacket) => void;

class MeshService {
  private peers: Map<string, Peer> = new Map();
  private processedPackets: Set<string> = new Set();
  private myPeer: Peer;
  private onPacketReceived: PacketHandler | null = null;
  private stats = {
    sent: 0,
    received: 0,
    relayed: 0
  };

  // The BroadcastChannel acts as the "Radio Air" for the local environment
  // This allows multiple browser tabs or local nodes to form a real live mesh
  private transport = new BroadcastChannel('root_mesh_backbone_v1');

  constructor() {
    const myId = cryptoService.generateId();
    this.myPeer = {
      id: myId,
      nickname: `Node_${myId.substring(0, 4)}`,
      publicKey: 'pk_' + myId,
      rssi: -30,
      lastSeen: Date.now(),
      isOnline: true
    };

    this.initTransport();
    this.startDiscovery();
  }

  private initTransport() {
    this.transport.onmessage = (event) => {
      const packet = event.data as BitchatPacket;
      this.handleIncomingPacket(packet);
    };

    // Immediate announcement upon boot
    this.announcePresence();
  }

  private startDiscovery() {
    // Periodic announcement to maintain mesh presence
    setInterval(() => {
      this.announcePresence();
      this.cleanupStalePeers();
    }, ANNOUNCE_INTERVAL);
  }

  private announcePresence() {
    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.ANNOUNCE,
      id: cryptoService.generateId(),
      senderId: this.myPeer.id,
      recipientId: 'broadcast',
      channel: null,
      timestamp: Date.now(),
      ttl: 1, // Discovery is local-first
      payload: JSON.stringify({
        nickname: this.myPeer.nickname,
        publicKey: this.myPeer.publicKey
      })
    };
    this.transport.postMessage(packet);
  }

  private cleanupStalePeers() {
    const now = Date.now();
    this.peers.forEach((peer, id) => {
      if (now - peer.lastSeen > ANNOUNCE_INTERVAL * 3) {
        peer.isOnline = false;
      }
    });
  }

  setPacketHandler(handler: PacketHandler) {
    this.onPacketReceived = handler;
  }

  getMyPeer() { return this.myPeer; }
  
  updateNickname(newNick: string) {
    this.myPeer.nickname = newNick;
    this.announcePresence();
  }

  getPeers() { return Array.from(this.peers.values()); }

  getStats() { return this.stats; }

  broadcast(text: string, channel: string | null = null) {
    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.MESSAGE,
      id: cryptoService.generateId(),
      senderId: this.myPeer.id,
      recipientId: 'broadcast',
      channel,
      timestamp: Date.now(),
      ttl: DEFAULT_TTL,
      payload: text
    };
    this.stats.sent++;
    this.sendPacket(packet);
    return packet;
  }

  sendPrivateMessage(recipientId: string, text: string) {
    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.MESSAGE,
      id: cryptoService.generateId(),
      senderId: this.myPeer.id,
      recipientId,
      channel: null,
      timestamp: Date.now(),
      ttl: DEFAULT_TTL,
      payload: text
    };
    this.stats.sent++;
    this.sendPacket(packet);
    return packet;
  }

  private sendPacket(packet: BitchatPacket) {
    this.processedPackets.add(packet.id);
    this.transport.postMessage(packet);
  }

  handleIncomingPacket(packet: BitchatPacket): boolean {
    if (this.processedPackets.has(packet.id)) return false;
    this.processedPackets.add(packet.id);

    // Track Peer Presence
    if (packet.senderId !== this.myPeer.id) {
      this.updatePeerFromPacket(packet);
    }

    // Handle Message Types
    if (packet.type === MessageType.ANNOUNCE) {
      return true; // Announcements are handled in updatePeerFromPacket
    }

    if (packet.type === MessageType.MESSAGE) {
      this.stats.received++;
      
      // Trigger local UI update
      if (this.onPacketReceived) {
        this.onPacketReceived(packet);
      }

      // Automatic Mesh Relay Logic
      if (packet.ttl > 0 && packet.senderId !== this.myPeer.id) {
        this.relayPacket(packet);
      }
    }

    return true;
  }

  private updatePeerFromPacket(packet: BitchatPacket) {
    let peer = this.peers.get(packet.senderId);
    
    if (packet.type === MessageType.ANNOUNCE) {
      try {
        const data = JSON.parse(packet.payload);
        if (!peer) {
          peer = {
            id: packet.senderId,
            nickname: data.nickname,
            publicKey: data.publicKey,
            rssi: -50, // Initial signal strength
            lastSeen: Date.now(),
            isOnline: true
          };
          this.peers.set(packet.senderId, peer);
        } else {
          peer.nickname = data.nickname;
          peer.lastSeen = Date.now();
          peer.isOnline = true;
        }
      } catch (e) {
        console.error("Invalid announce payload");
      }
    } else if (peer) {
      peer.lastSeen = Date.now();
      peer.isOnline = true;
    }
  }

  private relayPacket(packet: BitchatPacket) {
    // Add small random jitter to simulate network propagation and avoid collisions
    setTimeout(() => {
      const relayedPacket = { ...packet, ttl: packet.ttl - 1 };
      this.stats.relayed++;
      this.transport.postMessage(relayedPacket);
    }, 200 + Math.random() * 800);
  }

  getPeerNickname(id: string): string {
    if (id === this.myPeer.id) return this.myPeer.nickname;
    return this.peers.get(id)?.nickname || id.substring(0, 8);
  }
}

export const meshService = new MeshService();