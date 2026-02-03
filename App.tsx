import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { meshService } from './services/meshService.ts';
import { geminiService } from './services/geminiService.ts';
import { ChatMessage, Peer, BitchatPacket, MessageType } from './types.ts';
import { CHANNELS, CHANNEL_METADATA } from './constants.ts';
import ChatInterface from './components/ChatInterface.tsx';
import MeshVisualization from './components/MeshVisualization.tsx';

const Modal: React.FC<{ isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h3 className="font-bold text-emerald-400 text-glow uppercase tracking-widest text-xs">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [activeTab, setActiveTab] = useState<'chats' | 'mesh' | 'ai'>('chats');
  const [activeTarget, setActiveTarget] = useState<string>(CHANNELS[0]);
  const [isChannel, setIsChannel] = useState(true);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  
  const [aiChat, setAiChat] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [searchInsights, setSearchInsights] = useState<{text: string, sources: any[]} | null>(null);

  const [nickname, setNickname] = useState(meshService.getMyPeer().nickname);
  const [batteryMode, setBatteryMode] = useState('Performance Mode');
  const [ttl, setTtl] = useState(7);

  const myPeer = meshService.getMyPeer();
  const [meshStats, setMeshStats] = useState(meshService.getStats());

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    requestNotificationPermission();
  }, [requestNotificationPermission]);

  const triggerNotification = (title: string, body: string) => {
    if (Notification.permission === 'granted' && document.hidden) {
      new Notification(title, {
        body,
        icon: './icon.svg'
      });
    }
  };

  useEffect(() => {
    const handlePacket = (packet: BitchatPacket) => {
      // Logic for incoming packets
      if (packet.type === MessageType.MESSAGE) {
        const isTargetedToMe = packet.recipientId === 'broadcast' || packet.recipientId === myPeer.id;
        
        if (packet.senderId !== myPeer.id && isTargetedToMe) {
          const senderNick = meshService.getPeerNickname(packet.senderId);
          setMessages(prev => {
            if (prev.find(m => m.id === packet.id)) return prev;
            return [...prev, {
              id: packet.id,
              senderId: packet.senderId,
              senderNickname: senderNick,
              text: packet.payload,
              timestamp: packet.timestamp,
              channel: packet.channel,
              isMe: false,
              status: 'relayed'
            }];
          });

          triggerNotification(
            packet.channel ? `Root Channel: ${packet.channel}` : `Private signal: ${senderNick}`,
            packet.payload
          );
        } else if (packet.senderId === myPeer.id) {
          // Packet we sent that has been relayed
          setMessages(prev => prev.map(m => {
            if (m.id !== packet.id) return m;
            if (m.status === 'delivered') return m;
            const newStatus = packet.ttl < 7 ? 'relayed' : 'sent';
            return { ...m, status: newStatus };
          }));
        }
      }
      setMeshStats({...meshService.getStats()});
    };

    meshService.setPacketHandler(handlePacket);
    setPeers(meshService.getPeers());

    const interval = setInterval(() => {
      setPeers(meshService.getPeers());
      setMeshStats({...meshService.getStats()});
    }, 2000);

    return () => clearInterval(interval);
  }, [myPeer.id]);

  const privateChatMessages = useMemo(() => {
    if (isChannel) return [];
    return messages.filter(m => 
      m.channel === null && (
        (m.senderId === activeTarget && !m.isMe) || 
        (m.isMe && (m as any).recipientId === activeTarget)
      )
    );
  }, [messages, activeTarget, isChannel]);

  const channelMessages = useMemo(() => {
    if (!isChannel) return [];
    return messages.filter(m => m.channel === activeTarget);
  }, [messages, activeTarget, isChannel]);

  const handleSendMessage = (text: string) => {
    let packet: BitchatPacket;
    if (isChannel) {
      packet = meshService.broadcast(text, activeTarget);
    } else {
      packet = meshService.sendPrivateMessage(activeTarget, text);
    }

    const newMessage: ChatMessage & { recipientId?: string } = {
      id: packet.id,
      senderId: myPeer.id,
      senderNickname: 'Me',
      text: packet.payload,
      timestamp: packet.timestamp,
      channel: packet.channel,
      isMe: true,
      status: 'sent',
      recipientId: packet.recipientId
    };

    setMessages(prev => [...prev, newMessage]);
    setMeshStats({...meshService.getStats()});
  };

  const askAssistant = async (text: string) => {
    if (!text.trim()) return;
    const newChat = [...aiChat, {role: 'user' as const, text}];
    setAiChat(newChat);
    setAiLoading(true);
    try {
      const response = await geminiService.getAssistantResponse(text, {
        peersOnline: peers.filter(p => p.isOnline).length,
        totalMessages: messages.length,
        myId: myPeer.id,
        batteryMode,
        ttl
      });
      setAiChat(prev => [...prev, {role: 'assistant', text: response || 'Root Core unresponsive.'}]);
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const getGlobalInsights = async () => {
    setAiLoading(true);
    try {
      const insights = await geminiService.getSearchInsights("future of decentralized mesh messenger networks 2025");
      setSearchInsights(insights);
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleUpdateNickname = (e: React.FormEvent) => {
    e.preventDefault();
    meshService.updateNickname(nickname);
    setIsProfileOpen(false);
  };

  const onlinePeers = useMemo(() => peers.filter(p => p.isOnline), [peers]);

  return (
    <div className="flex h-screen bg-slate-950 font-sans text-slate-100 flex-col lg:flex-row safe-top safe-bottom">
      
      {/* Modals */}
      <Modal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="System Config">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Power Allocation</label>
            <select 
              value={batteryMode} 
              onChange={(e) => setBatteryMode(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
            >
              <option>Performance Mode</option>
              <option>Balanced</option>
              <option>Power Saver</option>
              <option>Ultra Low Power</option>
            </select>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-xs">Signal TTL (Hops)</label>
              <span className="text-emerald-400 font-mono text-sm">{ttl}</span>
            </div>
            <input 
              type="range" min="1" max="15" step="1" 
              value={ttl} 
              onChange={(e) => setTtl(parseInt(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>
          <div className="pt-4 border-t border-slate-800">
             <button onClick={() => setIsSettingsOpen(false)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg shadow-emerald-500/20">Commit Changes</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} title="Root Identity">
        <form onSubmit={handleUpdateNickname} className="space-y-6">
          <div className="flex flex-col items-center gap-4 py-4">
             <div className="w-24 h-24 rounded-full border-4 border-slate-800 overflow-hidden ring-4 ring-emerald-500/20 glow-green">
                <img src={`https://picsum.photos/seed/${myPeer.id}/200`} alt="Avatar" />
             </div>
             <div className="text-center">
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Mesh Node ID</p>
                <p className="font-mono text-sm text-emerald-400">{myPeer.id}</p>
             </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Alias</label>
            <input 
              type="text" 
              value={nickname} 
              onChange={(e) => setNickname(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="System identifier..."
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
             <div className="p-3 bg-slate-800/50 rounded-xl text-center border border-slate-700">
                <p className="text-[8px] text-slate-500 uppercase">TX</p>
                <p className="font-bold text-sm text-emerald-400">{meshStats.sent}</p>
             </div>
             <div className="p-3 bg-slate-800/50 rounded-xl text-center border border-slate-700">
                <p className="text-[8px] text-slate-500 uppercase">Relayed</p>
                <p className="font-bold text-sm text-emerald-400">{meshStats.relayed}</p>
             </div>
             <div className="p-3 bg-slate-800/50 rounded-xl text-center border border-slate-700">
                <p className="text-[8px] text-slate-500 uppercase">RX</p>
                <p className="font-bold text-sm text-emerald-400">{meshStats.received}</p>
             </div>
          </div>
          <button type="submit" className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20">Sync Identity</button>
        </form>
      </Modal>

      <Modal 
        isOpen={isInfoOpen} 
        onClose={() => setIsInfoOpen(false)} 
        title={isChannel ? `Kernel Metadata: ${activeTarget}` : "Secure Peer Profile"}
      >
        <div className="space-y-6">
          {isChannel ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Broadcast Topic</h4>
                <p className="text-sm text-emerald-100 font-mono bg-slate-800/50 p-3 rounded-xl border border-slate-800">
                  {CHANNEL_METADATA[activeTarget]?.topic || "Standard broadcast protocol."}
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Channel Description</h4>
                <p className="text-xs text-slate-400 leading-relaxed italic">
                  {CHANNEL_METADATA[activeTarget]?.description || "General purpose frequency."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                    <p className="text-[8px] text-slate-500 uppercase mb-1">Participants</p>
                    <p className="text-sm font-bold text-emerald-400">{onlinePeers.length + 1} Nodes</p>
                </div>
                <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl">
                    <p className="text-[8px] text-slate-500 uppercase mb-1">Integrity</p>
                    <p className="text-sm font-bold text-emerald-400">NOMINAL</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col items-center gap-4 py-2">
                 <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shadow-lg shadow-emerald-500/10">
                    <img src={`https://picsum.photos/seed/${activeTarget}/100`} alt="Peer" />
                 </div>
                 <div className="text-center">
                    <h4 className="font-black text-white text-lg tracking-tight uppercase">
                      {peers.find(p => p.id === activeTarget)?.nickname || 'Ghost Node'}
                    </h4>
                    <p className="text-[10px] font-mono text-emerald-500/60">{activeTarget}</p>
                 </div>
              </div>
              <div className="space-y-3 bg-slate-800/30 p-4 rounded-2xl border border-slate-800">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 uppercase font-bold tracking-widest">Connection Strength</span>
                  <span className="text-emerald-400 font-mono">-{Math.floor(Math.random() * 30 + 40)} dBm</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 uppercase font-bold tracking-widest">Protocol Type</span>
                  <span className="text-emerald-400 font-mono">SECURE_MESH_v4</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 uppercase font-bold tracking-widest">Encryption</span>
                  <span className="text-emerald-400 font-mono">X25519_GCM</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 uppercase font-bold tracking-widest">Last Handshake</span>
                  <span className="text-emerald-400 font-mono">JUST NOW</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Sidebar Nav */}
      <nav className="fixed bottom-0 left-0 w-full h-16 lg:h-screen lg:w-20 md:lg:w-24 bg-slate-900 border-t lg:border-t-0 lg:border-r border-slate-800 flex flex-row lg:flex-col items-center justify-around lg:justify-start lg:py-8 lg:gap-8 shadow-2xl z-50">
        <div className="hidden lg:flex w-12 h-12 bg-gradient-to-tr from-emerald-600 to-green-600 rounded-2xl items-center justify-center shadow-lg shadow-emerald-500/20 mb-4 cursor-pointer hover:rotate-3 transition-transform">
          <i className="fas fa-terminal text-white text-xl"></i>
        </div>
        
        <div className="flex flex-row lg:flex-col gap-8 lg:gap-6 flex-1 items-center justify-center">
          <NavIcon icon="fa-comment-alt" active={activeTab === 'chats'} onClick={() => setActiveTab('chats')} label="Signals" color="emerald" />
          <NavIcon icon="fa-microchip" active={activeTab === 'mesh'} onClick={() => setActiveTab('mesh')} label="Mesh" color="emerald" />
          <NavIcon icon="fa-brain" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} label="Core" color="emerald" />
          <div className="lg:hidden">
             <NavIcon icon="fa-sliders-h" active={false} onClick={() => setIsSettingsOpen(true)} label="Config" color="emerald" />
          </div>
        </div>

        <div className="hidden lg:flex flex-col gap-6 items-center">
          <NavIcon icon="fa-sliders-h" active={false} onClick={() => setIsSettingsOpen(true)} label="Config" color="emerald" />
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden ring-2 ring-slate-800 ring-offset-2 ring-offset-slate-950 hover:ring-emerald-500 transition-all glow-green"
          >
             <img src={`https://picsum.photos/seed/${myPeer.id}/100`} alt="Avatar" />
          </button>
        </div>
        
        <div className="lg:hidden">
            <button 
              onClick={() => setIsProfileOpen(true)}
              className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden"
            >
               <img src={`https://picsum.photos/seed/${myPeer.id}/100`} alt="Avatar" />
            </button>
        </div>
      </nav>

      {/* Sidebar Content */}
      <aside className="hidden lg:flex w-80 flex-col bg-slate-950 border-r border-slate-900 overflow-hidden z-10">
        {activeTab === 'chats' && (
          <div className="flex flex-col h-full">
            <div className="p-6">
              <h1 className="text-2xl font-black mb-1 tracking-tighter text-emerald-400 text-glow">ROOT</h1>
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse shadow-[0_0_8px_#10b981] ${onlinePeers.length > 0 ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                <p className="text-slate-500 text-[10px] font-mono uppercase tracking-widest">Neighbor Nodes: {peers.filter(p => p.isOnline).length}</p>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 space-y-6 pb-6">
              <section>
                <div className="flex items-center justify-between mb-3 px-2">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Global Channels</h3>
                </div>
                <div className="space-y-1">
                  {CHANNELS.map(ch => (
                    <SidebarItem 
                      key={ch} 
                      label={ch} 
                      active={isChannel && activeTarget === ch} 
                      onClick={() => { setIsChannel(true); setActiveTarget(ch); }}
                      icon="fa-hashtag"
                      color="emerald"
                    />
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3 px-2">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Peripheral Peers</h3>
                </div>
                <div className="space-y-1">
                  {peers.length === 0 && (
                    <p className="px-2 text-[10px] text-slate-600 italic">Scanning airwaves for signals...</p>
                  )}
                  {peers.map(peer => (
                    <SidebarItem 
                      key={peer.id} 
                      label={peer.nickname} 
                      active={!isChannel && activeTarget === peer.id} 
                      onClick={() => { setIsChannel(false); setActiveTarget(peer.id); }}
                      icon="fa-satellite-dish"
                      color="emerald"
                      online={peer.isOnline}
                      subtitle={`RSSI: ${peer.rssi.toFixed(0)} dBm`}
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'mesh' && (
          <div className="p-6 space-y-6 h-full overflow-y-auto">
            <h2 className="text-xl font-black tracking-tight text-emerald-400 uppercase italic">Topology Map</h2>
            <MeshVisualization peers={peers} myId={myPeer.id} />
            <div className="space-y-3">
              <StatCard label="Packets Bridged" value={meshStats.relayed} icon="fa-route" color="text-emerald-400" />
              <StatCard label="Uptime Mode" value={batteryMode} icon="fa-bolt" color="text-emerald-400" />
              <StatCard label="Kernel Version" value="ROOT-OS v2.4" icon="fa-layer-group" color="text-emerald-400" />
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="p-6 h-full flex flex-col">
            <h2 className="text-xl font-black mb-4 tracking-tight text-emerald-400">CORE INTERFACE</h2>
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-[11px] text-emerald-200 leading-relaxed shadow-sm">
                 Accessing the Root System Assistant for protocol queries and decentralized data retrieval.
              </div>
              <button 
                onClick={getGlobalInsights}
                disabled={aiLoading}
                className="w-full p-4 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-300 hover:bg-slate-800 hover:border-emerald-500/30 transition-all flex items-center justify-center gap-3 group active:scale-95"
              >
                <i className="fas fa-globe group-hover:rotate-12 transition-transform"></i> 
                {aiLoading ? 'Broadcasting Query...' : 'Fetch Global Mesh Trends'}
              </button>
              
              {searchInsights && (
                <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800 text-[10px] space-y-3 shadow-lg">
                  <h4 className="font-bold text-emerald-500 uppercase tracking-tighter">Grounding Signal:</h4>
                  <p className="text-slate-400 leading-relaxed">{searchInsights.text}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-slate-950 flex flex-col overflow-hidden relative pb-16 lg:pb-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none"></div>

        {activeTab === 'chats' ? (
          <ChatInterface 
            activeTarget={isChannel ? activeTarget : peers.find(p => p.id === activeTarget)?.nickname || 'Unidentified Node'} 
            messages={isChannel ? channelMessages : privateChatMessages} 
            onSendMessage={handleSendMessage}
            isChannel={isChannel}
            onShowInfo={() => setIsInfoOpen(true)}
            onlinePeers={onlinePeers}
            memberCount={onlinePeers.length + 1}
          />
        ) : activeTab === 'mesh' ? (
           <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-8 animate-in zoom-in duration-500">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 animate-pulse ${onlinePeers.length > 0 ? 'bg-emerald-600/10 border-emerald-600/20 glow-green' : 'bg-slate-800/10 border-slate-800/20'}`}>
                <i className={`fas fa-network-wired text-4xl ${onlinePeers.length > 0 ? 'text-emerald-500' : 'text-slate-700'}`}></i>
              </div>
              <div className="max-w-md">
                <h2 className="text-2xl font-black tracking-tighter text-emerald-400 uppercase italic">Kernel Active</h2>
                <p className="text-slate-500 mt-2 leading-relaxed text-sm">
                   {onlinePeers.length > 0 
                    ? `Your interface is currently bridging ${onlinePeers.length} neighbors. Data integrity is nominal.` 
                    : `No active neighbor nodes detected. Scanning local airwaves for mesh signals...`}
                </p>
              </div>
              <div className="lg:hidden w-full max-w-sm">
                <MeshVisualization peers={peers} myId={myPeer.id} />
                <div className="grid grid-cols-2 gap-3 mt-6">
                   <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Relayed</p>
                      <p className="text-lg font-black text-emerald-400">{meshStats.relayed}</p>
                   </div>
                   <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Mode</p>
                      <p className="text-lg font-black text-emerald-400">{batteryMode.split(' ')[0]}</p>
                   </div>
                </div>
              </div>
           </div>
        ) : (
           <div className="flex-1 bg-slate-900/40 m-2 rounded-3xl border border-slate-800 flex flex-col overflow-hidden shadow-2xl backdrop-blur-sm">
             <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
                <h3 className="font-black flex items-center gap-3 text-xs tracking-widest text-emerald-400 uppercase">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600/10 flex items-center justify-center">
                    <i className="fas fa-robot text-emerald-500 text-xs"></i>
                  </div>
                  System Intelligence
                </h3>
             </div>
             <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6">
                {aiChat.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center opacity-40 text-center px-10 space-y-6">
                     <i className="fas fa-code text-4xl text-slate-700"></i>
                     <p className="text-xs italic">Awaiting technical query regarding Root Core architecture.</p>
                   </div>
                )}
                {aiChat.map((chat, idx) => (
                   <div key={idx} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                      <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${chat.role === 'user' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 border border-slate-700 text-slate-200'}`}>
                         <p className="whitespace-pre-wrap">{chat.text}</p>
                      </div>
                   </div>
                ))}
                {aiLoading && <div className="text-[10px] text-emerald-500 animate-pulse px-4">Processing mesh request...</div>}
             </div>
             <div className="p-4 bg-slate-900/50 border-t border-slate-800">
                <input 
                  onKeyDown={(e) => { if (e.key === 'Enter') { askAssistant((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }}
                  type="text" 
                  placeholder="Query system core..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3.5 px-5 text-sm outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all text-emerald-400 placeholder:text-slate-700"
                />
             </div>
           </div>
        )}
      </main>
    </div>
  );
};

const NavIcon: React.FC<{icon: string, active: boolean, onClick: () => void, label: string, color: string}> = ({icon, active, onClick, label, color}) => (
  <button 
    onClick={onClick}
    className={`group relative w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-300 ${active ? `bg-${color}-600 text-white shadow-lg shadow-${color}-500/40 scale-110 glow-${color}` : 'text-slate-500 hover:text-emerald-400 hover:bg-slate-800/50'}`}
  >
    <i className={`fas ${icon} text-lg`}></i>
    <span className="hidden lg:block absolute left-16 scale-0 group-hover:scale-100 transition-all origin-left bg-slate-800 text-slate-100 text-[10px] py-1 px-2 rounded-lg pointer-events-none z-50 font-bold uppercase tracking-widest">{label}</span>
  </button>
);

const SidebarItem: React.FC<{label: string, active: boolean, onClick: () => void, icon: string, online?: boolean, subtitle?: string, color: string}> = ({label, active, onClick, icon, online, subtitle, color}) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all ${active ? `bg-${color}-600/10 border border-${color}-500/30` : 'hover:bg-slate-900/50 border border-transparent hover:border-slate-800'}`}
  >
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm ${active ? `bg-${color}-600 text-white` : 'bg-slate-800 text-slate-500'}`}>
      <i className={`fas ${icon}`}></i>
    </div>
    <div className="text-left flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold truncate ${active ? 'text-white' : 'text-slate-300'}`}>{label}</span>
        {online && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>}
      </div>
      {subtitle && <p className="text-[9px] font-mono text-slate-600 truncate">{subtitle}</p>}
    </div>
  </button>
);

const StatCard: React.FC<{label: string, value: string | number, icon: string, color: string}> = ({label, value, icon, color}) => (
  <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center gap-4 shadow-md transition-all hover:border-emerald-500/20">
    <div className={`w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center ${color}`}>
      <i className={`fas ${icon}`}></i>
    </div>
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-lg font-black tracking-tight">{value}</p>
    </div>
  </div>
);

export default App;