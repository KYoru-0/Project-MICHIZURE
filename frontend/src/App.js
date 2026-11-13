import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';
import ChatUI from './ChatUI';
import SettingsModal, { DEFAULT_INTRO } from './SettingsModal';
import './App.css';

const CHAT_STORAGE_KEY = 'michizure_chat_messages';

function createFreshIntroMessage() {
  const savedIntro = localStorage.getItem('michizure_intro_message');
  const introText = savedIntro !== null ? savedIntro : DEFAULT_INTRO;

  return {
    id: 1,
    sender: 'assistant',
    text: introText,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
}

function getInitialMessages() {
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure the very first message is updated to the latest configured intro on page load
        const freshIntro = createFreshIntroMessage();
        parsed[0] = {
          ...parsed[0],
          text: freshIntro.text,
        };
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to parse saved chat messages:', err);
  }

  return [createFreshIntroMessage()];
}

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [messages, setMessages] = useState(getInitialMessages);

  // Sync chat messages to localStorage whenever messages change
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } catch (err) {
      console.error('Failed to save chat messages:', err);
    }
  }, [messages]);

  const handleRefreshChat = () => {
    // When refreshed, reset to a single intro message using the latest saved intro
    const freshChat = [createFreshIntroMessage()];
    setMessages(freshChat);
  };

  return (
    <div className="app">
      <Navbar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshChat={handleRefreshChat}
      />
      <main className="main-chat-area">
        <ChatUI messages={messages} setMessages={setMessages} />
      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
