import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Pill, Warning, Plus, MagnifyingGlass, Package,
  ArrowsClockwise, CheckCircle,
} from "@phosphor-icons/react";
import api from "@/lib/api";
import { toast } from "sonner";

const CATEGORY_COLORS = {
  "Analgesic": "bg-[#FDE8D8] text-[#854F0B]",
  "Antibiotic": "bg-[#E1F5EE] text-[#0F6E56]",
  "Antihistamine": "bg-[#EDE9F8] text-[#5B3FA3]",
  "Antidiabetic": "bg-[#FEF3CD] text-[#84600A]",
  "Antihypertensive": "bg-[#DBE9FE] text-[#1E40AF]",
  "PPI": "bg-[#FCE7F3] text-[#9D174D]",
  "Bronchodilator": "bg-[#D1FAE5] text-[#065F46]",
  "NSAID": "bg-[#FEE2E2] text-[#991B1B]",
};

function StockBadge({ qty, reorder }) {
  if (qty <= 0) return <Badge className="bg-[#FCEBEB] text-[#A32D2D] border-0 text-xs">Out of Stock</Badge>;
  if (qty <= reorder) return <Badge className="bg-[#FDE8D8] text-[#854F0B] border-0 text-xs">Low Stock</Badge>;
  return <Badge className="bg-[#EAF3DE] text-[#3B6D11] border-0 text-xs">In Stock</Badge>;
}

