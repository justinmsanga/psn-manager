import React, { useMemo, useState } from 'react';
import { BarChart3, Crown, CalendarDays, Download, RotateCcw, TrendingUp } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import './Reports.css';

const money = (v) => new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(Number(v || 0));
const Reports = () => {
  const { accounts, transactions, walletStats, games } = useStore();
  const [period, setPeriod] = useState('month');
  const topGames = useMemo(() => {
    const map = new Map();
    transactions.filter(t=>t.type==='slot_sale').forEach((tx)=>{ const name=(tx.note||'').replace('Sold slot for game: ','') || 'Unknown'; map.set(name,(map.get(name)||0)+tx.amount); });
    return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  }, [transactions]);
  const resetList = accounts.filter(a=>a.nextDeactivation).slice(0,6);
  const unrecovered = accounts.filter((a)=>a.revenue < (a.purchaseCost + a.psnDeposits));
  return <div className="nexus-page reports-page fade-in"><header className="page-top"><div><span className="eyebrow">Business intelligence</span><h1>Reports</h1><p>Profit, reset timing, and game performance.</p></div><button className="icon-shell"><Download size={20}/></button></header><div className="chip-scroll report-periods">{['today','week','month','all time'].map(p=><button key={p} className={period===p?'active':''} onClick={()=>setPeriod(p)}>{p}</button>)}</div><section className="report-hero"><div><span>Sales revenue</span><strong>{money(walletStats.revenue)}</strong><small>{period} performance</small></div><div className="mini-bars">{[32,62,46,78,52,88,69].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div></section><section className="report-grid"><ReportCard icon={<TrendingUp/>} label="Profit / loss" value={money(walletStats.profit)} tone={walletStats.profit>=0?'positive':'negative'}/><ReportCard icon={<BarChart3/>} label="Total invested" value={money(walletStats.totalInvested)}/><ReportCard icon={<Crown/>} label="Best game" value={topGames[0]?.[0] || 'No sales'}/><ReportCard icon={<RotateCcw/>} label="Unrecovered" value={unrecovered.length}/></section><section className="report-card"><h3>Top Games</h3>{topGames.length?topGames.map(([name,total],i)=><div className="rank-row" key={name}><span>#{i+1}</span><strong>{name}</strong><b>{money(total)}</b></div>):<p className="empty-line">No sales yet.</p>}</section><section className="report-card"><h3>Reset Schedule</h3>{resetList.length?resetList.map((account)=><div className="rank-row" key={account.id}><CalendarDays size={16}/><strong>{account.email}</strong><b>{account.nextDeactivation}</b></div>):<p className="empty-line">No reset dates yet.</p>}</section></div>;
};
const ReportCard = ({ icon, label, value, tone='' }) => <div className={`report-mini ${tone}`}><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>;
export default Reports;