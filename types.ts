
export enum MessageType {
  ANNOUNCE = 0x01,
  KEY_EXCHANGE = 0x02,
  LEAVE = 0x03,
  MESSAGE = 0x04,
  FRAGMENT_START = 0x05,
  FRAGMENT_CONTINUE = 0x06,
  FRAGMENT_END = 0x07,
  ROOM_ANNOUNCE = 0x08,
  ROOM_RETENTION = 0x09
}

export interface Peer {
  id: string;
  nickname: string;
  publicKey: string;
  rssi: number;
  lastSeen: number;
  isOnline: boolean;
}

export interface BitchatPacket {
  version: number;
  type: MessageType;
  id: string;
  senderId: string;
  recipientId: string; // "broadcast" or peer ID
  channel: string | null;
  timestamp: number;
  ttl: number;
  payload: string;
  signature?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderNickname: string;
  text: string;
  timestamp: number;
  channel: string | null;
  isMe: boolean;
  status: 'sent' | 'relayed' | 'delivered';
}

export interface MeshStatus {
  activeConnections: number;
  messagesRelayed: number;
  batteryLevel: number;
  isScanning: boolean;
}
