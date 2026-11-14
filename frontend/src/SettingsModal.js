import React, { useState, useEffect, useRef } from 'react';
import arrowDownIcon from './assets/icons/arrow-down.svg';
import {
  DEFAULT_CHARACTER_PROMPT,
  verifyOpenRouterKeyAndFetchModels,
} from './services/api';
import './Chat.css';

const DEFAULT_INTRO = `*I give you a warm, welcoming hug.*
Hey! How's your day going?`;
const DEFAULT_MODEL = 'openrouter/free';

export function getIntroMessage() {
  const savedIntro = localStorage.getItem('michizure_intro_message');
  return savedIntro !== null ? savedIntro : DEFAULT_INTRO;
}

function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('provider'); // 'provider' | 'character'
  const [provider, setProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [modelSearch, setModelSearch] = useState('');
  const [isModelListOpen, setIsModelListOpen] = useState(false);
  const [verifiedKey, setVerifiedKey] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('idle');
  const [verificationError, setVerificationError] = useState('');
  const [initialApiKey, setInitialApiKey] = useState('');
  const [characterPrompt, setCharacterPrompt] = useState(DEFAULT_CHARACTER_PROMPT);
  const [introMessage, setIntroMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const mouseDownTargetRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setProvider(localStorage.getItem('michizure_provider') || '');
      const savedApiKey = localStorage.getItem('michizure_api_key') || '';
      setApiKey(savedApiKey);
      setInitialApiKey(savedApiKey);
      setSelectedModel(localStorage.getItem('michizure_model') || DEFAULT_MODEL);
      setModelSearch('');
      setIsModelListOpen(false);
      setModels([]);
      setVerifiedKey('');
      setVerificationStatus('idle');
      setVerificationError('');
      setCharacterPrompt(localStorage.getItem('michizure_character_prompt') || DEFAULT_CHARACTER_PROMPT);
      setIntroMessage(getIntroMessage());
      setSaved(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('michizure_provider', provider);
    if (provider === 'openrouter') {
      localStorage.setItem('michizure_api_key', apiKey.trim());
      if (selectedModel) localStorage.setItem('michizure_model', selectedModel);
    } else {
      localStorage.removeItem('michizure_api_key');
      localStorage.removeItem('michizure_model');
    }
    localStorage.setItem('michizure_character_prompt', characterPrompt);
    localStorage.setItem('michizure_intro_message', introMessage);

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 400);
  };

  const handleVerifyApiKey = async () => {
    const key = apiKey.trim();
    if (!key) {
      setVerificationStatus('error');
      setVerificationError('Enter an OpenRouter API key first.');
      return;
    }

    setVerificationStatus('loading');
    setVerificationError('');
    setVerifiedKey('');
    setModels([]);
    try {
      const availableModels = await verifyOpenRouterKeyAndFetchModels(key);
      setModels(availableModels);
      const currentModel = localStorage.getItem('michizure_model') || DEFAULT_MODEL;
      const retainedModel = availableModels.find((model) => model.id === selectedModel)
        || availableModels.find((model) => model.id === currentModel);
      const nextModel = retainedModel?.id || currentModel;
      setSelectedModel(nextModel);
      setModelSearch(retainedModel ? `${retainedModel.name} (${retainedModel.id})` : nextModel);
      setVerifiedKey(key);
      setVerificationStatus('success');
    } catch (error) {
      setVerificationStatus('error');
      setVerificationError(error.message || 'Unable to verify the API key.');
    }
  };

  const handleApiKeyChange = (value) => {
    setApiKey(value);
    setVerifiedKey('');
    setModels([]);
    setVerificationStatus('idle');
    setVerificationError('');
    setSelectedModel('');
    setModelSearch('');
    setIsModelListOpen(false);
  };

  const filteredModels = models.filter((model) =>
    `${model.name} ${model.id}`.toLowerCase().includes(modelSearch.trim().toLowerCase())
  );

  const keyChanged = apiKey.trim() !== initialApiKey.trim();
  const needsVerifiedKey = provider === 'openrouter' && keyChanged && apiKey.trim();
  const canSave = verificationStatus !== 'loading'
    && (!needsVerifiedKey || (
      verifiedKey === apiKey.trim()
      && (selectedModel === DEFAULT_MODEL || models.some((model) => model.id === selectedModel))
    ));

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
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    className="btn-secondary verify-api-key-btn"
                    type="button"
                    onClick={handleVerifyApiKey}
                    disabled={verificationStatus === 'loading' || !apiKey.trim()}
                  >
                    {verificationStatus === 'loading' ? 'Verifying…' : 'Verify key and load models'}
                  </button>
                  {verificationStatus === 'success' && (
                    <span className="setting-status success" role="status">
                      Key verified. {models.length} text models available.
                    </span>
                  )}
                  {verificationStatus === 'error' && (
                    <span className="setting-status error" role="alert">
                      {verificationError}
                    </span>
                  )}
                  <label className="setting-label" htmlFor="model-select">Model</label>
                  <span className="setting-desc">
                    Type to filter the text models available for this API key.
                  </span>
                  <div className="model-picker">
                    <input
                      id="model-select"
                      type="text"
                      className="setting-input"
                      value={modelSearch}
                      disabled={verificationStatus !== 'success'}
                      placeholder={verificationStatus === 'success' ? 'Search models…' : 'Verify key to load models'}
                      autoComplete="off"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={isModelListOpen && filteredModels.length > 0}
                      aria-controls="model-options"
                      onFocus={() => setIsModelListOpen(true)}
                      onBlur={() => setTimeout(() => setIsModelListOpen(false), 120)}
                      onChange={(e) => {
                        setModelSearch(e.target.value);
                        setSelectedModel('');
                        setIsModelListOpen(true);
                      }}
                    />
                    {isModelListOpen && filteredModels.length > 0 && (
                      <div className="model-options" id="model-options" role="listbox">
                        {filteredModels.slice(0, 100).map((model) => (
                          <button
                            key={model.id}
                            className="model-option"
                            type="button"
                            role="option"
                            aria-selected={model.id === selectedModel}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedModel(model.id);
                              setModelSearch(`${model.name} (${model.id})`);
                              setIsModelListOpen(false);
                            }}
                          >
                            <span>{model.name}</span>
                            <small>{model.id}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    {isModelListOpen && modelSearch && filteredModels.length === 0 && (
                      <div className="model-options-empty" role="status">No matching models.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'character' && (
            <div className="tab-pane animate-fade">
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
          <button className="btn-primary" onClick={handleSave} type="button" disabled={!canSave}>
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
export { DEFAULT_INTRO };
