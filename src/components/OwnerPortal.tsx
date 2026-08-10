import React, { useEffect, useState } from "react";
import { LogOut, Bell, DollarSign, CircleCheck as CheckCircle, Circle as XCircle, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { Theme } from "../hooks/useTheme";
import { api } from "../services/api";

// Helper to format INR
const formatINR = (n: number) =>
  "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface InventoryRow {
  inventoryId: string;
  productName: string;
  productColor?: string;
  form: string;
  thickness_mm?: number;
  length_mm?: number;
  width_mm?: number;
  sheetsQty?: number;
  remainingArea_mm2?: number;
  purchasePricePerSheet?: number | null;
  purchaseDate?: string;
  rack?: string;
  status?: string;
  BarcodeId?: string;
  visualLink?: string | null;
  estimatedValueINR?: number | null;
}

type OwnerTab = "inventory" | "remnants" | "alerts" | "approvals" | "ai";

export function OwnerPortal({
  onBack,
  theme,
  initialTab = "inventory",
}: {
  onBack: () => void;
  theme: Theme;
  initialTab?: OwnerTab;
}) {
  const { user } = useAuth();

  const [summary, setSummary] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<OwnerTab>(initialTab);

  // Keep the open tab in sync when navigated here from a different sidebar link
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // inventory pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // search/filter
  const [search, setSearch] = useState("");
  const [formFilter, setFormFilter] = useState("");

  // alerts and approvals
  const [needsPriceAlerts, setNeedsPriceAlerts] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  // AI chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ from: "user" | "ai"; text: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetchSummary();
    fetchInventory(page, pageSize, search, formFilter);
    fetchAlerts();
    fetchApprovals();
  }, []);

  useEffect(() => {
    fetchInventory(page, pageSize, search, formFilter);
  }, [page, search, formFilter]);

  async function fetchSummary() {
    const res = await api.getOwnerSummary();
    if (res.success) {
      setSummary(res.data);
    } else {
      console.error("summary fetch failed:", res.error);
    }
  }

  async function fetchInventory(p = 1, ps = 12, s = "", form = "") {
    setLoading(true);
    const res = await api.getOwnerInventory(p, ps, s, form);
    if (res.success) {
      const payload = res.data || {};
      setItems(payload.items || (Array.isArray(payload) ? payload : []) || []);
      setTotal(payload.total ?? (Array.isArray(payload) ? payload.length : 0));
    } else {
      console.error("inventory fetch failed:", res.error);
    }
    setLoading(false);
  }

  async function fetchAlerts() {
    const res = await api.getOwnerAlerts();
    if (res.success) {
      const payload = res.data;
      setNeedsPriceAlerts(Array.isArray(payload) ? payload : payload?.items || []);
    } else {
      console.error("alerts fetch failed:", res.error);
    }
  }

  async function fetchApprovals() {
    const res = await api.getOwnerApprovals();
    if (res.success) {
      const payload = res.data;
      setPendingApprovals(Array.isArray(payload) ? payload : payload?.items || []);
    } else {
      console.error("approvals fetch failed:", res.error);
    }
  }

  async function handleSavePrice(inventoryId: string, priceStr: string) {
    const price = Number(priceStr);
    if (isNaN(price)) return alert("Enter valid rupee number");
    const res = await api.setOwnerPrice(inventoryId, price);
    if (res.success) {
      await fetchSummary();
      await fetchAlerts();
      await fetchInventory(page, pageSize, search, formFilter);
      alert("Price saved");
    } else {
      console.error(res.error);
      alert("Failed to save");
    }
  }

  async function handleApprove(cutOrderId: string, approve: boolean) {
    const res = await api.approveOwnerCutplan(cutOrderId, approve);
    if (res.success) {
      fetchApprovals();
      fetchInventory(page, pageSize, search, formFilter);
      alert("Action saved");
    } else {
      console.error(res.error);
      alert("Failed to update");
    }
  }

  async function handleChatSubmit() {
    if (!chatInput) return;
    setChatMessages(m => [...m, { from: "user", text: chatInput }]);
    setAiLoading(true);
    const prompt = chatInput;
    setChatInput("");
    const res = await api.queryAI(prompt);
    if (res.success) {
      const answer = typeof res.data === "string" ? res.data : res.data?.answer || "No answer";
      setChatMessages(m => [...m, { from: "ai", text: answer }]);
    } else {
      console.error(res.error);
      setChatMessages(m => [...m, { from: "ai", text: "Error getting response" }]);
    }
    setAiLoading(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onBack();
  };

  return (
    <div className={`min-h-screen p-4 ${
      theme === 'dark' 
        ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' 
        : 'bg-gradient-to-br from-blue-50 to-indigo-100'
    }`}>
      <div className="max-w-6xl mx-auto pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={`text-2xl font-bold ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>Owner Portal</h1>
            <p className={theme === 'dark' ? 'text-white/70' : 'text-gray-600'}>{user?.email}</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleLogout} className={`flex items-center gap-2 ${
              theme === 'dark' ? 'text-white/80' : 'text-gray-600'
            }`}>
              <LogOut className="w-4 h-4"/> Logout
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className={`p-4 rounded-2xl border backdrop-blur-md ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${
                  theme === 'dark' ? 'text-white/70' : 'text-gray-600'
                }`}>Total Inventory Items</p>
                <p className={`text-xl font-semibold ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>{summary?.totalInventoryCount ?? "-"}</p>
              </div>
              <Bell className={theme === 'dark' ? 'text-white/60' : 'text-gray-500'}/>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border backdrop-blur-md ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <p className={`text-sm ${
              theme === 'dark' ? 'text-white/70' : 'text-gray-600'
            }`}>Total Inventory Value</p>
            <p className={`text-xl font-semibold ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>{summary ? formatINR(summary.totalInventoryValueINR || 0) : "-"}</p>
          </div>

          <div className={`p-4 rounded-2xl border backdrop-blur-md ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <p className={`text-sm ${
              theme === 'dark' ? 'text-white/70' : 'text-gray-600'
            }`}>Total Remnant Value</p>
            <p className={`text-xl font-semibold ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>{summary ? formatINR(summary.totalRemnantValueINR || 0) : "-"}</p>
          </div>

          <div className={`p-4 rounded-2xl border backdrop-blur-md ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <p className={`text-sm ${
              theme === 'dark' ? 'text-white/70' : 'text-gray-600'
            }`}>Total Investment Locked</p>
            <p className={`text-xl font-semibold ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>{summary ? formatINR((summary.totalInventoryValueINR || 0) + (summary.totalRemnantValueINR || 0)) : "-"}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className={`backdrop-blur-md rounded-2xl border overflow-hidden ${
          theme === 'dark'
            ? 'bg-white/10 border-white/20'
            : 'bg-white/40 border-white/50'
        }`} style={{
          backdropFilter: 'blur(12px)',
          boxShadow: theme === 'dark' 
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
            : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
        }}>
          <div className="flex">
            <button onClick={() => setActiveTab("inventory")} className={`flex-1 py-3 ${
              activeTab === 'inventory' 
                ? theme === 'dark' ? 'bg-white/20 text-white' : 'bg-white/60 text-gray-800'
                : theme === 'dark' ? 'text-white/60' : 'text-gray-600'
            }`}>Inventory</button>
            <button onClick={() => setActiveTab("remnants")} className={`flex-1 py-3 ${
              activeTab === 'remnants' 
                ? theme === 'dark' ? 'bg-white/20 text-white' : 'bg-white/60 text-gray-800'
                : theme === 'dark' ? 'text-white/60' : 'text-gray-600'
            }`}>Remnants</button>
            <button onClick={() => setActiveTab("alerts")} className={`flex-1 py-3 ${
              activeTab === 'alerts' 
                ? theme === 'dark' ? 'bg-white/20 text-white' : 'bg-white/60 text-gray-800'
                : theme === 'dark' ? 'text-white/60' : 'text-gray-600'
            }`}>Needs Price</button>
            <button onClick={() => setActiveTab("approvals")} className={`flex-1 py-3 ${
              activeTab === 'approvals' 
                ? theme === 'dark' ? 'bg-white/20 text-white' : 'bg-white/60 text-gray-800'
                : theme === 'dark' ? 'text-white/60' : 'text-gray-600'
            }`}>Approvals</button>
            <button onClick={() => setActiveTab("ai")} className={`flex-1 py-3 ${
              activeTab === 'ai' 
                ? theme === 'dark' ? 'bg-white/20 text-white' : 'bg-white/60 text-gray-800'
                : theme === 'dark' ? 'text-white/60' : 'text-gray-600'
            }`}>AI Bot</button>
          </div>

          <div className="p-6">
            {activeTab === "inventory" && (
              <div>
                {/* Search & filters */}
                <div className="flex gap-3 mb-4">
                  <div className="relative flex-1">
                    <input 
                      placeholder="Search product name or barcode" 
                      value={search} 
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
                      className={`w-full p-3 rounded-lg ${
                        theme === 'dark'
                          ? 'bg-white/5 text-white placeholder-white/50'
                         : 'bg-white/50 border border-gray-300 text-gray-800 placeholder-gray-500 focus:border-blue-400'
                      }`}
                    />
                    <Search className={`absolute right-3 top-3 ${
                      theme === 'dark' ? 'text-white/50' : 'text-gray-500'
                    }`} />
                  </div>
                  <input 
                    placeholder="Form (typed)" 
                    value={formFilter} 
                    onChange={(e)=> { setFormFilter(e.target.value); setPage(1); }} 
                    className={`p-3 rounded-lg w-56 ${
                      theme === 'dark'
                        ? 'bg-white/5 text-white placeholder-white/50'
                       : 'bg-white/50 border border-gray-300 text-gray-800 placeholder-gray-500 focus:border-blue-400'
                    }`} 
                  />
                </div>

                {/* Table */}
                <div className="overflow-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className={theme === 'dark' ? 'text-white/60' : 'text-gray-600'}>
                        <th className="p-3">Product</th>
                        <th className="p-3">Form</th>
                        <th className="p-3">Dims (L×W mm)</th>
                        <th className="p-3">Thick (mm)</th>
                        <th className="p-3">Qty</th>
                        <th className="p-3">Price/Sheet (₹)</th>
                        <th className="p-3">Estimated Value</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={8} className={`p-6 text-center ${
                          theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                        }`}>Loading...</td></tr>
                      ) : items.length === 0 ? (
                        <tr><td colSpan={8} className={`p-6 text-center ${
                          theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                        }`}>No inventory</td></tr>
                      ) : items.map((it) => (
                        <tr key={it.inventoryId} className={`border-t ${
                          theme === 'dark' ? 'border-white/10' : 'border-gray-200'
                        }`}>
                          <td className="p-3 align-top">
                            <div className={`font-medium ${
                              theme === 'dark' ? 'text-white' : 'text-gray-800'
                            }`}>{it.productName}</div>
                            <div className={`text-xs ${
                              theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                            }`}>{it.productColor}</div>
                          </td>
                          <td className={`p-3 ${
                            theme === 'dark' ? 'text-white' : 'text-gray-800'
                          }`}>{it.form}</td>
                          <td className={`p-3 ${
                            theme === 'dark' ? 'text-white' : 'text-gray-800'
                          }`}>{it.length_mm} × {it.width_mm}</td>
                          <td className={`p-3 ${
                            theme === 'dark' ? 'text-white' : 'text-gray-800'
                          }`}>{it.thickness_mm}</td>
                          <td className={`p-3 ${
                            theme === 'dark' ? 'text-white' : 'text-gray-800'
                          }`}>{it.sheetsQty || "-"}</td>
                          <td className={`p-3 ${
                            theme === 'dark' ? 'text-white' : 'text-gray-800'
                          }`}>{it.purchasePricePerSheet ? formatINR(it.purchasePricePerSheet) : "-"}</td>
                          <td className={`p-3 ${
                            theme === 'dark' ? 'text-white' : 'text-gray-800'
                          }`}>{it.estimatedValueINR ? formatINR(it.estimatedValueINR) : "-"}</td>
                          <td className="p-3">
                            <div className="flex gap-2">
                              <a href={it.visualLink || "#"} target="_blank" rel="noreferrer" className={`px-3 py-1 rounded text-xs ${
                                theme === 'dark'
                                  ? 'bg-white/10 text-white'
                                  : 'bg-white/50 text-gray-800'
                              }`}>View</a>
                              <button className={`px-3 py-1 rounded text-xs ${
                                theme === 'dark'
                                  ? 'bg-white/10 text-white'
                                  : 'bg-white/50 text-gray-800'
                              }`}>Edit</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between mt-4">
                  <div className={theme === 'dark' ? 'text-white/60' : 'text-gray-600'}>Showing {(page-1)*pageSize + 1} - {Math.min(page*pageSize, total)} of {total}</div>
                  <div className="flex gap-2">
                    <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p-1))} className={`px-3 py-1 rounded ${
                      theme === 'dark'
                        ? 'bg-white/10 text-white'
                        : 'bg-white/50 text-gray-800'
                    }`}>Prev</button>
                    <button disabled={page*pageSize >= total} onClick={() => setPage(p => p+1)} className={`px-3 py-1 rounded ${
                      theme === 'dark'
                        ? 'bg-white/10 text-white'
                        : 'bg-white/50 text-gray-800'
                    }`}>Next</button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "remnants" && (
              <div>
                <h3 className={`font-medium mb-3 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>Remnants</h3>
                {/* Simple fetch for remnants could reuse inventory endpoint with form=Remnant */}
                <p className={`mb-4 ${
                  theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                }`}>Remnants table (use the inventory list filtered by form 'Remnant')</p>
                {/* For brevity, reuse inventory view or implement separate table */}
              </div>
            )}

            {activeTab === "alerts" && (
              <div>
                <h3 className={`font-medium mb-3 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>Items Missing Purchase Price</h3>
                {needsPriceAlerts.length === 0 && <div className={theme === 'dark' ? 'text-white/60' : 'text-gray-600'}>No alerts</div>}
                {needsPriceAlerts.map((a: any) => (
                  <div key={a.inventoryId || a.id} className={`rounded p-4 mb-3 ${
                    theme === 'dark' ? 'bg-white/10' : 'bg-white/50'
                  }`} style={{
                    backdropFilter: 'blur(12px)',
                    boxShadow: theme === 'dark' 
                      ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                      : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                  }}>
                    <div className="flex justify-between mb-2">
                      <div>
                        <div className={`font-semibold ${
                          theme === 'dark' ? 'text-white' : 'text-gray-800'
                        }`}>{a.productName}</div>
                        <div className={`text-xs ${
                          theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                        }`}>{a.dimensions} — created by {a.createdBy}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs ${
                          theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                        }`}>Enter price (₹)</div>
                        <input id={`price-${a.inventoryId}`} placeholder="e.g. 10000" className={`mt-1 px-2 py-1 rounded ${
                          theme === 'dark'
                            ? 'bg-white/10 text-white'
                           : 'bg-white/50 border border-gray-300 text-gray-800 focus:border-blue-400'
                        }`} />
                        <button onClick={() => handleSavePrice(a.inventoryId, (document.getElementById(`price-${a.inventoryId}`) as HTMLInputElement).value)} className="ml-2 px-3 py-1 bg-green-600 rounded text-white">Save</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "approvals" && (
              <div>
                <h3 className={`font-medium mb-3 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>Pending Approvals</h3>
                {pendingApprovals.length === 0 && <div className={theme === 'dark' ? 'text-white/60' : 'text-gray-600'}>No pending approvals</div>}
                {pendingApprovals.map((p: any) => (
                  <div key={p.cutOrderId || p.id} className={`rounded p-4 mb-3 ${
                    theme === 'dark' ? 'bg-white/10' : 'bg-white/50'
                  }`} style={{
                    backdropFilter: 'blur(12px)',
                    boxShadow: theme === 'dark' 
                      ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                      : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                  }}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className={`text-xs ${
                          theme === 'dark' ? 'text-white/70' : 'text-gray-600'
                        }`}>Requested By</div>
                        <div className={`font-medium ${
                          theme === 'dark' ? 'text-white' : 'text-gray-800'
                        }`}>{p.requestedBy}</div>
                      </div>
                      <div>
                        <div className={`text-xs ${
                          theme === 'dark' ? 'text-white/70' : 'text-gray-600'
                        }`}>Est. Value</div>
                        <div className={`font-medium ${
                          theme === 'dark' ? 'text-white' : 'text-gray-800'
                        }`}>{p.estimatedValueINR ? formatINR(p.estimatedValueINR) : "-"}</div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <img src={p.visualLink} alt="cutplan" className={`w-full max-h-48 object-contain rounded ${
                        theme === 'dark' ? 'bg-white/10' : 'bg-white/50'
                      }`} />
                    </div>

                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleApprove(p.cutOrderId || p.id, false)} className="flex-1 bg-red-600 px-3 py-2 rounded text-white">Reject</button>
                      <button onClick={() => handleApprove(p.cutOrderId || p.id, true)} className="flex-1 bg-green-600 px-3 py-2 rounded text-white">Approve</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "ai" && (
              <div>
                <h3 className={`font-medium mb-3 ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>AI Chatbot</h3>
                <div className={`rounded p-4 mb-3 max-h-64 overflow-auto ${
                  theme === 'dark' ? 'bg-white/10' : 'bg-white/50'
                }`} style={{
                  backdropFilter: 'blur(12px)',
                  boxShadow: theme === 'dark' 
                    ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                    : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                }}>
                  {chatMessages.length === 0 ? <div className={theme === 'dark' ? 'text-white/60' : 'text-gray-600'}>Ask about inventory, investment, sizes, and cut suggestions.</div> :
                    chatMessages.map((m,i) => (
                      <div key={i} className={`mb-2 ${m.from === 'user' ? 'text-right' : ''}`}>
                        <div className={`inline-block p-2 rounded ${
                          m.from === 'user' 
                            ? theme === 'dark' ? 'bg-white/15 text-white' : 'bg-white/70 text-gray-800'
                            : theme === 'dark' ? 'bg-white/10 text-white' : 'bg-white/60 text-gray-800'
                        }`}>{m.text}</div>
                      </div>
                    ))
                  }
                </div>

                <div className="flex gap-2">
                  <input 
                    value={chatInput} 
                    onChange={(e) => setChatInput(e.target.value)} 
                    placeholder="Ask: e.g. 'How much is PTFE 10mm investment?'" 
                    className={`flex-1 p-3 rounded ${
                      theme === 'dark'
                        ? 'bg-white/10 text-white placeholder-white/50'
                       : 'bg-white/50 border border-gray-300 text-gray-800 placeholder-gray-500 focus:border-blue-400'
                    }`} 
                  />
                  <button onClick={handleChatSubmit} className={`px-4 py-3 rounded text-white ${
                    theme === 'dark'
                      ? 'bg-gradient-to-br from-[#8B9198] to-[#E26B64]'
                      : 'bg-gradient-to-br from-[#052635] to-[#010b2f]'
                  }`}>{aiLoading ? "..." : "Send"}</button>
                </div>

                <div className={`text-xs mt-2 ${
                  theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                }`}>AI reads the inventory summary and can answer follow-ups. It won't change data.</div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}