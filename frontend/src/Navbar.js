import React, { useState, useEffect, useRef } from 'react';
import logo from './assets/icons/256.png';
import userIcon from './assets/icons/user.svg';
import settingsIcon from './assets/icons/settings.svg';
import refreshIcon from './assets/icons/refresh.svg';
import './Navbar.css';

function Navbar({ onOpenSettings, onRefreshChat, onClearChatCache, onDeleteAllMessages }) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const handleDeleteAll = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete ALL messages from the cloud database?\n\nThis cannot be undone.'
    );
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      await onDeleteAllMessages();
      setIsUserMenuOpen(false);
    } catch (err) {
      alert('Failed to delete messages: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearCache = async () => {
    const confirmed = window.confirm(
      'Clear all locally stored app data, including your API key and settings, then start a fresh chat? Cloud messages will not be deleted.'
    );
    if (!confirmed) return;

    try {
      setIsClearingCache(true);
      await onClearChatCache();
      setIsUserMenuOpen(false);
    } catch (err) {
      alert('Failed to clear local app data: ' + (err.message || 'Unknown error'));
    } finally {
      setIsClearingCache(false);
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-container">
        <a href="/" className="navbar-brand">
          <div className="logo-container">
            <img src={logo} alt="Project:MICHIZURE Logo" className="navbar-logo" />
          </div>
          <span className="brand-text">
            <span className="brand-prefix">Project:</span>
            <span className="brand-accent">MICHIZURE</span>
          </span>
        </a>

        <div className="navbar-actions">
          <div className="navbar-btn-wrapper">
            <button
              className="navbar-icon-btn"
              aria-label="Refresh chat"
              title="Refresh chat (clears chat except first message)"
              onClick={onRefreshChat}
            >
              <img src={refreshIcon} alt="Refresh Chat" className="navbar-btn-icon" />
            </button>
          </div>

          <div className="navbar-btn-wrapper">
            <button
              className="navbar-icon-btn"
              aria-label="Settings"
              title="Settings (API Key & Character)"
              onClick={onOpenSettings}
            >
              <img src={settingsIcon} alt="Settings" className="navbar-btn-icon" />
            </button>
          </div>

          <div className="navbar-user" ref={userMenuRef}>
            <div className="user-menu-wrapper">
              <button
                className={`user-profile-btn ${isUserMenuOpen ? 'active' : ''}`}
                aria-label="User profile menu"
                aria-haspopup="true"
                aria-expanded={isUserMenuOpen}
                onClick={() => setIsUserMenuOpen((prev) => !prev)}
              >
                <span className="user-avatar-circle">
                  <img src={userIcon} alt="User profile" className="user-icon" />
                </span>
                <span className="user-name">KYoru</span>
              </button>

              {isUserMenuOpen && (
                <div className="user-dropdown-menu" role="menu">
                  <div className="user-dropdown-header">
                    <span className="user-dropdown-title">KYoru</span>
                    <span className="user-dropdown-badge">Online</span>
                  </div>

                  <div className="user-dropdown-divider" />

                  <button
                    className="user-dropdown-item"
                    onClick={handleClearCache}
                    disabled={isClearingCache}
                    role="menuitem"
                  >
                    <svg
                      className="dropdown-item-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v5M14 11v5" />
                    </svg>
                    <span>{isClearingCache ? 'Clearing local app data...' : 'Clear All Local Data'}</span>
                  </button>

                  <button
                    className="user-dropdown-item danger"
                    onClick={handleDeleteAll}
                    disabled={isDeleting}
                    role="menuitem"
                  >
                    <svg
                      className="dropdown-item-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    <span>{isDeleting ? 'Deleting messages...' : 'Delete All Table Messages'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
