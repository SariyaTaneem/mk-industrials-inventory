import React, { useEffect, useState } from "react";
import { LogOut, Bell, Search, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, RefreshCw, Bot, Eye, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { Theme } from "../hooks/useTheme";

const SUMMARY_URL = import.meta.env.VITE_N8N_OWNER_SUMMARY_WEBHOOK_URL as string;
// One workflow, three actions (SET_PRICE / UPDATE_RACK / DELETE) — see the
// Owner_Action.json workflow file for the n8n side of this.
const OWNER_ACTION_URL = import.meta.env.VITE_N8N_OWNER_ACTION_WEBHOOK_URL as string;

// ─── Raw webhook item shape ───────────────────────────────────────────────────
interface RawItem {
  InventoryID?: string;
  BarcodeID?: string;
  ProductName?: string;
  ProductColor?: string;
  Form?: string;
  Dimensions_mm?: string;
  Thickness_mm___Diameter_mm?: string;
  PurchasePricePerSheet?: number | string;
  NeedsPrice?: string | boolean;
  PurchaseDate?: string;
  CreatedDate?: string;
  Rack?: string;
  Status?: string;
  RemainingArea_mm2?: number | string;
  Area_mm2?: number | string;
  PossibleRectangles?: string;
  DimensionString?: string;
  TotalArea_mm2?: number | string;
  Source?: string;
  SVG?: string;
}

// ─── Parsed / normalised item ─────────────────────────────────────────────────
interface ParsedItem {
  barcodeId: string;
  inventoryId: string;
  cleanName: string;
  synonym: string;
  colour: string;
  formType: "Sheet" | "Rod" | "Other";
  isRemnant: boolean;
  needsPrice: boolean;
  dimL?: number;
  dimW?: number;
  thickness?: number;
  length?: number;
  diameter?: string;
  pricePerUnit: number;
  dateOfEntry: string;
  rack: string;
  status: string;
  remainingArea?: number;
  primaryRect?: string;
  secondaryRect?: string;
  svg?: string;
  groupKey: string;
}

// ─── Grouped display row ──────────────────────────────────────────────────────
interface GroupedRow {
  barcodes: string[];
  cleanName: string;
  synonym: string;
  colour: string;
  formType: "Sheet" | "Rod" | "Other";
  isRemnant: boolean;
  needsPrice: boolean;
  dimL?: number;
  dimW?: number;
  thickness?: number;
  length?: number;
  diameter?: string;
  pricePerUnit: number;
  qty: number;
  estimatedValue: number;
  dateOfEntry: string;
  entryDates?: string[]; // all distinct dates this group's barcodes were added on
  rack: string;
  status: string;
  singleBarcodeId?: string;
  primaryRect?: string;
  secondaryRect?: string;
  svg?: string;
}

// ─── Name / synonym parsing ───────────────────────────────────────────────────
function parseName(raw: string): { cleanName: string; synonym: string } {
  if (!raw) return { cleanName: "", synonym: "" };

  // "Name (x)/Alias"  or  "Name (x)"
  const parenSlash = raw.match(/^([^(/]+?)\s*(\([^)]*\)(?:\s*\/\s*\S+)?)\s*$/i);
  if (parenSlash) {
    return { cleanName: titleCase(parenSlash[1].trim()), synonym: parenSlash[2].trim() };
  }

  // "Name / Alias"
  const slash = raw.match(/^([^/]+?)\s*\/\s*(.+)$/i);
  if (slash) {
    return { cleanName: titleCase(slash[1].trim()), synonym: slash[2].trim() };
  }

  return { cleanName: titleCase(raw.trim()), synonym: "" };
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseSheetDims(raw?: string): { l?: number; w?: number } {
  if (!raw) return {};
  const cleaned = raw.trim().replace(/\s*mm\s*$/i, "").trim();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)$/);
  return m ? { l: Number(m[1]), w: Number(m[2]) } : {};
}

function parseThickness(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) || n === 0 ? undefined : n;
}

// Remnants store their shape as e.g. "primary:2000x500|secondary:1800x500"
// instead of a plain Dimensions_mm field.
function parseRectangles(raw?: string): { primary?: string; secondary?: string } {
  if (!raw) return {};
  const out: { primary?: string; secondary?: string } = {};
  for (const part of raw.split("|")) {
    const m = part.trim().match(/^(primary|secondary)\s*:\s*(.+)$/i);
    if (m) {
      const dims = m[2].trim().replace(/x/i, " × ");
      if (/primary/i.test(m[1])) out.primary = dims;
      else out.secondary = dims;
    }
  }
  return out;
}

function isNeedsPrice(v?: string | boolean): boolean {
  if (v === true) return true;
  if (typeof v === "string") return v.trim().toUpperCase() === "TRUE";
  return false;
}

function normaliseForm(raw?: string): "Sheet" | "Rod" | "Other" {
  if (!raw) return "Other";
  const s = raw.trim().toLowerCase();
  if (s === "sheet" || s === "sheets") return "Sheet";
  if (s === "rod" || s === "rods") return "Rod";
  return "Other";
}

