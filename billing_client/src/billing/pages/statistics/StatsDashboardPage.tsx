import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { billingApi } from '../../../api/billing/billing-api-service';
import { handleThermalDispatch } from '../../../api/billing/local-print-agent';
import { statsApi, statsData, statsError } from '../../../api/statistics/statistics-api-service';
import ListPagination from '../../components/ListPagination';
import { normalizePage } from '../../components/ListPagination';
import { openBillWhatsApp } from '../../components/whatsAppBill';
import { useBillDetail } from '../account-reports/BillDetailModal';
import '../admin/MonthlyBills.css';
import '../master/Master.css';
import './Stats.css';

type Day = { date: string; sales: number; purchase: number };
type BillCard = {
  billId: number;
  billDisplay: string;
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
  payable: number;
  paymentMode: number;
  isTaxBill: number;
  stateLabel: string;
  exchanged?: boolean;
  returned?: boolean;
  exchPoint?: number;
};
type Dash = {
  year: number; month: number; label: string;
  sales: number; lastSales: number; salesPct: number;
  purchase: number; lastPurchase: number; purchasePct: number;
  expense: number; lastExpense: number; expensePct: number;
  profit: number; lastProfit: number; profitPct: number;
  netProfit: number; todaySales: number; todayBills: number; daily: Day[];
  exchPoint?: number;
  bills?: BillCard[];
};

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SALES = '#3b82f6';
const PURCHASE = '#f97316';
const EXPENSE = '#a78bfa';

const n = (v?: number) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const trend = (pct: number, last: number) => last === 0 ? '— No prev. data' : `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs last month`;
const compact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
};

const inr = (v?: number) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d: string) => {
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtTime = (t: string) => {
  const parts = String(t || '').split(':');
  if (parts.length < 2) return t || '';
  let h = Number(parts[0]);
  if (!Number.isFinite(h)) return t;
  const m = parts[1];
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

const payLabel = (mode: number) => (mode === 2 ? 'Bank' : mode === 3 ? 'Mixed' : 'Cash');

const useNarrow = () => {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
};

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.dataKey === 'sales' || p.dataKey === 'purchase');
  if (!rows.length) return null;
  const title = rows[0]?.payload?.label || label;
  return (
    <div className="st-tip">
      <div className="st-tip-d">{title}</div>
      {rows.map((p: any) => (
        <div key={p.dataKey} className="st-tip-row">
          <i style={{ background: p.fill || p.color }} />
          <span>{p.name}</span>
          <b>₹ {n(p.value)}</b>
        </div>
      ))}
    </div>
  );
};

const PieTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="st-tip">
      <div className="st-tip-row">
        <i style={{ background: p.payload.color }} />
        {p.name}: ₹ {n(p.value)} ({((p.percent || 0) * 100).toFixed(1)}%)
      </div>
    </div>
  );
};

