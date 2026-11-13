import React, { useState, useEffect, useRef } from 'react';
import logo from './assets/icons/256.png';
import userIcon from './assets/icons/user.svg';
import threeDotsIcon from './assets/icons/3dots.svg';
import copyIcon from './assets/icons/copy.svg';
import refreshIcon from './assets/icons/refresh.svg';
import './Chat.css';

function ChatUI({ messages, setMessages }) {
  const [input, setInput] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e) => {
    if (e) e.preventDefault();
    if (!input.trim()) return;

    const newMsg = {
      id: Date.now(),
      sender: 'user',
      text: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInput('');
  };

  const handleKeyDown = (e) => {
    // Ctrl + Enter sends the message; plain Enter allows a newline
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const toggleMenu = (msgId) => {
    setActiveMenuId((prev) => (prev === msgId ? null : msgId));
  };

  const handleRevert = (msgIndex) => {
    if (msgIndex >= messages.length - 1) {
      setActiveMenuId(null);
      return;
    }

    // Subsequent messages after the target message
    const subsequentMessages = messages.slice(msgIndex + 1);
    const nextUserMsg = subsequentMessages.find((m) => m.sender === 'user');

    if (nextUserMsg) {
      setInput(nextUserMsg.text);
    }

    setMessages((prev) => prev.slice(0, msgIndex + 1));
    setActiveMenuId(null);
    textareaRef.current?.focus();
  };

  const handleCopyMessage = (msgId, text) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
    setActiveMenuId(null);
  };

  const handleRegenerate = (msgId) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === msgId
          ? {
              ...msg,
              text: 'This is a regenerated response from Project:MICHIZURE!',
              timestamp,
            }
          : msg
      )
    );
  };

  return (
    <div className="chat-container" onClick={() => setActiveMenuId(null)}>
      <div className="messages-list">
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          const isAssistant = msg.sender === 'assistant';

          return (
            <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
              <div className={`message-avatar ${msg.sender === 'user' ? 'user-avatar' : 'bot-avatar'}`}>
                <img
                  src={msg.sender === 'user' ? userIcon : logo}
                  alt={msg.sender === 'user' ? 'User' : 'MICHIZURE Bot'}
                />
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className="message-sender">
                    {msg.sender === 'user' ? 'You' : 'MICHIZURE'}
                  </span>
                  <span className="message-time">{msg.timestamp}</span>
                </div>

                {/* Message Bubble */}
                <div className="message-bubble">{msg.text}</div>

                {/* Action Buttons Below Bubble */}
                <div className="message-actions-bar">
                  {/* Copy button */}
                  <button
                    className="msg-action-btn"
                    title={copiedId === msg.id ? 'Copied!' : 'Copy'}
                    aria-label="Copy text"
                    onClick={() => handleCopyMessage(msg.id, msg.text)}
                  >
                    <img src={copyIcon} alt="Copy" className="action-icon" />
                  </button>

                  {/* Regenerate button (only under the very last bubble and only if it's MICHIZURE) */}
                  {isLastMessage && isAssistant && (
                    <button
                      className="msg-action-btn"
                      title="Regenerate response"
                      aria-label="Regenerate response"
                      onClick={() => handleRegenerate(msg.id)}
                    >
                      <img src={refreshIcon} alt="Regenerate" className="action-icon" />
                    </button>
                  )}

                  {/* 3-dots Menu button */}
                  <div
                    className="message-menu-container"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="msg-action-btn"
                      aria-label="More options"
                      title="More options"
                      onClick={() => toggleMenu(msg.id)}
                    >
                      <img src={threeDotsIcon} alt="Options" className="action-icon dots-icon" />
                    </button>

                    {activeMenuId === msg.id && (
                      <div className="message-dropdown-menu">
                        <button
                          className="menu-item"
                          disabled={isLastMessage}
                          onClick={() => handleRevert(index)}
                          title={isLastMessage ? 'Already at the latest message' : 'Revert conversation to this message'}
                        >
                          Revert
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSend} className="chat-input-form">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            rows="2"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim()}
            aria-label="Send message"
            title="Send (Ctrl+Enter)"
          >
            <svg viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatUI;