function normKey(s?: string): string {
  return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function numKey(n?: number): string {
  return n === undefined || n === null || isNaN(n) ? "" : String(Math.round(n * 100) / 100);
}

function parseItems(raw: RawItem[]): ParsedItem[] {
  return raw.map((r): ParsedItem => {
    const { cleanName, synonym } = parseName(r.ProductName || "");
    const formType = normaliseForm(r.Form);
    const isRemnant = !!(r.BarcodeID?.startsWith("RM-") || r.Source === "Remnant");
    const needsPrice = isNeedsPrice(r.NeedsPrice);
    const pricePerUnit = Number(r.PurchasePricePerSheet) || 0;
    const dateOfEntry = r.PurchaseDate || (r.CreatedDate ? r.CreatedDate.slice(0, 10) : "");

    let dimL: number | undefined, dimW: number | undefined, thickness: number | undefined;
    let length: number | undefined, diameter: string | undefined;
    let primaryRect: string | undefined, secondaryRect: string | undefined;

    if (formType === "Sheet") {
      const dims = parseSheetDims(r.Dimensions_mm);
      dimL = dims.l; dimW = dims.w;
      thickness = parseThickness(r.Thickness_mm___Diameter_mm);
    } else if (formType === "Rod") {
      length = Number(r.Dimensions_mm) || undefined;
      diameter = r.Thickness_mm___Diameter_mm || undefined;
    }

    if (isRemnant) {
      const rects = parseRectangles(r.PossibleRectangles);
      primaryRect = rects.primary;
      secondaryRect = rects.secondary;
      // Remnants don't carry Thickness in the sheet-dim regex path above
      // since they usually lack a clean Dimensions_mm field — fall back here.
      if (thickness === undefined) thickness = parseThickness(r.Thickness_mm___Diameter_mm);
    }

    // Normalised so that things like extra spaces, mixed case, or "720" vs
    // "720.0" don't accidentally split one product into several rows.
    // Rack is part of the key too — two stacks of the same product in two
    // different racks are shown as two separate rows on purpose.
    // Remnants are never merged: every remnant is a physically unique offcut,
    // so its own barcode is folded into the key to keep it on its own row.
    const groupKey = isRemnant
      ? `remnant|${r.BarcodeID || r.InventoryID || ""}`
      : [
          normKey(cleanName), normKey(synonym), normKey(r.ProductColor), formType, normKey(r.Rack),
          numKey(dimL), numKey(dimW), numKey(thickness), numKey(length), normKey(diameter),
        ].join("|");

    return {
      barcodeId: r.BarcodeID || r.InventoryID || "",
      inventoryId: r.InventoryID || r.BarcodeID || "",
      cleanName, synonym,
      colour: r.ProductColor || "",
      formType, isRemnant, needsPrice,
      dimL, dimW, thickness, length, diameter, pricePerUnit, dateOfEntry,
      rack: r.Rack || "",
      status: (r.Status || "").trim(),
      remainingArea: r.RemainingArea_mm2 ? Number(r.RemainingArea_mm2) : undefined,
      primaryRect, secondaryRect, svg: r.SVG,
      groupKey,
    };
  });
}

function groupItems(items: ParsedItem[]): GroupedRow[] {
  const rows: GroupedRow[] = [];

  // NeedsPrice=TRUE → group by product + rack + exact CreatedDate. A batch of
  // barcodes generated together shares one identical timestamp and gets one
  // price applied to the whole batch at once (see savePrice below).
  const needsPriceGrouped: Record<string, ParsedItem[]> = {};
  for (const item of items.filter((i) => i.needsPrice)) {
    const key = `${item.groupKey}||${item.dateOfEntry}`;
    needsPriceGrouped[key] = needsPriceGrouped[key] || [];
    needsPriceGrouped[key].push(item);
  }
  for (const group of Object.values(needsPriceGrouped)) {
    const first = group[0];
    rows.push({
      barcodes: group.map((i) => i.barcodeId),
      singleBarcodeId: group.length === 1 ? first.barcodeId : undefined,
      cleanName: first.cleanName, synonym: first.synonym, colour: first.colour,
      formType: first.formType, isRemnant: first.isRemnant, needsPrice: true,
      dimL: first.dimL, dimW: first.dimW, thickness: first.thickness,
      length: first.length, diameter: first.diameter,
      pricePerUnit: 0, qty: group.length, estimatedValue: 0,
      dateOfEntry: first.dateOfEntry, rack: first.rack, status: first.status,
      primaryRect: first.primaryRect, secondaryRect: first.secondaryRect, svg: first.svg,
    });
  }

  // NeedsPrice=FALSE → group by product + rack only (ignore date). Quantity
  // accumulates across every batch/date the same product has ever arrived in,
  // but a different rack always gets its own row.
  const grouped: Record<string, ParsedItem[]> = {};
  for (const item of items.filter((i) => !i.needsPrice)) {
    grouped[item.groupKey] = grouped[item.groupKey] || [];
    grouped[item.groupKey].push(item);
  }
  for (const group of Object.values(grouped)) {
    const first = group[0];
    rows.push({
      barcodes: group.map((i) => i.barcodeId),
      cleanName: first.cleanName, synonym: first.synonym, colour: first.colour,
      formType: first.formType, isRemnant: first.isRemnant, needsPrice: false,
      dimL: first.dimL, dimW: first.dimW, thickness: first.thickness,
      length: first.length, diameter: first.diameter,
      pricePerUnit: first.pricePerUnit, qty: group.length,
      estimatedValue: first.pricePerUnit * group.length,
      dateOfEntry: first.dateOfEntry, rack: first.rack, status: first.status,
      primaryRect: first.primaryRect, secondaryRect: first.secondaryRect, svg: first.svg,
    });
  }

  return rows;
}

const formatINR = (n: number) =>
  n === 0 ? "—" : "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const formatDate = (s: string) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }); }
  catch { return s; }
};

