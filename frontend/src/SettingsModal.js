import React, { useState, useEffect, useRef } from 'react';
import arrowDownIcon from './assets/icons/arrow-down.svg';
import './Chat.css';

const DEFAULT_INTRO = 'Welcome to Project:MICHIZURE! I am your AI companion. Feel free to ask anything or configure your API key in settings to get started.';

function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('provider'); // 'provider' | 'character'
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [characterPrompt, setCharacterPrompt] = useState('');
  const [introMessage, setIntroMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const mouseDownTargetRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setProvider(localStorage.getItem('michizure_provider') || '');
      setApiKey(localStorage.getItem('michizure_api_key') || '');
      setCharacterPrompt(localStorage.getItem('michizure_character_prompt') || '');
      const savedIntro = localStorage.getItem('michizure_intro_message');
      setIntroMessage(savedIntro !== null ? savedIntro : DEFAULT_INTRO);
      setSaved(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('michizure_provider', provider);
    if (provider === 'openrouter') {
      localStorage.setItem('michizure_api_key', apiKey.trim());
    }
    localStorage.setItem('michizure_character_prompt', characterPrompt);
    localStorage.setItem('michizure_intro_message', introMessage);

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 400);
  };

  const handleMouseDown = (e) => {
    mouseDownTargetRef.current = e.target;
  };

  const handleMouseUp = (e) => {
    if (
      mouseDownTargetRef.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      onClose();
    }
    mouseDownTargetRef.current = null;
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Settings</h3>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'provider' ? 'active' : ''}`}
            onClick={() => setActiveTab('provider')}
            type="button"
          >
            Provider
          </button>
          <button
            className={`modal-tab ${activeTab === 'character' ? 'active' : ''}`}
            onClick={() => setActiveTab('character')}
            type="button"
          >
            Character
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'provider' && (
            <div className="tab-pane animate-fade">
              <div className="setting-group">
                <label className="setting-label" htmlFor="provider-select">Provider</label>
                <span className="setting-desc">
                  Select the LLM provider service you want to use.
                </span>
                <div className="custom-select-wrapper">
                  <select
                    id="provider-select"
                    className="setting-select"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    <option value="">Choose a provider</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                  <img
                    src={arrowDownIcon}
                    alt=""
                    className="select-arrow-icon"
                    aria-hidden="true"
                  />
                </div>
              </div>

              {provider === 'openrouter' && (
                <div className="setting-group animate-fade">
                  <label className="setting-label" htmlFor="api-key-input">OpenRouter API Key</label>
                  <span className="setting-desc">
                    Your API key will be saved locally in your browser.
                  </span>
                  <input
                    id="api-key-input"
                    type="password"
                    className="setting-input"
                    placeholder="sk-or-v1-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'character' && (
            <div className="tab-pane animate-fade">
              {/* Intro Message */}
              <div className="setting-group">
                <div className="setting-header-row">
                  <label className="setting-label" htmlFor="intro-textarea">
                    Intro Message
                  </label>
                  <span className="char-count">
                    {introMessage.length} / 500
                  </span>
                </div>
                <span className="setting-desc">
                  The initial greeting message MICHIZURE sends in every new chat.
                </span>
                <textarea
                  id="intro-textarea"
                  className="setting-textarea intro-textarea"
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. Welcome to Project:MICHIZURE! How can I assist you today?"
                  value={introMessage}
                  onChange={(e) => setIntroMessage(e.target.value)}
                />
              </div>

              {/* Character Persona */}
              <div className="setting-group">
                <div className="setting-header-row">
                  <label className="setting-label" htmlFor="character-textarea">
                    Character Instructions / Persona
                  </label>
                  <span className="char-count">
                    {characterPrompt.length} / 2000
                  </span>
                </div>
                <span className="setting-desc">
                  Define how your AI companion should speak, behave, and respond.
                </span>
                <textarea
                  id="character-textarea"
                  className="setting-textarea"
                  maxLength={2000}
                  rows={6}
                  placeholder="e.g. You are a calm, knowledgeable assistant who gives concise answers and loves coding..."
                  value={characterPrompt}
                  onChange={(e) => setCharacterPrompt(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} type="button">
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
export { DEFAULT_INTRO };
