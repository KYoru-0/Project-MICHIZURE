import React, { useState, useEffect, useRef, useCallback } from 'react';
import logo from './assets/icons/256.png';
import userIcon from './assets/icons/user.svg';
import threeDotsIcon from './assets/icons/3dots.svg';
import copyIcon from './assets/icons/copy.svg';
import refreshIcon from './assets/icons/refresh.svg';
import fastForwardIcon from './assets/icons/fast-forward.svg';
import {
  normalizeStoredStep,
  sendAppSyncMessage,
  subscribeToMessages,
} from './services/api';
import './Chat.css';

/**
 * Safely extract the active variant object from any turn.
 * Ensures backward-compatibility if a turn hasn't been grouped yet.
 */
function getActiveVariant(msg) {
  if (msg.variants && msg.variants.length > 0) {
    const idx = typeof msg.activeIndex === 'number' ? msg.activeIndex : 0;
    return msg.variants[idx] || msg.variants[0];
  }
  return {
    id: msg.id,
    text: msg.text || '',
    timestamp: msg.timestamp || '',
    isoTimestamp: msg.isoTimestamp || '',
    senderRaw: msg.sender || '',
    model: msg.model || null,
  };
}

function renderMessageText(text) {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, index) => {
    if (/^\*\*[^*\n]+\*\*$/.test(part)) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*\n]+\*$/.test(part)) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

const TEMP_GENERATING_ID = 'temp-generating-bubble';
const DEFAULT_MODEL = 'openrouter/free';

function mergeStepVariants(existing, incoming) {
  const variants = existing.variants.filter((variant) => variant.id !== TEMP_GENERATING_ID);
  let addedVariant = false;

  incoming.variants.forEach((variant) => {
    const existingIndex = variants.findIndex((item) => item.id === variant.id);
    if (existingIndex < 0) {
      variants.push(variant);
      addedVariant = true;
    } else {
      variants[existingIndex] = variant;
    }
  });

  const currentIndex = Math.min(existing.activeIndex || 0, variants.length - 1);
  return {
    ...existing,
    ...incoming,
    variants,
    activeIndex: addedVariant ? variants.length - 1 : Math.max(0, currentIndex),
  };
}

function getPathVariant(turn) {
  const active = getActiveVariant(turn);
  if (active.id !== TEMP_GENERATING_ID) return active;
  return [...turn.variants].reverse().find((variant) => variant.id !== TEMP_GENERATING_ID);
}

function getPathIds(turns) {
  return turns
    .map(getPathVariant)
    .filter((variant) => variant
      && variant.id !== TEMP_GENERATING_ID
      && !String(variant.id).startsWith('intro-')
      && variant.senderRaw !== 'AI (Error)')
    .map((variant) => variant.id);
}

function createGeneratingTurn() {
  return {
    id: TEMP_GENERATING_ID,
    sender: 'assistant',
    isGenerating: true,
    activeIndex: 0,
    variants: [
      {
        id: TEMP_GENERATING_ID,
        text: 'Generating...',
        senderRaw: 'AI (Generating)',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isoTimestamp: new Date().toISOString(),
      },
    ],
  };
}

