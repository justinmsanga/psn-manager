import React, { useMemo, useState } from 'react';
import { Search, CheckCircle2, Gamepad2, User, Lock, Send, ChevronLeft } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import './SellSlot.css';

const money = (v) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(Number(v || 0));

const SALE_TYPES = [
  ['offline_online', 'Offline + Online'],
  ['offline_only', 'Offline'],
  ['online_only', 'Online'],
];

const SellSlot = ({ onComplete }) => {
  const { games, accounts, transactions, sellSlot, getAccountStats } = useStore();
  const [gameQuery, setGameQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [saleType, setSaleType] = useState('offline_online');
  const [form, setForm] = useState({ price: '', customer: '', note: '', payment: 'paid' });
  const [submitting, setSubmitting] = useState(false);

  const availableGameIds = useMemo(() => new Set(accounts.flatMap((acc) => acc.games)), [accounts]);
  const filteredGames = games.filter((game) => availableGameIds.has(game.id)).filter((game) => game.name.toLowerCase().includes(gameQuery.toLowerCase()));
  const matches = useMemo(() => {
    if (!selectedGame) return [];
    return accounts.filter((account) => account.games.includes(selectedGame.id)).filter((account) => {
      const ps4 = account.slots.ps4.some((slot) => slot.status === 'available');
      const ps5 = account.slots.ps5.some((slot) => slot.status === 'available');
      const reset = [...account.slots.ps4, ...account.slots.ps5].some((slot) => slot.type === 'reset' && slot.status === 'available');
      const profit = getAccountStats(account).profit;
      return filter === 'all' || (filter === 'ps4' && ps4) || (filter === 'ps5' && ps5) || (filter === 'reset' && reset) || (filter === 'recovery' && profit < 0) || (filter === 'profit' && profit >= 0);
    });
  }, [accounts, selectedGame, filter, getAccountStats]);

  // A console still has something to sell if its physical slots aren't exhausted OR its
  // online-only copy hasn't been sold yet - it only fully locks once both are gone.
  const hasOnlineSale = (accountId, consoleType) => transactions.some((t) =>
    t.type === 'slot_sale' && t.saleType === 'online_only' && t.accountId === accountId && t.console === consoleType);

  const chooseSlot = (account, consoleType) => {
    const slots = account.slots[consoleType];
    const normal = slots.find((slot) => slot.type === 'normal' && slot.status === 'available');
    const reset = slots.find((slot) => slot.type === 'reset' && slot.status === 'available');
    const slot = normal || reset || null;
    setSelected({ account, consoleType, slot });
    setSaleType(slot ? 'offline_online' : 'online_only');
    const defaultPrice = consoleType === 'ps5'
      ? selectedGame?.default_ps5_price
      : selectedGame?.default_ps4_price;
    setForm((prev) => ({ ...prev, price: defaultPrice ? String(defaultPrice) : '' }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saleType !== 'online_only' && !selected.slot) {
      alert(`No available ${selected.consoleType.toUpperCase()} slot on this account. Choose "Online", or pick a different account/console.`);
      return;
    }
    setSubmitting(true);
    try {
      await sellSlot({
        accountId: selected.account.id,
        slotId: saleType === 'online_only' ? null : selected.slot.id,
        price: parseFloat(form.price),
        customer: form.customer,
        gameId: selectedGame.id,
        note: form.note,
        payment: form.payment,
        saleType,
        consoleType: selected.consoleType,
      });
      onComplete();
    } catch (error) {
      alert(error.message || 'Could not save sale. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="nexus-page sell-page fade-in">
      <header className="page-top">{selectedGame && <button className="icon-shell" onClick={()=>{setSelectedGame(null); setSelected(null); setFilter('all');}}><ChevronLeft size={21}/></button>}</header>
      {!selectedGame ? <section className="sell-panel"><div className="search-control"><Search size={17}/><input value={gameQuery} onChange={(e)=>setGameQuery(e.target.value)} placeholder="Search FIFA, GTA, Spider-Man..." /></div><div className="game-select-grid">{filteredGames.map((game)=><button key={game.id} onClick={()=>setSelectedGame(game)}><Gamepad2 size={22}/><span>{game.name}</span></button>)}</div></section> : null}
      {selectedGame && !selected ? <><section className="selected-game"><CheckCircle2 size={18}/><span>{selectedGame.name}</span></section><div className="chip-scroll sell-filters">{[['all','All'],['ps4','PS4 available'],['ps5','PS5 available'],['reset','Reset ready'],['recovery','Needs recovery'],['profit','Profitable']].map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div><section className="sell-match-list">{matches.map((account)=>{const stats=getAccountStats(account); return <article key={account.id} className="sell-match-card"><div className="match-top"><div><strong>{account.email}</strong><span>{account.region} - {account.condition}</span></div><b className={stats.profit>=0?'positive':'negative'}>{money(stats.profit)}</b></div><div className="slot-choice-grid"><ConsoleButton account={account} type="ps4" onChoose={chooseSlot} onlineSold={hasOnlineSale(account.id,'ps4')}/><ConsoleButton account={account} type="ps5" onChoose={chooseSlot} onlineSold={hasOnlineSale(account.id,'ps5')}/></div></article>})}</section></> : null}
      {selected ? <form className="sale-form-card" onSubmit={submit}>
        <div className="sale-summary"><Gamepad2 size={18}/><div><strong>{selectedGame.name}</strong><span>{selected.account.email} - {selected.consoleType.toUpperCase()} {selected.slot ? selected.slot.type : 'no slot'}</span></div></div>
        <div className="field-group">
          <span className="field-label">Copy type sold</span>
          <div className="chip-scroll sale-type-picker">{SALE_TYPES.map(([id,label])=>{
            const disabled = (id !== 'online_only' && !selected.slot) || (id === 'online_only' && hasOnlineSale(selected.account.id, selected.consoleType));
            return <button type="button" key={id} disabled={disabled} className={saleType===id?'active':''} onClick={()=>setSaleType(id)}>{label}</button>;
          })}</div>
          {!selected.slot && <small className="sale-type-hint">No physical {selected.consoleType.toUpperCase()} slot available on this account - only &quot;Online&quot; can be sold here.</small>}
          {hasOnlineSale(selected.account.id, selected.consoleType) && <small className="sale-type-hint">The online-only copy for {selected.consoleType.toUpperCase()} on this account is already sold.</small>}
        </div>
        <label><span>Actual negotiated price</span><div><span className="currency-symbol">TSh</span><input type="number" step="0.01" value={form.price} onChange={(e)=>setForm({...form, price:e.target.value})} required/></div></label>
        <label><span>Customer name / phone</span><div><User size={17}/><input value={form.customer} onChange={(e)=>setForm({...form, customer:e.target.value})} placeholder="Optional"/></div></label>
        <label><span>Payment status</span><select value={form.payment} onChange={(e)=>setForm({...form, payment:e.target.value})}><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option></select></label>
        <label><span>Note</span><textarea value={form.note} onChange={(e)=>setForm({...form, note:e.target.value})}/></label>
        <button className="confirm-sale" disabled={submitting}><Send size={18}/> {submitting ? 'Saving...' : 'Confirm sale'}</button>
      </form> : null}
    </div>
  );
};
const ConsoleButton = ({ account, type, onChoose, onlineSold }) => {
  const slots = account.slots[type];
  const normal = slots.find(s => s.type === 'normal' && s.status === 'available');
  const reset = slots.find(s => s.type === 'reset' && s.status === 'available');
  const locked = slots.some(s => s.type === 'reset' && s.status === 'locked');
  const available = normal || reset;
  const doneForGood = !available && onlineSold;
  const label = available ? `${available.type} slot ready` : doneForGood ? 'sold out' : locked ? 'reset locked - online only' : 'sold out - online only';
  return (
    <button type="button" className={`console-pick ${available ? 'available' : 'locked'}`} disabled={doneForGood} onClick={() => onChoose(account, type)}>
      <strong>{type.toUpperCase()}</strong>
      <span>{label}</span>
      {!available && <Lock size={14}/>}
    </button>
  );
};
export default SellSlot;