// ─── Search helpers (multi-token AND match across all visible fields) ────────
function normaliseQuery(q: string): string[] {
  return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function buildHaystack(r: GroupedRow, kind: "sheet" | "rod"): string {
  const parts: (string | number | undefined)[] = [
    r.cleanName, r.synonym, r.colour, r.formType, r.rack, r.status,
    r.needsPrice ? "needs price unpriced" : "",
    ...r.barcodes,
  ];
  if (kind === "sheet") {
    parts.push(r.dimL, r.dimW, r.dimL != null && r.dimW != null ? `${r.dimL}x${r.dimW}` : "");
    parts.push(r.thickness, r.thickness != null ? `${r.thickness}mm` : "");
  } else {
    parts.push(r.length, r.length != null ? `${r.length}mm` : "");
    parts.push(r.diameter);
  }
  return parts.filter((p) => p !== undefined && p !== null).join(" ").toLowerCase();
}

function matchesSearch(r: GroupedRow, query: string, kind: "sheet" | "rod"): boolean {
  const tokens = normaliseQuery(query);
  if (tokens.length === 0) return true;
  const hay = buildHaystack(r, kind);
  return tokens.every((t) => hay.includes(t));
}

const PAGE_SIZE = 12;

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;
  return { pageRows: rows.slice(start, start + pageSize), totalPages, page: clampedPage };
}

type SubTab = "inventory" | "remnants" | "needs-price";

