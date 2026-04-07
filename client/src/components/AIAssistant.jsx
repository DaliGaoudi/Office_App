import { useState, useEffect, useRef } from 'react';
import { Bot, Send, X, Minimize2, Maximize2, User, Sparkles, Loader2 } from 'lucide-react';
import API_BASE from '../config';

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'مرحباً! أنا مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen && !isMinimized) {
      scrollToBottom();
    }
  }, [messages, isOpen, isMinimized]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messages: [...messages, userMessage] })
      });

      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: "عذراً، حدث خطأ. يرجى التحقق من المفتاح الخاص بك." }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "خطأ في الاتصال بخادم الذكاء الاصطناعي." }]);
    }
    setLoading(false);
  };

  if (!isOpen) {
    return (
      <div 
        className="fab animate-fade" 
        style={{ bottom: '2rem', left: '2rem', zIndex: 1000 }}
        onClick={() => setIsOpen(true)}
      >
        <Bot size={28} />
      </div>
    );
  }

  return (
    <div 
      className={`glass animate-fade ${isMinimized ? 'ai-minimized' : 'ai-chat-window'}`}
      style={{
        position: 'fixed',
        bottom: '2rem',
        left: '2.5rem',
        background: 'var(--surface)',
        width: isMinimized ? '200px' : '400px',
        height: isMinimized ? '60px' : '600px',
        maxWidth: '90vw',
        maxHeight: '80vh',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div className="modal-header" style={{ marginBottom: 0, padding: '1rem 1.5rem', background: 'var(--nav-active-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ padding: '0.4rem', background: 'var(--primary)', borderRadius: '8px', color: 'white' }}>
            <Bot size={18} />
          </div>
          <h3 style={{ fontSize: '1rem', margin: 0 }}>المساعد الذكي</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-icon" onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button className="btn-icon" onClick={() => setIsOpen(false)}>
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                width: '100%'
              }}>
                <div style={{ 
                  maxWidth: '85%',
                  padding: '0.8rem 1rem',
                  borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: m.role === 'user' ? 'var(--primary)' : 'var(--nav-active-bg)',
                  color: m.role === 'user' ? '#ffffff' : 'var(--text-main)',
                  fontSize: '0.9rem',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-wrap',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)'
                }}>
                  {m.content}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {m.role === 'user' ? 'أنت' : 'المساعد'}
                </span>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div style={{ 
                  background: 'var(--nav-active-bg)', 
                  padding: '0.8rem 1.2rem', 
                  borderRadius: '14px 14px 14px 2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <Loader2 size={14} className="animate-spin" />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>المساعد يفكر...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} style={{ padding: '1rem', borderTop: '1px solid var(--card-border)' }}>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                value={input} 
                onChange={e => setInput(e.target.value)}
                placeholder="اسأل سؤالاً..."
                style={{ paddingRight: '3rem' }}
                disabled={loading}
              />
              <button 
                type="submit" 
                className="btn-icon" 
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none' }}
                disabled={loading}
              >
                <Send size={18} style={{ color: input.trim() ? 'var(--primary)' : 'var(--text-muted)' }} />
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