function ChatUI({ messages, setMessages, isSending, setIsSending, sessionId }) {
  const [input, setInput] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const activeSessionRef = useRef(sessionId);
  const pendingRequestRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    activeSessionRef.current = sessionId;
    pendingRequestRef.current = null;
    setIsSending(false);
    setMessages((prev) => prev
      .filter((turn) => turn.id !== TEMP_GENERATING_ID)
      .map((turn) => {
        if (!turn.variants) return turn;
        const variants = turn.variants.filter((variant) => variant.id !== TEMP_GENERATING_ID);
        return {
          ...turn,
          variants,
          activeIndex: Math.min(turn.activeIndex || 0, Math.max(0, variants.length - 1)),
        };
      }));
  }, [sessionId, setIsSending, setMessages]);

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const applyStepResponse = useCallback((rawStep, requestedOperation = null) => {
    const incoming = normalizeStoredStep(rawStep);
    if (!incoming || incoming.sender !== 'assistant') return;

    const pending = pendingRequestRef.current;
    const operation = requestedOperation || (
      pending && (
        pending.requestId === incoming.requestId ||
        (pending.kind === 'regenerate' && pending.targetStepId === incoming.id)
      )
        ? pending
        : null
    );
    const isCurrentOperation = operation
      && pendingRequestRef.current?.requestId === operation.requestId;

    if (operation?.sessionId && operation.sessionId !== activeSessionRef.current) return;

    setMessages((prev) => {
      if (operation?.kind === 'regenerate') {
        return prev.map((turn) => {
          if (turn.id !== operation.targetStepId) return turn;
          return mergeStepVariants(turn, incoming);
        });
      }

      const withoutPlaceholder = requestedOperation && isCurrentOperation
        ? prev.filter((turn) => turn.id !== TEMP_GENERATING_ID)
        : prev;
      const existing = withoutPlaceholder.find((turn) => turn.id === incoming.id);
      if (existing) {
        return withoutPlaceholder.map((turn) =>
          turn.id === incoming.id ? mergeStepVariants(turn, incoming) : turn
        );
      }
      return [...withoutPlaceholder, incoming];
    });

    if (requestedOperation && isCurrentOperation) {
      pendingRequestRef.current = null;
      setIsSending(false);
    }
  }, [setIsSending, setMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const path = getPathIds(messages.filter((turn) => turn.id !== TEMP_GENERATING_ID && turn.variants));
    localStorage.setItem('michizure_history_until', JSON.stringify(path));
  }, [messages]);

  useEffect(() => {
    const unsubscribe = subscribeToMessages((incoming) => {
      if (!incoming.sender?.startsWith('AI') || incoming.sender === 'AI (MICHIZURE)') {
        return;
      }
      const currentSessionId = localStorage.getItem('michizure_session_id');
      const step = normalizeStoredStep(incoming);
      if (!step) return;
      if (step.sessionId !== currentSessionId) return;
      applyStepResponse(incoming);
    });

    return unsubscribe;
  }, [applyStepResponse]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isSending) return;

    const userMessageId = crypto.randomUUID();
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userIsoTimestamp = new Date().toISOString();

    const newUserTurn = {
      id: userMessageId,
      sender: 'user',
      activeIndex: 0,
      variants: [
        {
          id: userMessageId,
          text: trimmedInput,
          senderRaw: 'user',
          timestamp: userTimestamp,
          isoTimestamp: userIsoTimestamp,
        },
      ],
    };

    const chosenIds = getPathIds(messages);
    const operation = {
      kind: 'send',
      requestId: userMessageId,
      sessionId,
    };

    setMessages((prev) => [...prev, newUserTurn, createGeneratingTurn()]);
    setInput('');
    setIsSending(true);
    pendingRequestRef.current = operation;

    const provider = localStorage.getItem('michizure_provider');
    const storedApiKey = localStorage.getItem('michizure_api_key');

    let apiKey = null;
    let model = null;

    if (provider === 'openrouter') {
      apiKey = storedApiKey || '';
      model = localStorage.getItem('michizure_model') || DEFAULT_MODEL;
    }

    try {
      const response = await sendAppSyncMessage({
        content: trimmedInput,
        sender: `system:user:${userMessageId}`,
        apiKey,
        model,
        historyUntil: JSON.stringify(chosenIds),
      });
      if (!response?.sender?.startsWith('AI')) {
        throw new Error('Add an API key in Settings to get AI responses.');
      }
      applyStepResponse(response, operation);
    } catch (err) {
      if (operation.sessionId !== activeSessionRef.current) return;
      if (pendingRequestRef.current?.requestId === operation.requestId) {
        pendingRequestRef.current = null;
      }
      const errorMsgId = crypto.randomUUID();
      const errorTurn = {
        id: errorMsgId,
        sender: 'assistant',
        activeIndex: 0,
        variants: [
          {
            id: errorMsgId,
            text: `Error sending message: ${err.message || 'Unknown error'}`,
            senderRaw: 'AI (Error)',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isoTimestamp: new Date().toISOString(),
          },
        ],
      };
      setMessages((prev) => {
        if (prev.some((turn) => turn.requestId === operation.requestId)) {
          return prev.filter((turn) => turn.id !== TEMP_GENERATING_ID);
        }
        return prev.map((turn) => (turn.id === TEMP_GENERATING_ID ? errorTurn : turn));
      });
      setIsSending(false);
    }
  };

  const handleRegenerate = async (targetTurnId) => {
    if (isSending) return;

    const targetIndex = messages.findIndex((m) => m.id === targetTurnId);
    if (
      targetIndex < 0
      || String(targetTurnId).startsWith('intro-')
      || messages[targetIndex].sender !== 'assistant'
    ) return;

    const chosenIds = getPathIds(messages.slice(0, targetIndex));
    const operation = {
      kind: 'regenerate',
      requestId: targetTurnId,
      targetStepId: targetTurnId,
      sessionId,
      previousActiveIndex: messages[targetIndex].activeIndex || 0,
    };

    pendingRequestRef.current = operation;
    setIsSending(true);

    setMessages((prev) =>
      prev.map((turn) => {
        if (turn.id !== targetTurnId || !turn.variants) return turn;
        const tempVariant = {
          id: TEMP_GENERATING_ID,
          text: 'Generating...',
          senderRaw: 'AI (Generating)',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isoTimestamp: new Date().toISOString(),
        };
        const nextVariants = [...turn.variants, tempVariant];
        return {
          ...turn,
          variants: nextVariants,
          activeIndex: nextVariants.length - 1,
        };
      })
    );

    const provider = localStorage.getItem('michizure_provider');
    const storedApiKey = localStorage.getItem('michizure_api_key');

    let apiKey = null;
    let model = null;

    if (provider === 'openrouter') {
      apiKey = storedApiKey || '';
      model = localStorage.getItem('michizure_model') || DEFAULT_MODEL;
    }

    try {
      const regeneratedMessage = await sendAppSyncMessage({
        content: '__EMPTY__',
        sender: `system:regenerate:${targetTurnId}`,
        apiKey,
        model,
        historyUntil: JSON.stringify(chosenIds),
      });
      if (!regeneratedMessage?.sender?.startsWith('AI')) {
        throw new Error('Add an API key in Settings to regenerate a response.');
      }
      applyStepResponse(regeneratedMessage, operation);
    } catch {
      if (operation.sessionId !== activeSessionRef.current) return;
      if (pendingRequestRef.current?.requestId === operation.requestId) {
        pendingRequestRef.current = null;
      }
      setMessages((prev) =>
        prev.map((turn) => {
          if (turn.id !== targetTurnId || !turn.variants) return turn;
          if (turn.requestId === operation.requestId) {
            const variants = turn.variants.filter((variant) => variant.id !== TEMP_GENERATING_ID);
            return { ...turn, variants, activeIndex: variants.length - 1 };
          }
          const filtered = turn.variants.filter((v) => v.id !== TEMP_GENERATING_ID);
          return {
            ...turn,
            variants: filtered,
            activeIndex: Math.min(operation.previousActiveIndex, Math.max(0, filtered.length - 1)),
          };
        })
      );
      setIsSending(false);
    }
  };

  const handleContinue = async () => {
    if (isSending) return;

    const chosenIds = getPathIds(messages);
    const operation = {
      kind: 'continue',
      requestId: crypto.randomUUID(),
      sessionId,
    };

    setMessages((prev) => [...prev, createGeneratingTurn()]);
    setIsSending(true);
    pendingRequestRef.current = operation;

    const provider = localStorage.getItem('michizure_provider');
    const storedApiKey = localStorage.getItem('michizure_api_key');

    let apiKey = null;
    let model = null;

    if (provider === 'openrouter') {
      apiKey = storedApiKey || '';
      model = localStorage.getItem('michizure_model') || DEFAULT_MODEL;
    }

    try {
      const response = await sendAppSyncMessage({
        content: '__EMPTY__',
        sender: `system:continue:${operation.requestId}`,
        apiKey,
        model,
        historyUntil: JSON.stringify(chosenIds),
      });
      if (!response?.sender?.startsWith('AI')) {
        throw new Error('Add an API key in Settings to continue the response.');
      }
      applyStepResponse(response, operation);
    } catch {
      if (operation.sessionId !== activeSessionRef.current) return;
      if (pendingRequestRef.current?.requestId === operation.requestId) {
        pendingRequestRef.current = null;
      }
      setMessages((prev) => {
        if (prev.some((turn) => turn.requestId === operation.requestId)) {
          return prev.filter((turn) => turn.id !== TEMP_GENERATING_ID);
        }
        return prev.map((turn) =>
          turn.id === TEMP_GENERATING_ID
            ? {
                ...turn,
                isGenerating: false,
                variants: [{
                  ...turn.variants[0],
                  id: crypto.randomUUID(),
                  text: 'Unable to continue the response. Check your API key and try again.',
                  senderRaw: 'AI (Error)',
                }],
              }
            : turn
        );
      });
      setIsSending(false);
    }
  };

  const handleSwitchVariant = (turnId, delta) => {
    setMessages((prev) =>
      prev.map((turn) => {
        if (turn.id !== turnId || !turn.variants || turn.variants.length <= 1) return turn;
        const currentIdx = typeof turn.activeIndex === 'number' ? turn.activeIndex : 0;
        const nextIdx = Math.max(0, Math.min(turn.variants.length - 1, currentIdx + delta));
        return {
          ...turn,
          activeIndex: nextIdx,
        };
      })
    );
  };

  const handleKeyDown = (e) => {
    if (
      e.key === 'Enter'
      && !e.nativeEvent.isComposing
      && (!e.shiftKey || e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const toggleMenu = (msgId) => {
    setActiveMenuId((prev) => (prev === msgId ? null : msgId));
  };

  const handleRevert = (turnIndex) => {
    if (turnIndex >= messages.length - 1) {
      setActiveMenuId(null);
      return;
    }

    setMessages((prev) => prev.slice(0, turnIndex + 1));
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

  return (
    <div className="chat-container" onClick={() => setActiveMenuId(null)}>
      <div className="messages-list">
        {messages.map((turn, index) => {
          const isLastMessage = index === messages.length - 1;
          const isAssistant = turn.sender === 'assistant';
          const canGenerateResponse = isLastMessage
            && isAssistant
            && !String(turn.id).startsWith('intro-');
          const activeVariant = getActiveVariant(turn);
          const variantsList = turn.variants || [activeVariant];
          const hasMultipleVariants = variantsList.length > 1;
          const currentVariantIndex = typeof turn.activeIndex === 'number' ? turn.activeIndex : 0;
          const isBubbleGenerating = activeVariant.id === TEMP_GENERATING_ID;

          return (
            <div key={turn.id} className={`message-wrapper ${turn.sender}`}>
              <div className="message-avatar-container">
                <div className={`message-avatar ${turn.sender === 'user' ? 'user-avatar' : 'bot-avatar'}`}>
                  <img
                    src={turn.sender === 'user' ? userIcon : logo}
                    alt={turn.sender === 'user' ? 'User' : 'MICHIZURE Bot'}
                  />
                </div>
                <div className="avatar-debug-info">
                  <div className="debug-row">
                    <span className="debug-label">Session ID:</span>
                    <span className="debug-val">{sessionId || 'N/A'}</span>
                  </div>
                  <div className="debug-row">
                    <span className="debug-label">Chat ID:</span>
                    <span className="debug-val">{activeVariant.id || turn.id}</span>
                  </div>
                  {turn.sender === 'assistant' && (
                    <div className="debug-row">
                      <span className="debug-label">Model:</span>
                      <span className="debug-val">
                        {activeVariant.model
                          || activeVariant.senderRaw.match(/^AI \((.+)\)$/)?.[1]
                          || 'N/A'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className="message-sender">
                    {turn.sender === 'user' ? 'You' : 'MICHIZURE'}
                  </span>
                  <span className="message-time">{activeVariant.timestamp}</span>
                </div>

                <div className={`message-bubble ${isBubbleGenerating ? 'generating' : ''}`}>
                  {renderMessageText(activeVariant.text)}
                </div>

                {!isBubbleGenerating && (
                  <div className="message-actions-bar">
                  {hasMultipleVariants && (
                    <div className="branch-switcher">
                      <button
                        className="branch-nav-btn"
                        disabled={currentVariantIndex === 0}
                        onClick={() => handleSwitchVariant(turn.id, -1)}
                        title="Previous variant"
                        aria-label="Previous variant"
                      >
                        ◀
                      </button>
                      <span className="branch-indicator">
                        {currentVariantIndex + 1}/{variantsList.length}
                      </span>
                      <button
                        className="branch-nav-btn"
                        disabled={currentVariantIndex === variantsList.length - 1}
                        onClick={() => handleSwitchVariant(turn.id, 1)}
                        title="Next variant"
                        aria-label="Next variant"
                      >
                        ▶
                      </button>
                    </div>
                  )}

                  <button
                    className="msg-action-btn"
                    title={copiedId === turn.id ? 'Copied!' : 'Copy'}
                    aria-label="Copy text"
                    onClick={() => handleCopyMessage(turn.id, activeVariant.text)}
                  >
                    <img src={copyIcon} alt="Copy" className="action-icon" />
                  </button>

                  {canGenerateResponse && (
                    <button
                      className="msg-action-btn"
                      title={isSending ? 'Generating...' : 'Regenerate response'}
                      aria-label="Regenerate response"
                      disabled={isSending}
                      onClick={() => handleRegenerate(turn.id)}
                    >
                      <img src={refreshIcon} alt="Regenerate" className="action-icon" />
                    </button>
                  )}

                  {canGenerateResponse && (
                    <button
                      className="msg-action-btn"
                      title={isSending ? 'Continuing...' : 'Continue response'}
                      aria-label="Continue response"
                      disabled={isSending}
                      onClick={handleContinue}
                    >
                      <img src={fastForwardIcon} alt="Continue" className="action-icon" />
                    </button>
                  )}

                  <div
                    className="message-menu-container"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="msg-action-btn"
                      aria-label="More options"
                      title="More options"
                      onClick={() => toggleMenu(turn.id)}
                    >
                      <img src={threeDotsIcon} alt="Options" className="action-icon dots-icon" />
                    </button>

                    {activeMenuId === turn.id && (
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
                )}
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
            disabled={!input.trim() || isSending}
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