const StatsDashboardPage: React.FC = () => {
  const narrow = useNarrow();
  const now = new Date();
  const navigate = useNavigate();
  const { openBill, billModal } = useBillDetail();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<Dash | null>(null);
  const [bills, setBills] = useState<BillCard[]>([]);
  const [billsTotal, setBillsTotal] = useState(0);
  const [billPage, setBillPage] = useState(0);
  const BILL_PAGE_SIZE = 12;
  const [pieIndex, setPieIndex] = useState(0);

  const loadBills = async (y: number, m: number, p = billPage) => {
    try {
      const res: any = await billingApi.monthBills(y, m, p, BILL_PAGE_SIZE);
      if (res?.success) {
        const pg = normalizePage<BillCard>(res.data);
        setBills(pg.items);
        setBillsTotal(pg.total);
        setBillPage(pg.page);
      } else {
        setBills([]);
        setBillsTotal(0);
      }
    } catch {
      setBills([]);
      setBillsTotal(0);
    }
  };

  const load = async (y = year, m = month) => {
    try {
      const dash = statsData<Dash>(await statsApi.dashboard(y, m));
      setData(dash);
      setBillPage(0);
      await loadBills(y, m, 0);
    } catch (err) {
      toast.error(statsError(err, 'Could not load dashboard'));
    }
  };

  useEffect(() => { load(); }, []);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() + 1 - i);
  const daily = data?.daily || [];
  const pieData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Sales', value: Math.max(0, Number(data.sales || 0)), color: SALES },
      { name: 'Purchase', value: Math.max(0, Number(data.purchase || 0)), color: PURCHASE },
      { name: 'Expense', value: Math.max(0, Number(data.expense || 0)), color: EXPENSE },
    ].filter((s) => s.value > 0);
  }, [data]);
  const pieTotal = pieData.reduce((sum, s) => sum + s.value, 0);
  const chartDays = useMemo(() => daily.map((d) => ({
    ...d,
    label: String(d.date || ''),
    day: String(d.date || '').slice(0, 2),
  })), [daily]);
  const chartH = narrow ? 210 : 280;
  const pieH = narrow ? 180 : 230;

  const printBill = async (billNo: string) => {
    try {
      const res: any = await billingApi.dispatchPrint(billNo);
      const result = await handleThermalDispatch(res, (no) => {
        navigate(`/app/billing/print/${encodeURIComponent(no || billNo)}`);
      });
      if (result === 'printed' || result === 'local') {
        toast.success('Receipt printed');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.data?.error || err?.message || 'Print failed');
    }
  };

  const whatsApp = (card: BillCard) => {
    void openBillWhatsApp(card).catch(() => toast.error('Could not open WhatsApp'));
  };

  return (
    <div className="mst-page">
      <div className="mst-card st-filter" style={{ marginBottom: 12 }}>
        <div className="mst-card-b st-filter-row">
          <div className="mst-fg">
            <label>Year</label>
            <select className="mst-sel" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="mst-fg">
            <label>Month</label>
            <select className="mst-sel" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {months.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </div>
          <div className="st-filter-acts">
            <button className="mst-btn mst-btn-primary" type="button" onClick={() => load()}>Load</button>
            {(year !== now.getFullYear() || month !== now.getMonth() + 1) && (
              <button className="mst-btn mst-btn-outline" type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); load(now.getFullYear(), now.getMonth() + 1); }}>Current Month</button>
            )}
          </div>
        </div>
      </div>
      {data && (
        <>
          <div className="st-kpis">
            <div className="st-kpi sales">
              <i className="st-kpi-bg fas fa-file-invoice" aria-hidden="true" />
              <div className="st-kpi-l">Total Sales</div>
              <div className="st-kpi-v">₹ {n(data.sales)}</div>
              <div className="st-kpi-t">{trend(data.salesPct, data.lastSales)}</div>
              {Number(data.exchPoint) > 0 && <div className="st-kpi-t">Includes ₹ {n(data.exchPoint)} exchange point</div>}
            </div>
            <div className="st-kpi purchase">
              <i className="st-kpi-bg fas fa-truck" aria-hidden="true" />
              <div className="st-kpi-l">Total Purchase</div>
              <div className="st-kpi-v">₹ {n(data.purchase)}</div>
              <div className="st-kpi-t">{trend(data.purchasePct, data.lastPurchase)}</div>
            </div>
            <div className="st-kpi expense">
              <i className="st-kpi-bg fas fa-money-bill-wave" aria-hidden="true" />
              <div className="st-kpi-l">Total Expense</div>
              <div className="st-kpi-v">₹ {n(data.expense)}</div>
              <div className="st-kpi-t">{trend(data.expensePct, data.lastExpense)}</div>
            </div>
            <div className={`st-kpi profit ${data.netProfit >= 0 ? 'up' : 'down'}`}>
              <i className={`st-kpi-bg fas ${data.netProfit >= 0 ? 'fa-chart-line' : 'fa-arrow-trend-down'}`} aria-hidden="true" />
              <div className="st-kpi-l">Net Profit</div>
              <div className="st-kpi-v">₹ {n(data.netProfit)}</div>
              <div className="st-kpi-t">{trend(data.profitPct, data.lastProfit)}</div>
            </div>
          </div>
          <div className="mst-note st-today">Today: ₹ {n(data.todaySales)} across {data.todayBills} bills · Showing {data.label}</div>
          <div className="st-charts">
            <div className="mst-card">
              <div className="mst-card-h">Daily Sales vs Purchase — {data.label}</div>
              <div className="mst-card-b st-chart-body">
                {chartDays.length === 0 ? (
                  <div className="mst-empty">No days in this month.</div>
                ) : (
                  <>
                    <div className="mst-note" style={{ marginBottom: 8 }}>Every day of the month</div>
                    <div className="st-chart-desk">
                      <div className="st-chart-scroll">
                        <div style={{ width: Math.max(chartDays.length, 2) * (narrow ? 44 : 32), height: chartH }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartDays} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barGap={2} barCategoryGap="8%">
                              <defs>
                                <linearGradient id="salesBar" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#60a5fa" />
                                  <stop offset="100%" stopColor={SALES} />
                                </linearGradient>
                                <linearGradient id="purchaseBar" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#fdba74" />
                                  <stop offset="100%" stopColor={PURCHASE} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                              <XAxis dataKey="day" tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                              <YAxis tickFormatter={compact} tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Bar dataKey="sales" name="Sales" fill="url(#salesBar)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                              <Bar dataKey="purchase" name="Purchase" fill="url(#purchaseBar)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="mst-card">
              <div className="mst-card-h">Month Mix — {data.label}</div>
              <div className="mst-card-b st-chart-body st-pie-wrap">
                {pieTotal <= 0 ? (
                  <div className="mst-empty">No sales, purchase, or expense in this month.</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={pieH}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={narrow ? 48 : 58}
                          outerRadius={narrow ? 74 : 88}
                          paddingAngle={3}
                          onMouseEnter={(_, i) => setPieIndex(i)}
                          onClick={(_, i) => setPieIndex(i)}
                        >
                          {pieData.map((s, i) => (
                            <Cell key={s.name} fill={s.color} stroke="var(--color-bg-surface)" strokeWidth={pieIndex === i ? 3 : 2} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="st-pie-legend">
                      {pieData.map((s, i) => (
                        <button key={s.name} type="button" className={`st-pie-leg ${pieIndex === i ? 'on' : ''}`} onClick={() => setPieIndex(i)}>
                          <i style={{ background: s.color }} />
                          <span>{s.name}</span>
                          <b>₹ {n(s.value)}</b>
                          <em>{((s.value / pieTotal) * 100).toFixed(1)}%</em>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mst-card" style={{ marginTop: 12 }}>
            <div className="mst-card-h">Bills — {data.label} ({billsTotal})</div>
            <div className="mst-card-b">
              {bills.length === 0 ? (
                <div className="mst-empty">No bills in this month.</div>
              ) : (
                <div className="mb-cards">
                  {bills.map((card) => (
                    <article className="mb-card" key={card.billId}>
                      <div className="mb-card-body">
                        <div>
                          <h3 className="mb-name">{card.customerName || 'Walk-in'}</h3>
                          <p className="mb-invoice">Sales Invoice #{card.billDisplay}</p>
                          <p className="mb-meta">
                            {fmtDate(card.date)} · {fmtTime(card.time)}
                            {card.customerPhone ? ` · ${card.customerPhone}` : ''}
                          </p>
                          <div className="mb-chips">
                            <span className="mb-chip">{payLabel(card.paymentMode)}</span>
                            {card.isTaxBill === 1 && <span className="mb-chip">GST</span>}
                            {card.stateLabel && <span className="mb-chip">{card.stateLabel}</span>}
                            {card.exchanged && <span className="mb-chip exch">Exchanged</span>}
                            {card.returned && <span className="mb-chip ret">Returned</span>}
                          </div>
                        </div>
                        <div className="mb-amt">
                          {inr(Number(card.payable || 0) + Number(card.exchPoint || 0))}
                          {Number(card.exchPoint) > 0 && <small>Exch. {inr(card.exchPoint)}</small>}
                        </div>
                      </div>
                      <div className="mb-actions mb-actions-3">
                        <button className="mb-act" type="button" onClick={() => openBill(card.billDisplay)}>
                          <i className="fas fa-eye" /> View
                        </button>
                        <button className="mb-act mb-act-print" type="button" onClick={() => printBill(card.billDisplay)}>
                          <i className="fas fa-print" /> Print
                        </button>
                        <button className="mb-act mb-act-wa" type="button" onClick={() => whatsApp(card)}>
                          <i className="fab fa-whatsapp" /> WhatsApp
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <ListPagination
                page={billPage}
                size={BILL_PAGE_SIZE}
                total={billsTotal}
                onChange={(p) => loadBills(year, month, p)}
              />
            </div>
          </div>
        </>
      )}
      {billModal}
    </div>
  );
};

export default StatsDashboardPage;