// ─── Main Component ───────────────────────────────────────────────────────────
// ─── Error boundary ────────────────────────────────────────────────────────
// If anything inside the portal throws during render (a bad field in the
// webhook payload, a parsing edge case, etc.), this stops it from taking down
// the whole app to a blank white screen — it shows a recoverable message with
// a "Try again" button instead, and logs the real error to the console.
class OwnerPortalBoundary extends React.Component<
  { children: React.ReactNode; theme: Theme; onBack: () => void },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; theme: Theme; onBack: () => void }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("OwnerPortal crashed:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      const dark = this.props.theme === "dark";
      return (
        <div className={`min-h-screen flex items-center justify-center p-6 ${
          dark ? "bg-gradient-to-br from-[#052635] to-[#010b2f]" : "bg-gradient-to-br from-blue-50 to-indigo-100"
        }`}>
          <div className={`max-w-md w-full rounded-2xl border p-6 text-center ${
            dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-200 text-gray-800"
          }`}>
            <p className="font-semibold mb-2">Something went wrong loading the portal</p>
            <p className={`text-sm mb-4 ${dark ? "text-white/60" : "text-gray-500"}`}>
              {this.state.error.message || "Unexpected error"}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => this.setState({ error: null })}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
              >
                Try again
              </button>
              <button
                onClick={this.props.onBack}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  dark ? "border-white/20 text-white/80" : "border-gray-300 text-gray-700"
                }`}
              >
                Back to home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function OwnerPortal(props: { onBack: () => void; theme: Theme }) {
  return (
    <OwnerPortalBoundary theme={props.theme} onBack={props.onBack}>
      <OwnerPortalInner {...props} />
    </OwnerPortalBoundary>
  );
}

function OwnerPortalInner({ onBack, theme }: { onBack: () => void; theme: Theme }) {
  const { user } = useAuth();

  const [rawItems, setRawItems] = useState<RawItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sheetSearch, setSheetSearch] = useState("");
  const [rodSearch, setRodSearch] = useState("");

  const [sheetTab, setSheetTab] = useState<SubTab>("inventory");
  const [rodTab, setRodTab] = useState<SubTab>("inventory");

  const [sheetPage, setSheetPage] = useState(1);
  const [rodPage, setRodPage] = useState(1);

  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [savingPrice, setSavingPrice] = useState<Record<string, boolean>>({});
  const [rackEdits, setRackEdits] = useState<Record<string, string>>({});
  const [savingRack, setSavingRack] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [svgModal, setSvgModal] = useState<{ title: string; svg: string } | null>(null);

  // AI chat
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ from: "user" | "ai"; text: string }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(SUMMARY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      const arr: RawItem[] = Array.isArray(json) ? json : json.data ?? json.items ?? [];
      setRawItems(arr);
    } catch (e: any) {
      setError(e?.message || "Failed to load data from webhook");
    } finally {
      setLoading(false);
    }
  }

  async function ownerAction(body: Record<string, unknown>) {
    return fetch(OWNER_ACTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function savePrice(barcodeIds: string[], rack: string) {
    const batchKey = barcodeIds.join(",");
    const val = priceInputs[batchKey];
    const price = Number(val);
    if (!val || isNaN(price) || price <= 0) return;
    setSavingPrice((s) => ({ ...s, [batchKey]: true }));
    try {
      // One barcode gets one webhook call; a whole batch (same product, same
      // rack, same CreatedDate) gets the same price applied to every barcode in it.
      await Promise.all(barcodeIds.map((barcodeId) =>
        ownerAction({ Action: "SET_PRICE", BarcodeID: barcodeId, PurchasePricePerSheet: price, Rack: rack })
      ));
      await fetchData();
      setPriceInputs((p) => { const c = { ...p }; delete c[batchKey]; return c; });
    } catch (e) {
      console.error("save price failed", e);
    } finally {
      setSavingPrice((s) => { const c = { ...s }; delete c[batchKey]; return c; });
    }
  }

  async function saveRack(barcodeIds: string[], newRack: string) {
    const rackKey = barcodeIds.join(",");
    if (!newRack.trim()) return;
    setSavingRack((s) => ({ ...s, [rackKey]: true }));
    try {
      await Promise.all(barcodeIds.map((barcodeId) =>
        ownerAction({ Action: "UPDATE_RACK", BarcodeID: barcodeId, Rack: newRack.trim() })
      ));
      await fetchData();
      setRackEdits((p) => { const c = { ...p }; delete c[rackKey]; return c; });
    } catch (e) {
      console.error("save rack failed", e);
      alert("Couldn't update the rack. Please try again.");
    } finally {
      setSavingRack((s) => { const c = { ...s }; delete c[rackKey]; return c; });
    }
  }

  async function deleteEntries(barcodeIds: string[], productLabel: string) {
    const maxQty = barcodeIds.length;
    const input = window.prompt(
      `How many "${productLabel}" do you want to delete? (1–${maxQty})`,
      String(maxQty)
    );
    if (input === null) return;
    const qty = Math.max(0, Math.min(maxQty, Math.floor(Number(input)) || 0));
    if (qty === 0) return;
    if (!window.confirm(`Delete ${qty} item(s)? This cannot be undone.`)) return;

    const idsToDelete = barcodeIds.slice(0, qty);
    const groupKey = barcodeIds.join(",");
    setDeleting((s) => ({ ...s, [groupKey]: true }));
    try {
      await Promise.all(idsToDelete.map((barcodeId) => ownerAction({ Action: "DELETE", BarcodeID: barcodeId })));
      await fetchData();
    } catch (e) {
      console.error("delete failed", e);
      alert("Couldn't delete. Please try again.");
    } finally {
      setDeleting((s) => { const c = { ...s }; delete c[groupKey]; return c; });
    }
  }


  async function handleChatSubmit() {
    if (!chatInput.trim()) return;
    setChatMessages((m) => [...m, { from: "user", text: chatInput }]);
    setAiLoading(true);
    const prompt = chatInput;
    setChatInput("");
    try {
      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const j = await res.json();
      setChatMessages((m) => [...m, { from: "ai", text: j.answer || "No answer" }]);
    } catch {
      setChatMessages((m) => [...m, { from: "ai", text: "AI endpoint not connected yet." }]);
    } finally {
      setAiLoading(false);
    }
  }

  const handleLogout = async () => { await supabase.auth.signOut(); onBack(); };

  // ─── Derived ──────────────────────────────────────────────────────────────
  const parsed = parseItems(rawItems);
  const sheets       = parsed.filter((i) => i.formType === "Sheet" && !i.isRemnant);
  const rods         = parsed.filter((i) => i.formType === "Rod"   && !i.isRemnant);
  const remSheets    = parsed.filter((i) => i.formType === "Sheet" && i.isRemnant);
  const remRods      = parsed.filter((i) => i.formType === "Rod"   && i.isRemnant);

  const sheetRows    = groupItems(sheets);
  const rodRows      = groupItems(rods);
  const remSheetRows = groupItems(remSheets);

  const totalItems       = parsed.filter((i) => !i.isRemnant).length;
  const totalValue       = parsed.filter((i) => !i.isRemnant && !i.needsPrice).reduce((s, i) => s + i.pricePerUnit, 0);
  const totalRemnantVal  = [...remSheets, ...remRods].filter((i) => !i.needsPrice).reduce((s, i) => s + i.pricePerUnit, 0);
  const totalUnpriced    = parsed.filter((i) => i.needsPrice).length;

  const filterRows = (rows: GroupedRow[], query: string, kind: "sheet" | "rod") =>
    rows.filter((r) => matchesSearch(r, query, kind));

  // ─── Sheets: active rows for the current sub-tab, searched + paginated ────
  const sheetActiveRows =
    sheetTab === "inventory"   ? sheetRows :
    sheetTab === "remnants"    ? remSheetRows :
    sheetRows.filter((r) => r.needsPrice);
  const sheetFilteredRows = filterRows(sheetActiveRows, sheetSearch, "sheet");
  const { pageRows: sheetPageRows, totalPages: sheetTotalPages, page: sheetPageClamped } =
    paginate(sheetFilteredRows, sheetPage, PAGE_SIZE);

  // ─── Rods: active rows for the current sub-tab, searched + paginated ─────
  const rodActiveRows = rodTab === "inventory" ? rodRows : rodRows.filter((r) => r.needsPrice);
  const rodFilteredRows = filterRows(rodActiveRows, rodSearch, "rod");
  const { pageRows: rodPageRows, totalPages: rodTotalPages, page: rodPageClamped } =
    paginate(rodFilteredRows, rodPage, PAGE_SIZE);

  // ─── Theme-aware style helpers ────────────────────────────────────────────
  const pageBg = theme === "dark"
    ? "bg-gradient-to-br from-[#052635] to-[#010b2f]"
    : "bg-gradient-to-br from-blue-50 to-indigo-100";

  const glass = theme === "dark"
    ? "bg-white/10 border-white/20"
    : "bg-white/40 border-white/50";

  const textMain  = theme === "dark" ? "text-white"      : "text-gray-800";
  const textMuted = theme === "dark" ? "text-white/60"   : "text-gray-600";
  const tabActive = theme === "dark" ? "bg-white/20 text-white"   : "bg-white/60 text-gray-800";
  const tabInactive = theme === "dark" ? "text-white/60"            : "text-gray-600";
  const inputCls  = theme === "dark"
    ? "bg-white/5 text-white placeholder-white/50 border-white/10"
    : "bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500";
  const rowHover  = theme === "dark" ? "hover:bg-white/5" : "hover:bg-black/5";
  const divider   = theme === "dark" ? "border-white/10"  : "border-gray-200";
  const thCls     = `p-3 text-left text-xs font-semibold uppercase tracking-wide ${textMuted} whitespace-nowrap`;
  const tdCls     = `p-3 align-top text-sm ${textMain} whitespace-nowrap`;
  const tdMCls    = `p-3 align-top text-sm ${textMuted} whitespace-nowrap`;

  // ─── Section pill ────────────────────────────────────────────────────────
  const SectionPill = ({ label }: { label: string }) => (
    <div className="flex justify-center my-2">
      <div className={`px-10 py-3 rounded-2xl font-bold text-lg tracking-wide border backdrop-blur-md ${
        theme === "dark"
          ? "bg-[#0d4b68]/80 border-white/20 text-white"
          : "bg-[#1a6a8a]/90 border-white/40 text-white"
      }`} style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>
        {label}
      </div>
    </div>
  );

  // ─── Sub-tab bar ──────────────────────────────────────────────────────────
  const SubTabBar = ({ tabs, active, onChange }: {
    tabs: { id: string; label: string }[];
    active: string;
    onChange: (id: string) => void;
  }) => (
    <div className={`flex border-b ${divider}`}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-5 py-3 text-sm font-medium transition-colors rounded-none ${
            active === t.id ? tabActive : tabInactive
          } hover:${theme === "dark" ? "text-white" : "text-gray-800"}`}>
          {t.label}
        </button>
      ))}
    </div>
  );

  // ─── Pagination bar ───────────────────────────────────────────────────────
  const Pagination = ({ page, totalPages, totalItems, onChange }: {
    page: number; totalPages: number; totalItems: number; onChange: (p: number) => void;
  }) => {
    if (totalItems === 0) return null;
    return (
      <div className={`flex items-center justify-between px-4 py-3 border-t text-xs ${divider} ${textMuted}`}>
        <span>Page {page} of {totalPages} · {totalItems} item{totalItems === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(page - 1)}
            disabled={page <= 1}
            className={`px-3 py-1.5 rounded-lg border backdrop-blur-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${glass} ${textMain}`}
          >
            Prev
          </button>
          <button
            onClick={() => onChange(page + 1)}
            disabled={page >= totalPages}
            className={`px-3 py-1.5 rounded-lg border backdrop-blur-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors ${glass} ${textMain}`}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // ─── Name cell ────────────────────────────────────────────────────────────
  const NameCell = ({ name, synonym }: { name: string; synonym: string }) => (
    <div>
      <div className={`font-medium text-sm ${textMain}`}>{name}</div>
      {synonym && (
        <div className={`mt-0.5 inline-block text-xs px-1.5 py-0.5 rounded ${
          theme === "dark" ? "bg-white/10 text-white/50" : "bg-black/8 text-gray-500"
        }`}>{synonym}</div>
      )}
    </div>
  );

  const EmptyRow = ({ cols }: { cols: number }) => (
    <tr><td colSpan={cols} className={`p-8 text-center text-sm ${textMuted}`}>No items found</td></tr>
  );

  const formatDims = (r: GroupedRow) => {
    if (r.isRemnant) {
      if (!r.primaryRect) return "—";
      return r.secondaryRect ? `${r.primaryRect} (+${r.secondaryRect})` : r.primaryRect;
    }
    return r.dimL && r.dimW ? `${r.dimL} × ${r.dimW}` : "—";
  };

  // Editable rack cell shared by SheetTable/RodTable — click the pencil to
  // change it, Save applies to every barcode in this grouped row.
  const RackCell = ({ r }: { r: GroupedRow }) => {
    const rackKey = r.barcodes.join(",");
    const val = rackEdits[rackKey] ?? r.rack;
    const changed = val !== r.rack;
    const saving = !!savingRack[rackKey];
    return (
      <div className="flex items-center gap-1">
        <input
          value={val}
          onChange={(e) => setRackEdits((p) => ({ ...p, [rackKey]: e.target.value }))}
          className={`w-16 px-1.5 py-1 rounded border text-xs focus:outline-none ${inputCls}`}
        />
        {changed && (
          <button
            onClick={() => saveRack(r.barcodes, val)}
            disabled={saving}
            title="Save rack"
            className="p-1 rounded bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white transition-colors"
          >
            {saving
              ? <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin block" />
              : <CheckCircle2 className="w-3 h-3" />}
          </button>
        )}
      </div>
    );
  };

  const RowActions = ({ r }: { r: GroupedRow }) => {
    const groupKey = r.barcodes.join(",");
    const isDeleting = !!deleting[groupKey];
    return (
      <div className="flex items-center gap-1.5">
        {r.isRemnant && r.svg && (
          <button
            onClick={() => setSvgModal({ title: `${r.cleanName} — ${formatDims(r)}`, svg: r.svg! })}
            title="View remnant shape"
            className={`p-1.5 rounded border transition-colors ${glass} ${textMain}`}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => deleteEntries(r.barcodes, r.cleanName)}
          disabled={isDeleting}
          title="Delete entries"
          className="p-1.5 rounded border border-red-400/40 text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
        >
          {isDeleting
            ? <span className="w-3.5 h-3.5 border border-red-400/40 border-t-red-500 rounded-full animate-spin block" />
            : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  };

  // ─── Sheet table ──────────────────────────────────────────────────────────
  const SheetTable = ({ rows }: { rows: GroupedRow[] }) => (
    <table className="w-full text-sm">
      <thead className={theme === "dark" ? "bg-white/5" : "bg-black/5"}>
        <tr>
          <th className={thCls}>Product Name</th>
          <th className={thCls}>Synonyms</th>
          <th className={thCls}>Product Colour</th>
          <th className={thCls}>Dims (L×W)</th>
          <th className={thCls}>Thickness</th>
          <th className={thCls}>Qty</th>
          <th className={thCls}>Rack</th>
          <th className={thCls}>Price/Sheet</th>
          <th className={thCls}>Est. Value</th>
          <th className={thCls}>Actions</th>
        </tr>
      </thead>
      <tbody className={`divide-y ${divider}`}>
        {rows.length === 0 ? <EmptyRow cols={10} /> : rows.map((r, i) => (
          <tr key={i} className={`${rowHover} transition-colors`}>
            <td className={tdCls}><NameCell name={r.cleanName} synonym="" /></td>
            <td className={tdMCls}>{r.synonym || "—"}</td>
            <td className={tdMCls}>{r.colour || "—"}</td>
            <td className={tdCls}>{formatDims(r)}</td>
            <td className={tdCls}>{r.thickness ? `${r.thickness} mm` : "—"}</td>
            <td className={tdCls}>{r.qty}</td>
            <td className="p-2 align-top"><RackCell r={r} /></td>
            <td className={tdCls}>
              {r.needsPrice
                ? <span className={`text-xs px-2 py-0.5 rounded-full border ${theme === "dark" ? "bg-amber-500/20 text-amber-300 border-amber-400/30" : "bg-amber-50 text-amber-700 border-amber-300"}`}>Unpriced</span>
                : r.pricePerUnit ? formatINR(r.pricePerUnit) : "—"}
            </td>
            <td className={tdCls}>{r.needsPrice ? "—" : r.estimatedValue ? formatINR(r.estimatedValue) : "—"}</td>
            <td className="p-2 align-top"><RowActions r={r} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // ─── Rod table ────────────────────────────────────────────────────────────
  const RodTable = ({ rows }: { rows: GroupedRow[] }) => (
    <table className="w-full text-sm">
      <thead className={theme === "dark" ? "bg-white/5" : "bg-black/5"}>
        <tr>
          <th className={thCls}>Product Name</th>
          <th className={thCls}>Synonyms</th>
          <th className={thCls}>Product Colour</th>
          <th className={thCls}>Length</th>
          <th className={thCls}>Diameter</th>
          <th className={thCls}>Qty</th>
          <th className={thCls}>Rack</th>
          <th className={thCls}>Price/Meter</th>
          <th className={thCls}>Est. Value</th>
          <th className={thCls}>Actions</th>
        </tr>
      </thead>
      <tbody className={`divide-y ${divider}`}>
        {rows.length === 0 ? <EmptyRow cols={10} /> : rows.map((r, i) => (
          <tr key={i} className={`${rowHover} transition-colors`}>
            <td className={tdCls}><NameCell name={r.cleanName} synonym="" /></td>
            <td className={tdMCls}>{r.synonym || "—"}</td>
            <td className={tdMCls}>{r.colour || "—"}</td>
            <td className={tdCls}>{r.length ? `${r.length} mm` : "—"}</td>
            <td className={tdCls}>{r.diameter || "—"}</td>
            <td className={tdCls}>{r.qty}</td>
            <td className="p-2 align-top"><RackCell r={r} /></td>
            <td className={tdCls}>
              {r.needsPrice
                ? <span className={`text-xs px-2 py-0.5 rounded-full border ${theme === "dark" ? "bg-amber-500/20 text-amber-300 border-amber-400/30" : "bg-amber-50 text-amber-700 border-amber-300"}`}>Unpriced</span>
                : r.pricePerUnit ? formatINR(r.pricePerUnit) : "—"}
            </td>
            <td className={tdCls}>{r.needsPrice ? "—" : r.estimatedValue ? formatINR(r.estimatedValue) : "—"}</td>
            <td className="p-2 align-top"><RowActions r={r} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  // ─── Needs Price table ────────────────────────────────────────────────────
  const NeedsPriceTable = ({ rows, kind }: { rows: GroupedRow[]; kind: "sheet" | "rod" }) => (
    <table className="w-full text-sm">
      <thead className={theme === "dark" ? "bg-white/5" : "bg-black/5"}>
        <tr>
          <th className={thCls}>Product Name</th>
          <th className={thCls}>Synonyms</th>
          <th className={thCls}>Colour</th>
          <th className={thCls}>{kind === "sheet" ? "Dims (L×W)" : "Length"}</th>
          <th className={thCls}>{kind === "sheet" ? "Thickness" : "Diameter"}</th>
          <th className={thCls}>Qty</th>
          <th className={thCls}>Barcode ID(s)</th>
          <th className={thCls}>Date of Entry</th>
          <th className={thCls}>Rack</th>
          <th className={thCls}>{kind === "sheet" ? "Price/Sheet" : "Price/Meter"} Action</th>
        </tr>
      </thead>
      <tbody className={`divide-y ${divider}`}>
        {rows.length === 0 ? <EmptyRow cols={10} /> : rows.map((r, i) => {
          const batchKey = r.barcodes.join(",");
          const inputVal = priceInputs[batchKey] ?? "";
          const saving = !!savingPrice[batchKey];
          const dimVal = kind === "sheet"
            ? (r.dimL && r.dimW ? `${r.dimL} × ${r.dimW}` : "—")
            : (r.length ? `${r.length} mm` : "—");
          const sizeVal = kind === "sheet" ? (r.thickness ? `${r.thickness} mm` : "—") : (r.diameter || "—");

          return (
            <tr key={i} className={`transition-colors ${theme === "dark" ? "hover:bg-amber-500/5" : "hover:bg-amber-50"}`}>
              <td className={tdCls}><NameCell name={r.cleanName} synonym="" /></td>
              <td className={tdMCls}>{r.synonym || "—"}</td>
              <td className={tdMCls}>{r.colour || "—"}</td>
              <td className={tdCls}>{dimVal}</td>
              <td className={tdCls}>{sizeVal}</td>
              <td className={tdCls}>{r.qty}</td>
              <td className="p-3 align-top max-w-[220px]">
                {r.barcodes.length === 1 ? (
                  <span className={`text-xs font-mono ${theme === "dark" ? "text-sky-300" : "text-sky-700"}`}>{r.barcodes[0]}</span>
                ) : (
                  <span
                    title={r.barcodes.join(", ")}
                    className={`text-xs font-mono cursor-help ${theme === "dark" ? "text-sky-300" : "text-sky-700"}`}
                  >
                    {r.barcodes[0]} <span className={textMuted}>+{r.barcodes.length - 1} more (same batch)</span>
                  </span>
                )}
              </td>
              <td className={tdMCls}>
                {r.entryDates && r.entryDates.length > 1 ? (
                  <span title={r.entryDates.map(formatDate).join(", ")} className="cursor-help">
                    {formatDate(r.entryDates[0])} <span className={textMuted}>+{r.entryDates.length - 1} more date{r.entryDates.length > 2 ? "s" : ""}</span>
                  </span>
                ) : (
                  formatDate(r.dateOfEntry)
                )}
              </td>
              <td className={tdMCls}>{r.rack || "—"}</td>
              <td className="p-3 align-top">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${
                    theme === "dark"
                      ? "bg-amber-500/20 text-amber-300 border-amber-400/30"
                      : "bg-amber-50 text-amber-700 border-amber-300"
                  }`}>Needs Price</span>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs ${textMuted}`}>₹</span>
                    <input
                      type="number" min="0" value={inputVal}
                      onChange={(e) => setPriceInputs((p) => ({ ...p, [batchKey]: e.target.value }))}
                      placeholder="Amount"
                      className={`w-24 px-2 py-1 rounded border text-xs focus:outline-none ${inputCls}`}
                    />
                    <button
                      onClick={() => savePrice(r.barcodes, r.rack)}
                      disabled={saving || !inputVal}
                      className="px-2 py-1 rounded bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xs font-medium transition-colors flex items-center gap-1"
                    >
                      {saving
                        ? <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                        : <CheckCircle2 className="w-3 h-3" />}
                      Save{r.qty > 1 ? ` all ${r.qty}` : ""}
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen p-4 pb-12 ${pageBg}`}>
      <div className="max-w-7xl mx-auto pt-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className={`text-2xl font-bold ${textMain}`}>Owner Portal</h1>
            <p className={textMuted}>{user?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border backdrop-blur-md text-sm ${glass} ${textMain}`}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={handleLogout}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border backdrop-blur-md text-sm ${glass} ${textMain}`}>
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/30 rounded-xl p-4">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm text-red-300">{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className={`w-8 h-8 border-2 rounded-full animate-spin ${
              theme === "dark" ? "border-white/20 border-t-white" : "border-gray-300 border-t-gray-600"
            }`} />
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Summary cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: "Total Inventory Value",    value: formatINR(totalValue) },
                { label: "Total Inventory Items",    value: String(totalItems) },
                { label: "Total Remnant Value",      value: formatINR(totalRemnantVal) },
                { label: "Total Investment Locked",  value: totalUnpriced > 0 ? `${totalUnpriced} unpriced` : formatINR(totalValue + totalRemnantVal), amber: totalUnpriced > 0 },
              ].map(({ label, value, amber }) => (
                <div key={label} className={`p-4 rounded-2xl border backdrop-blur-md ${
                  amber
                    ? theme === "dark" ? "bg-amber-500/10 border-amber-400/30" : "bg-amber-50 border-amber-300"
                    : glass
                }`} style={{ boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm ${amber ? (theme === "dark" ? "text-amber-300/80" : "text-amber-700") : textMuted}`}>{label}</p>
                      <p className={`text-xl font-semibold mt-1 ${amber ? (theme === "dark" ? "text-amber-300" : "text-amber-700") : textMain}`}>{value}</p>
                    </div>
                    <Bell className={amber ? (theme === "dark" ? "text-amber-400/60" : "text-amber-500") : (theme === "dark" ? "text-white/30" : "text-gray-400")} />
                  </div>
                </div>
              ))}
            </div>

            {/* ═══ SHEETS ═══ */}
            <SectionPill label="Sheets" />

            {/* Sheets search */}
            <div className="relative">
              <Search className={`absolute left-3 top-3 w-4 h-4 ${textMuted}`} />
              <input
                value={sheetSearch}
                onChange={(e) => { setSheetSearch(e.target.value); setSheetPage(1); }}
                placeholder='Search sheets: try "pom black 20 mm"...'
                className={`w-full pl-9 pr-4 py-3 rounded-xl border backdrop-blur-md text-sm focus:outline-none ${inputCls}`} />
            </div>

            <div className={`rounded-2xl border backdrop-blur-md overflow-hidden ${glass}`} style={{
              boxShadow: theme === "dark"
                ? "0 20px 25px -5px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)"
                : "0 20px 25px -5px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)"
            }}>
              <SubTabBar
                tabs={[
                  { id: "inventory",   label: "Inventory" },
                  { id: "remnants",    label: "Remnants" },
                  { id: "needs-price", label: `Needs Price${sheetRows.filter(r => r.needsPrice).length ? ` (${sheetRows.filter(r => r.needsPrice).length})` : ""}` },
                ]}
                active={sheetTab}
                onChange={(t) => { setSheetTab(t as SubTab); setSheetPage(1); }}
              />
              <div className="overflow-x-auto">
                {sheetTab === "inventory"   && <SheetTable rows={sheetPageRows} />}
                {sheetTab === "remnants"    && <SheetTable rows={sheetPageRows} />}
                {sheetTab === "needs-price" && <NeedsPriceTable rows={sheetPageRows} kind="sheet" />}
              </div>
              <Pagination page={sheetPageClamped} totalPages={sheetTotalPages} totalItems={sheetFilteredRows.length} onChange={setSheetPage} />
            </div>

            {/* ═══ RODS ═══ */}
            <SectionPill label="Rods" />

            {/* Rods search */}
            <div className="relative">
              <Search className={`absolute left-3 top-3 w-4 h-4 ${textMuted}`} />
              <input
                value={rodSearch}
                onChange={(e) => { setRodSearch(e.target.value); setRodPage(1); }}
                placeholder='Search rods: try "pom black 20 mm"...'
                className={`w-full pl-9 pr-4 py-3 rounded-xl border backdrop-blur-md text-sm focus:outline-none ${inputCls}`} />
            </div>

            <div className={`rounded-2xl border backdrop-blur-md overflow-hidden ${glass}`} style={{
              boxShadow: theme === "dark"
                ? "0 20px 25px -5px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)"
                : "0 20px 25px -5px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)"
            }}>
              <SubTabBar
                tabs={[
                  { id: "inventory",   label: "Inventory" },
                  { id: "needs-price", label: `Needs Price${rodRows.filter(r => r.needsPrice).length ? ` (${rodRows.filter(r => r.needsPrice).length})` : ""}` },
                ]}
                active={rodTab}
                onChange={(t) => { setRodTab(t as SubTab); setRodPage(1); }}
              />
              <div className="overflow-x-auto">
                {rodTab === "inventory"   && <RodTable rows={rodPageRows} />}
                {rodTab === "needs-price" && <NeedsPriceTable rows={rodPageRows} kind="rod" />}
              </div>
              <Pagination page={rodPageClamped} totalPages={rodTotalPages} totalItems={rodFilteredRows.length} onChange={setRodPage} />
            </div>

            {/* ═══ AI CHAT BOT ═══ */}
            <SectionPill label="AI Chat Bot" />

            <div className={`rounded-2xl border backdrop-blur-md p-6 ${glass}`} style={{
              boxShadow: theme === "dark"
                ? "0 20px 25px -5px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)"
                : "0 20px 25px -5px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)"
            }}>
              <div className="flex items-center gap-2 mb-4">
                <Bot className={theme === "dark" ? "text-white/60 w-5 h-5" : "text-gray-500 w-5 h-5"} />
                <h3 className={`font-semibold ${textMain}`}>Inventory AI Assistant</h3>
              </div>

              {/* Chat window */}
              <div className={`rounded-xl p-4 mb-4 min-h-[140px] max-h-64 overflow-y-auto border ${
                theme === "dark" ? "bg-white/5 border-white/10" : "bg-white/50 border-gray-200"
              }`}>
                {chatMessages.length === 0 ? (
                  <p className={`text-sm ${textMuted}`}>Ask about inventory, investment totals, sizes, or cut suggestions.</p>
                ) : (
                  chatMessages.map((m, i) => (
                    <div key={i} className={`mb-2 flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`inline-block px-3 py-2 rounded-xl text-sm max-w-xs ${
                        m.from === "user"
                          ? theme === "dark" ? "bg-white/15 text-white" : "bg-white/70 text-gray-800"
                          : theme === "dark" ? "bg-white/10 text-white/90" : "bg-gray-100 text-gray-800"
                      }`}>{m.text}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChatSubmit()}
                  placeholder="Ask: e.g. How much is the total ABS investment?"
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm focus:outline-none ${inputCls}`}
                />
                <button onClick={handleChatSubmit}
                  className={`px-5 py-3 rounded-xl text-white text-sm font-medium transition-colors ${
                    theme === "dark"
                      ? "bg-gradient-to-br from-[#8B9198] to-[#E26B64] hover:opacity-90"
                      : "bg-gradient-to-br from-[#052635] to-[#010b2f] hover:opacity-90"
                  }`}>
                  {aiLoading ? "..." : "Send"}
                </button>
              </div>
              <p className={`text-xs mt-2 ${textMuted}`}>AI reads the inventory summary and can answer follow-ups. It won't change data.</p>
            </div>
          </>
        )}
      </div>

      {svgModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSvgModal(null)}
        >
          <div
            className={`rounded-2xl border max-w-2xl w-full max-h-[85vh] overflow-auto p-4 ${glass}`}
            style={{ backgroundColor: theme === "dark" ? "#0b1f2e" : "#ffffff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-semibold text-sm ${textMain}`}>{svgModal.title}</h3>
              <button onClick={() => setSvgModal(null)} className={`text-lg leading-none ${textMuted}`}>✕</button>
            </div>
            <div className="bg-white rounded-lg p-2" dangerouslySetInnerHTML={{ __html: svgModal.svg }} />
          </div>
        </div>
      )}
    </div>
  );
}