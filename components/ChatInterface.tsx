
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, Peer } from '../types.ts';
import { CHANNEL_METADATA } from '../constants.ts';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  activeTarget: string;
  isChannel: boolean;
  onShowInfo?: () => void;
  onlinePeers?: Peer[];
  memberCount?: number;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  onSendMessage, 
  activeTarget, 
  isChannel, 
  onShowInfo,
  onlinePeers = [],
  memberCount = 0
}) => {
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showUserList, setShowUserList] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const metadata = isChannel ? CHANNEL_METADATA[activeTarget] : null;

  useEffect(() => {
    if (scrollRef.current && !isSearching) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSearching]);

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    return messages.filter(m => m.text.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [messages, searchQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input);
    setInput('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMessage(`📎 Shared artifact: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, text: string) => {
    e.preventDefault();
    // Offset to avoid cursor overlapping
    setContextMenu({ x: e.clientX, y: e.clientY, text });
    setCopyFeedback(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => setContextMenu(null), 1000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const getStatusIndicator = (status: 'sent' | 'relayed' | 'delivered') => {
    switch (status) {
      case 'sent':
        return (
          <div className="flex items-center gap-1 opacity-50 group/status" title="Transmission initialized">
            <span className="text-[7px] font-mono font-bold uppercase tracking-[0.15em]">TX</span>
            <i className="text-[8px] fas fa-check"></i>
          </div>
        );
      case 'relayed':
        return (
          <div className="flex items-center gap-1.5" title="Hopping through mesh nodes">
            <span className="text-[7px] font-mono font-bold uppercase tracking-[0.1em] text-emerald-400 animate-pulse">Bridged</span>
            <div className="relative flex items-center justify-center">
              <i className="text-[8px] fas fa-share-nodes text-emerald-400"></i>
              <span className="absolute w-2 h-2 animate-ping rounded-full bg-emerald-500/30"></span>
            </div>
          </div>
        );
      case 'delivered':
        return (
          <div className="flex items-center gap-1 text-emerald-300" title="Destination node acknowledged">
            <span className="text-[7px] font-mono font-bold uppercase tracking-[0.1em] text-glow">Sync</span>
            <div className="flex -space-x-1">
              <i className="text-[8px] fas fa-check animate-in fade-in zoom-in duration-300"></i>
              <i className="text-[8px] fas fa-check animate-in fade-in zoom-in duration-500 delay-100"></i>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-2xl lg:rounded-3xl overflow-hidden shadow-2xl relative">
      {/* Custom Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[999] bg-slate-800 border border-slate-700 shadow-2xl rounded-xl py-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={() => copyToClipboard(contextMenu.text)}
            className="w-full px-4 py-2.5 text-left text-xs font-bold font-mono flex items-center gap-3 hover:bg-slate-700 transition-colors group"
          >
            <i className={`fas ${copyFeedback ? 'fa-check text-emerald-400' : 'fa-copy text-slate-400 group-hover:text-emerald-400'}`}></i>
            <span className={copyFeedback ? 'text-emerald-400' : 'text-slate-200'}>
              {copyFeedback ? 'COPIED!' : 'COPY SIGNAL'}
            </span>
          </button>
        </div>
      )}

      {/* Header - IRC Style */}
      <div className="border-b border-slate-800 bg-slate-900/90 flex flex-col z-20">
        <div className="px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-inner border border-white/10 transition-colors shrink-0 ${isChannel ? 'bg-emerald-600' : 'bg-emerald-800'}`}>
              {isChannel ? <i className="fas fa-hashtag text-sm"></i> : <i className="fas fa-user-secret text-sm"></i>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-100 text-sm lg:text-base uppercase tracking-tight font-mono truncate">
                  {activeTarget}
                </h2>
                {isChannel && (
                  <button 
                    onClick={() => setShowUserList(!showUserList)}
                    className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition-colors ${showUserList ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}
                  >
                    <i className="fas fa-users mr-1"></i>{memberCount}
                  </button>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5 truncate">
                {isChannel ? 'Root Kernel Broadcast' : 'Secure P2P Tunnel'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
              {isSearching ? (
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 animate-in slide-in-from-right-2">
                      <input 
                          autoFocus
                          type="text" 
                          placeholder="Search logs..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="bg-transparent border-none outline-none text-xs text-emerald-400 w-24 lg:w-40 font-mono"
                      />
                      <button onClick={() => { setIsSearching(false); setSearchQuery(''); }} className="text-slate-500 hover:text-white px-1"><i className="fas fa-times"></i></button>
                  </div>
              ) : (
                  <button onClick={() => setIsSearching(true)} className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 transition-all">
                      <i className="fas fa-search text-xs"></i>
                  </button>
              )}
              <button onClick={onShowInfo} className="w-8 h-8 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 transition-all">
                  <i className="fas fa-info-circle text-xs"></i>
              </button>
          </div>
        </div>
        
        {/* IRC Topic Bar */}
        {isChannel && metadata && (
          <div className="px-4 lg:px-6 py-1.5 bg-emerald-950/30 border-t border-slate-800 flex items-center gap-3 overflow-hidden">
            <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter shrink-0">Topic:</span>
            <p className="text-[10px] font-mono text-emerald-200/60 truncate flex-1">
              {metadata.topic}
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Messages List */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {filteredMessages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-700 space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-800/20 flex items-center justify-center border border-slate-800/30">
                  <i className="fas fa-wave-square text-2xl opacity-20 animate-pulse"></i>
              </div>
              <p className="text-[10px] font-mono uppercase tracking-widest opacity-40">
                  {searchQuery ? 'Log mismatch' : 'No inbound signals recorded'}
              </p>
            </div>
          )}
          {filteredMessages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-500`}
            >
              <div 
                onContextMenu={(e) => handleContextMenu(e, msg.text)}
                className={`max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl shadow-xl relative transition-all hover:translate-y-[-1px] select-text cursor-default ${
                msg.isMe 
                  ? 'bg-gradient-to-br from-emerald-600/90 to-green-700/90 text-white rounded-tr-none border border-emerald-500/20' 
                  : 'bg-slate-800/80 text-slate-100 rounded-tl-none border border-slate-700 shadow-slate-950/20'
              }`}>
                {!msg.isMe && <p className="text-[9px] font-black text-emerald-400 mb-1 uppercase tracking-[0.2em] font-mono">{msg.senderNickname}</p>}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                <div className="flex items-center justify-end gap-3 mt-2 pt-1 border-t border-white/5 opacity-80 pointer-events-none">
                  <span className="text-[8px] font-mono tracking-tighter tabular-nums opacity-60">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {msg.isMe && getStatusIndicator(msg.status)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* IRC Names (User List) Sidebar */}
        {isChannel && showUserList && (
          <div className="w-48 lg:w-56 bg-slate-900/90 border-l border-slate-800 overflow-y-auto animate-in slide-in-from-right-4 duration-300 z-10 hidden md:block">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Peer List</h3>
              <p className="text-[9px] text-emerald-500/70 font-mono">Active Nodes ({memberCount})</p>
            </div>
            <div className="p-2 space-y-1">
              <div className="flex items-center gap-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
                <span className="text-xs font-mono font-bold text-white">@Me</span>
              </div>
              {onlinePeers.map(peer => (
                <div key={peer.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors group">
                  <div className={`w-2 h-2 rounded-full ${peer.isOnline ? 'bg-emerald-500/50' : 'bg-slate-700'}`}></div>
                  <span className="text-xs font-mono text-slate-400 group-hover:text-slate-200 truncate flex-1">{peer.nickname}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 bg-slate-900/80 border-t border-slate-800 shadow-[0_-10px_30px_rgba(0,0,0,0.3)] backdrop-blur-lg z-20">
        <div className="relative flex items-center max-w-4xl mx-auto w-full gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
          />
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-700 hover:text-emerald-400 transition-all active:scale-90 shrink-0"
          >
            <i className="fas fa-plus text-xs"></i>
          </button>
          
          <div className="flex-1 relative min-w-0">
            <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isChannel ? `Message ${activeTarget}...` : `Secure tunnel to ${activeTarget}...`}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-sm text-emerald-400 placeholder-slate-700 outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all font-mono"
            />
            <button 
                type="submit"
                disabled={!input.trim()}
                className="absolute right-1.5 top-1.5 w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-20 shadow-lg shadow-emerald-500/20"
            >
                <i className="fas fa-paper-plane text-[10px]"></i>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;
