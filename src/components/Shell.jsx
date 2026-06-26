import React, { useState } from 'react';
import { Home, Landmark, Users, BarChart3, Settings, ShoppingCart, RefreshCcw } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import './Shell.css';

import Dashboard from '../pages/Dashboard';
import Ledger from '../pages/Ledger';
import Accounts from '../pages/Accounts';
import AccountDetails from '../pages/AccountDetails';
import Reports from '../pages/Reports';
import SettingsPage from '../pages/Settings';
import SellSlot from '../pages/SellSlot';

const NAV_ITEMS = [
  { id: 'money', label: 'Money', Icon: Landmark },
  { id: 'accounts', label: 'Accounts', Icon: Users, match: ['accounts', 'account-details'] },
  { id: 'dashboard', label: 'Home', Icon: Home, main: true },
  { id: 'sell', label: 'Sell', Icon: ShoppingCart, sell: true },
  { id: 'reports', label: 'Stats', Icon: BarChart3 },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

const Shell = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const { loading, dbReady, dbError, hasSupabaseConfig, refreshData } = useStore();

  const handleViewDetails = (id) => {
    setSelectedAccountId(id);
    setActiveTab('account-details');
  };

  const isNavActive = (item) => {
    if (item.match) return item.match.includes(activeTab);
    return activeTab === item.id;
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard onAction={(tab) => setActiveTab(tab)} />;
      case 'money': return <Ledger />;
      case 'accounts': return <Accounts onViewDetails={handleViewDetails} />;
      case 'account-details': return <AccountDetails id={selectedAccountId} onBack={() => setActiveTab('accounts')} />;
      case 'sell': return <SellSlot onComplete={() => setActiveTab('accounts')} />;
      case 'reports': return <Reports />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard onAction={(tab) => setActiveTab(tab)} />;
    }
  };

  const showLoader = hasSupabaseConfig && loading;
  const showDbError = hasSupabaseConfig && dbError && !dbReady;

  return (
    <div className="shell">
      {showDbError && (
        <div className="db-banner error">
          <span>{dbError}</span>
          <button type="button" onClick={refreshData}><RefreshCcw size={14} /> Retry</button>
        </div>
      )}
      {hasSupabaseConfig && dbReady && !dbError && (
        <div className="db-banner synced">Synced with Supabase</div>
      )}

      <main className={`shell-content ${showLoader ? 'shell-loading' : ''}`}>
        {showLoader ? (
          <div className="shell-loader">
            <RefreshCcw size={28} className="spin" />
            <p>Loading from Supabase...</p>
          </div>
        ) : renderScreen()}
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${item.main ? 'home-nav' : ''} ${item.sell ? 'sell-nav' : ''} ${isNavActive(item) ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <span className="nav-icon-wrap">
              <item.Icon size={item.main ? 24 : 22} strokeWidth={isNavActive(item) ? 2.5 : 2} />
            </span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Shell;