export default function PharmacyInventory() {
  const [items, setItems]         = useState([]);
  const [alerts, setAlerts]       = useState([]);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(true);
  const [addOpen, setAddOpen]     = useState(false);
  const [editItem, setEditItem]   = useState(null);
  const [form, setForm]           = useState({
    name:"", generic_name:"", category:"", unit:"tablet",
    stock_qty:0, reorder_level:50, unit_price:0, expiry_date:"", batch_no:"", supplier:""
  });

  const load = async () => {
    try {
      const [inv, alr] = await Promise.all([
        api.get("/inventory"),
        api.get("/inventory/low-stock"),
      ]);
      setItems(inv.data);
      setAlerts(alr.data);
    } catch { toast.error("Failed to load inventory"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.generic_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditItem(null);
    setForm({ name:"", generic_name:"", category:"", unit:"tablet", stock_qty:0, reorder_level:50, unit_price:0, expiry_date:"", batch_no:"", supplier:"" });
    setAddOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...item });
    setAddOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editItem) {
        await api.patch(`/inventory/${editItem.id}`, form);
        toast.success("Item updated");
      } else {
        await api.post("/inventory", form);
        toast.success("Item added");
      }
      setAddOpen(false);
      load();
    } catch { toast.error("Save failed"); }
  };

  const handleStockAdjust = async (item, delta) => {
    try {
      await api.patch(`/inventory/${item.id}`, { stock_qty: Math.max(0, item.stock_qty + delta) });
      load();
    } catch { toast.error("Update failed"); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <ArrowsClockwise size={28} className="text-[#1C3F39] animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Alerts strip */}
      {alerts.length > 0 && (
        <div className="bg-[#FDE8D8] border border-[#F4A261]/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Warning size={18} className="text-[#854F0B]" weight="fill" />
            <span className="font-semibold text-[#854F0B] text-sm">{alerts.length} alert{alerts.length > 1 ? "s" : ""} require attention</span>
          </div>
          <div className="space-y-1">
            {alerts.slice(0, 5).map((a, i) => (
              <div key={i} className="text-xs text-[#854F0B] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#854F0B] flex-shrink-0" />
                {a.alert === "low_stock"
                  ? `${a.name} — only ${a.stock_qty} ${a.unit}s left (reorder at ${a.reorder_level})`
                  : `${a.name} — expires in ${a.days_left} days`
                }
              </div>
            ))}
            {alerts.length > 5 && <p className="text-xs text-[#854F0B]/70">+{alerts.length-5} more…</p>}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7B6E]" />
          <Input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search medicines…"
            className="pl-9 rounded-xl border-[#E2DDD7] bg-white"
          />
        </div>
        <Button onClick={openAdd} className="bg-[#1C3F39] text-white rounded-xl gap-1.5">
          <Plus size={16} /> Add Medicine
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total SKUs", value: items.length, color: "text-[#1C3F39]" },
          { label: "Low Stock", value: alerts.filter(a=>a.alert==="low_stock").length, color: "text-[#854F0B]" },
          { label: "Expiring Soon", value: alerts.filter(a=>a.alert==="expiring_soon").length, color: "text-[#A32D2D]" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 border border-[#E2DDD7]">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-[#6B7B6E] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E2DDD7] overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-[#F3EFE9] text-xs font-semibold text-[#6B7B6E] uppercase tracking-wider border-b border-[#E2DDD7]">
          <span>Medicine</span><span>Stock</span><span>Price</span><span>Expiry</span><span>Actions</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-[#6B7B6E]">
            <Package size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No medicines found</p>
          </div>
        ) : filtered.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.02 }}
            className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-4 border-b border-[#E2DDD7] last:border-0 items-center hover:bg-[#F9F9F6] transition-colors"
          >
            <div>
              <p className="font-medium text-[#1C3F39] text-sm">{item.name}</p>
              {item.generic_name && <p className="text-xs text-[#6B7B6E]">{item.generic_name}</p>}
              {item.category && (
                <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full mt-1 font-medium ${CATEGORY_COLORS[item.category] || "bg-[#F3EFE9] text-[#6B7B6E]"}`}>
                  {item.category}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <StockBadge qty={item.stock_qty} reorder={item.reorder_level} />
              <div className="flex items-center gap-1">
                <button onClick={() => handleStockAdjust(item, -1)}
                  className="w-5 h-5 rounded bg-[#F3EFE9] text-[#6B7B6E] hover:bg-[#E2DDD7] text-xs font-bold flex items-center justify-center">−</button>
                <span className="text-sm font-semibold text-[#1C3F39] w-8 text-center">{item.stock_qty}</span>
                <button onClick={() => handleStockAdjust(item, 1)}
                  className="w-5 h-5 rounded bg-[#F3EFE9] text-[#6B7B6E] hover:bg-[#E2DDD7] text-xs font-bold flex items-center justify-center">+</button>
                <span className="text-xs text-[#6B7B6E]">{item.unit}s</span>
              </div>
            </div>

            <div className="text-sm text-[#1C3F39] font-medium">
              RM {Number(item.unit_price).toFixed(2)}
              <p className="text-xs text-[#6B7B6E] font-normal">per {item.unit}</p>
            </div>

            <div className="text-sm text-[#1C3F39]">
              {item.expiry_date ? (
                (() => {
                  const days = Math.ceil((new Date(item.expiry_date) - new Date()) / 86400000);
                  return (
                    <span className={days <= 30 ? "text-[#A32D2D] font-medium" : "text-[#6B7B6E]"}>
                      {item.expiry_date}
                      {days <= 30 && <span className="block text-xs">({days}d left)</span>}
                    </span>
                  );
                })()
              ) : <span className="text-[#6B7B6E] text-xs">—</span>}
            </div>

            <Button size="sm" variant="ghost" onClick={() => openEdit(item)}
              className="text-[#6B7B6E] hover:text-[#1C3F39] hover:bg-[#F3EFE9] rounded-lg text-xs">
              Edit
            </Button>
          </motion.div>
        ))}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md rounded-3xl bg-[#F9F9F6] border-0">
          <DialogHeader>
            <DialogTitle className="text-[#1C3F39] font-display">
              {editItem ? "Edit Medicine" : "Add Medicine"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              ["Medicine Name *", "name", "text"],
              ["Generic Name", "generic_name", "text"],
              ["Category", "category", "text"],
              ["Unit (tablet/capsule/ml/etc)", "unit", "text"],
              ["Stock Quantity", "stock_qty", "number"],
              ["Reorder Level", "reorder_level", "number"],
              ["Unit Price (RM)", "unit_price", "number"],
              ["Expiry Date", "expiry_date", "date"],
              ["Batch No.", "batch_no", "text"],
              ["Supplier", "supplier", "text"],
            ].map(([label, field, type]) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs text-[#6B7B6E]">{label}</Label>
                <Input
                  type={type} value={form[field] ?? ""}
                  onChange={e => setForm(f => ({ ...f, [field]: type === "number" ? Number(e.target.value) : e.target.value }))}
                  className="rounded-xl border-[#E2DDD7] text-sm"
                />
              </div>
            ))}
            <Button onClick={handleSave} className="w-full bg-[#1C3F39] text-white rounded-xl mt-2">
              {editItem ? "Save Changes" : "Add Medicine"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
