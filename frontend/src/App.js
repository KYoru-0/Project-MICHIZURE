import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';
import ChatUI from './ChatUI';
import SettingsModal, { getIntroMessage } from './SettingsModal';
import {
  fetchSessionMessages,
  getStoredPath,
  normalizeStoredStep,
  sendAppSyncMessage,
  deleteAllTableMessages,
} from './services/api';
import './App.css';

const SESSION_ID_KEY = 'michizure_session_id';

function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

function groupMessagesIntoTurns(rawMsgs) {
  const storedPath = getStoredPath();
  return rawMsgs
    .map(normalizeStoredStep)
    .filter((step) => step && step.variants.some(
      (variant) => variant.text.trim() !== '' && variant.text !== '__EMPTY__'
    ))
    .map((step) => {
      if (storedPath === null) return step;
      const activeIndex = step.variants.findIndex((variant) => storedPath.includes(variant.id));
      return activeIndex < 0 ? null : { ...step, activeIndex };
    })
    .filter(Boolean);
}

function createIntroTurn(introText, customId = null) {
  const id = customId || 'intro-' + Date.now();
  return {
    id,
    sender: 'assistant',
    activeIndex: 0,
    variants: [
      {
        id,
        text: introText,
        senderRaw: 'AI (MICHIZURE)',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isoTimestamp: new Date().toISOString(),
      },
    ],
  };
}

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);

  const startNewSession = async () => {
    setIsSending(false); // abort any waiting state immediately
    const newSessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, newSessionId);
    setSessionId(newSessionId);

    localStorage.removeItem('michizure_history_until');

    const introText = getIntroMessage();
    const tempIntroTurn = createIntroTurn(introText, 'intro-session');

    setMessages([tempIntroTurn]);

    try {
      const saved = await sendAppSyncMessage({
        content: introText,
        sender: 'AI (MICHIZURE)',
        apiKey: null,
      });

      const savedStep = normalizeStoredStep(saved);
      if (savedStep && localStorage.getItem(SESSION_ID_KEY) === newSessionId) {
        setMessages([savedStep]);
      }
    } catch {
      return;
    }
  };

  useEffect(() => {
    const loadingSessionId = localStorage.getItem(SESSION_ID_KEY);
    async function syncFromDB() {
      try {
        if (!localStorage.getItem(SESSION_ID_KEY)) {
          await startNewSession();
          return;
        }

        const dbMessages = await fetchSessionMessages();
        if (localStorage.getItem(SESSION_ID_KEY) !== loadingSessionId) return;
        const turns = groupMessagesIntoTurns(dbMessages);
        if (turns.length === 0) {
          await startNewSession();
        } else {
          setMessages(turns);
        }
      } catch {
        if (localStorage.getItem(SESSION_ID_KEY) !== loadingSessionId) return;
        const introText = getIntroMessage();
        setMessages([createIntroTurn(introText, 'intro-fallback')]);
      } finally {
        setIsLoading(false);
      }
    }

    syncFromDB();
  }, []);

  const handleRefreshChat = () => {
    startNewSession();
  };

  const handleClearChatCache = async () => {
    localStorage.clear();
    sessionStorage.clear();
    await startNewSession();
  };

  const handleDeleteAllMessages = async () => {
    await deleteAllTableMessages();
    await startNewSession();
  };

  return (
    <div className="app">
      <Navbar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshChat={handleRefreshChat}
        onClearChatCache={handleClearChatCache}
        onDeleteAllMessages={handleDeleteAllMessages}
      />
      <main className="main-chat-area">
        {isLoading ? (
          <div className="loading-chat">Loading conversation…</div>
        ) : (
          <ChatUI
            messages={messages}
            setMessages={setMessages}
            isSending={isSending}
            setIsSending={setIsSending}
            sessionId={sessionId}
          />
        )}
      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
