import React from 'react';
import logo from './assets/icons/256.png';
import userIcon from './assets/icons/user.svg';
import settingsIcon from './assets/icons/settings.svg';
import refreshIcon from './assets/icons/refresh.svg';
import './Navbar.css';

function Navbar({ onOpenSettings, onRefreshChat }) {
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
          {/* Refresh chat button */}
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

          {/* Settings button */}
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

          <div className="navbar-user">
            <div className="user-tooltip-wrapper">
              <button className="user-profile-btn" aria-label="User profile">
                <span className="user-avatar-circle">
                  <img src={userIcon} alt="User profile" className="user-icon" />
                </span>
                <span className="user-name">KYoru</span>
              </button>
              <div className="user-tooltip" role="tooltip">
                This is a fake button for now!
                <br />
                Later people will be able to log in and share their own chat sessions!
                <br />
                Please standby!!
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
