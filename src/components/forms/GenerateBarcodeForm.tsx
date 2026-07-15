// src/components/forms/GenerateBarcodeForm.tsx
import React, { useState, useMemo } from "react";
import {
    ArrowLeft,
    Package,
    Calendar,
    MapPin,
    FileText,
    Ruler,
    Printer
} from "lucide-react";
import { LoadingSpinner } from "../LoadingSpinner";
import { api } from "../../services/api";
import { Theme } from "../../hooks/useTheme";

// Helper function to convert text to sentence case
const toSentenceCase = (text: string): string => {
    if (!text) return "";
    return text
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

interface GenerateBarcodeFormProps {
    onBack: () => void;
    theme: Theme;
}

export default function GenerateBarcodeForm({ onBack, theme }: GenerateBarcodeFormProps) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string>("");
    const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
    const [customForm, setCustomForm] = useState("");

    // initial form state
    const [formData, setFormData] = useState({
        productNameColor: "",
        productForm: "",
        sheetDimensions: "",
        customDimensions: "",
        diameter_mm: "",
        rod_length_mm: "",
        thickness: "",
        date: new Date().toISOString().split("T")[0],
        rack: "",
        location: "",
        quantity: "1",
        notes: ""
    });

    const productFormOptions = [
        { value: "", label: "Select Product Form" },
        { value: "Sheets", label: "Sheets" },
        { value: "Rods", label: "Rods" },
        { value: "Tubes", label: "Tubes" },
        { value: "Bushes", label: "Bushes" },
        { value: "Custom", label: "Custom" }
    ];

    const locationOptions = [
        { value: "", label: "Select Location" },
        { value: "Godown", label: "Godown" },
        { value: "Office", label: "Office" },
        { value: "Warehouse", label: "Warehouse" }
    ];
    const isSheet = useMemo(
        () => (formData.productForm || "").toLowerCase() === "sheets",
        [formData.productForm]
    );

    const isRodLike = useMemo(() => {
        const f = (formData.productForm || "").toLowerCase();
        return f === "rods" || f === "tubes" || f === "bushes";
    }, [formData.productForm]);

    // try to split combined name+color: "PTFE White" -> name="PTFE", color="White"
    const splitNameColor = (combined: string) => {
        if (!combined) return { name: "", color: "" };
        
        // Define actual colors (not material grades/types)
        const actualColors = [
            'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 
            'brown', 'grey', 'gray', 'clear', 'transparent', 'natural', 'beige', 'cream',
            'silver', 'gold', 'bronze', 'copper', 'metallic', 'ivory', 'tan', 'maroon',
            'navy', 'teal', 'lime', 'olive', 'aqua', 'fuchsia', 'violet', 'indigo',
            'magenta', 'cyan', 'amber', 'jade', 'coral', 'salmon', 'khaki', 'plum'
        ];
        
        // Define material grades/types that are NOT colors
        const materialGrades = [
            'c', 'h', 'grade', 'esd', 'conductive', 'antistatic', 'uv', 'stabilized',
            'medical', 'food', 'virgin', 'recycled', 'reinforced', 'filled', 'unfilled',
            'homopolymer', 'copolymer', 'impact', 'modified', 'flame', 'retardant',
            'high', 'low', 'density', 'molecular', 'weight', 'temp', 'temperature',
            'resistant', 'chemical', 'wear', 'abrasion', 'lubricated', 'self',
            'lubricating', 'bearing', 'structural', 'engineering', 'commercial',
            'industrial', 'aerospace', 'automotive', 'marine', 'electrical',
            'insulating', 'conducting', 'semi', 'static', 'dissipative'
        ];
        
        const tokens = combined.trim().split(/\s+/);
        if (tokens.length === 1) {
            return { name: toSentenceCase(tokens[0]), color: "" };
        }
        
        // Look for actual colors from the end
        let colorFound = "";
        let materialTokens = [...tokens];
        
        // Check last few tokens for actual colors
        for (let i = tokens.length - 1; i >= 0; i--) {
            const token = tokens[i].toLowerCase();
            if (actualColors.includes(token)) {
                colorFound = tokens[i];
                materialTokens = tokens.slice(0, i);
                break;
            }
            // If we hit a material grade, stop looking for colors
            if (materialGrades.includes(token)) {
                break;
            }
        }
        
        return {
            name: toSentenceCase(materialTokens.join(" ")),
            color: toSentenceCase(colorFound)
        };
    };


    // placeholders and labels
    const getDimensionPlaceholder = () => {
        if (isSheet) return "e.g., 1220x2440 (Length x Width in mm)";
        if (isRodLike) return "Enter diameter (mm) and length (mm)";
        return "e.g., 10mmx1000mm";
    };

    const getDimensionLabel = () => {
        if (isSheet) return "Dimensions (L × W mm)";
        if (isRodLike) {
            const f = (formData.productForm || "").toLowerCase();
            if (f === "rods") return "Diameter (mm) & Length (mm)";
            if (f === "tubes") return "Diameter (ID/OD mm) & Length (mm)";
            if (f === "bushes") return "Inner/Outer Diameter (mm) & Length (mm)";
        }
        return "Dimensions";
    };

    // parse and validate inputs before sending to API
    const buildPayload = () => {
        const { name: parsedName, color: parsedColor } = splitNameColor(formData.productNameColor);
        const ProductName = parsedName || "";
        const ProductColor = parsedColor || "";

        let Dimensions = "";
        let Length_mm = 0;
        let Width_mm = 0;
        let Diameter_mm = 0;
        let Thickness_mm = 0;

        if (isSheet) {
            if (!formData.sheetDimensions)
                throw new Error("Please enter sheet dimensions in LxW format (e.g., 1220x2440).");
            const parts = formData.sheetDimensions.split(/[x×X]/).map(p => p.trim());
            if (parts.length < 2)
                throw new Error("Sheet dimensions must be in Length x Width format (e.g., 1220x2440).");
            const l = Number(parts[0].replace(/[^\d.]/g, ""));
            const w = Number(parts[1].replace(/[^\d.]/g, ""));
            if (!isFinite(l) || !isFinite(w) || l <= 0 || w <= 0)
                throw new Error("Invalid numeric values for sheet dimensions.");
            Length_mm = Math.round(l);
            Width_mm = Math.round(w);
            Dimensions = `${Length_mm}x${Width_mm}mm`;
            Thickness_mm = Number(formData.thickness || 0);
        } else if (isRodLike) {
            const diamRaw = (formData.diameter_mm || "").toString().trim();
            const lenRaw = (formData.rod_length_mm || "").toString().trim();
            if (!diamRaw) throw new Error("Please enter diameter in mm.");
            if (!lenRaw) throw new Error("Please enter length in mm.");
            const diam = Number(diamRaw.replace(/[^\d.]/g, ""));
            const len = Number(lenRaw.replace(/[^\d.]/g, ""));
            if (!isFinite(diam) || diam <= 0) throw new Error("Invalid diameter value.");
            if (!isFinite(len) || len <= 0) throw new Error("Invalid length value.");
            Diameter_mm = `⌀${Math.round(diam)}`;
            Length_mm = Math.round(len);
            
            // Format dimensions based on product form
            if (formData.productForm.toLowerCase() === 'rods') {
                Dimensions = `${Length_mm}mm`;
            } else if (formData.productForm.toLowerCase() === 'tubes' || formData.productForm.toLowerCase() === 'bushes') {
                Dimensions = `${Length_mm}mm`;
            } else {
                Dimensions = `${Length_mm}mm`;
            }
            Thickness_mm = Number(formData.thickness || 0);
        } else {
            // Custom form handling
            if (formData.productForm === "Custom") {
                Dimensions = formData.customDimensions || "";
                Thickness_mm = Number(formData.thickness || 0);
            } else {
                // Generic fallback
            if (formData.sheetDimensions && formData.sheetDimensions.includes("x")) {
                const parts = formData.sheetDimensions.split(/[x×X]/).map(p => p.trim());
                const l = Number(parts[0].replace(/[^\d.]/g, ""));
                const w = Number(parts[1].replace(/[^\d.]/g, ""));
                if (isFinite(l) && isFinite(w) && l > 0 && w > 0) {
                    Length_mm = Math.round(l);
                    Width_mm = Math.round(w);
                    Dimensions = `${Length_mm}x${Width_mm}mm`;
                } else {
                    Dimensions = formData.sheetDimensions;
                }
                Thickness_mm = Number(formData.thickness || 0);
            }
                Dimensions = formData.sheetDimensions || "";
            }
            Thickness_mm = Number(formData.thickness || 0);
        }

        return {
            ProductName,
            ProductColor,
            ProductForm: formData.productForm === "Custom" ? toSentenceCase(customForm || "Custom") : formData.productForm,
            Dimensions,
            Length_mm,
            Width_mm,
            Diameter_mm,
            Thickness_mm,
            Date: formData.date,
            Rack: toSentenceCase(formData.rack),
            Quantity: parseInt(formData.quantity) || 1,
            Location: formData.location, // Keep as selected from dropdown
            Notes: formData.notes, // Keep notes as-is
            CreatedBy: "employee"
        };
    };

    // submit handler
    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        
        // Clear previous errors
        setValidationErrors({});
        setError("");
        
        // Validate required fields first
        const errors: {[key: string]: string} = {};
        
        if (!formData.productNameColor.trim()) {
            errors.productNameColor = "This field is required";
        }
        
        if (!formData.productForm) {
            errors.productForm = "Please select a product form";
        }
        
        if (formData.productForm === "Custom" && !customForm.trim()) {
            errors.customForm = "Please enter custom product form";
        }
        
        if (!formData.date) {
            errors.date = "This field is required";
        }
        
        if (!formData.rack.trim()) {
            errors.rack = "This field is required";
        }
        
        if (!formData.location) {
            errors.location = "Please select a location";
        }
        
        if (!formData.quantity.trim() || parseInt(formData.quantity) < 1) {
            errors.quantity = "Please enter a valid quantity (minimum 1)";
        }
        
        // Form-specific validations
        if (isSheet && !formData.sheetDimensions.trim()) {
            errors.sheetDimensions = "Please enter sheet dimensions";
        }
        
        if (isRodLike) {
            if (!formData.diameter_mm.trim()) {
                errors.diameter_mm = "Please enter diameter";
            }
            if (!formData.rod_length_mm.trim()) {
                errors.rod_length_mm = "Please enter length";
            }
        }
        
        if (formData.productForm === "Custom" && !formData.customDimensions.trim()) {
            errors.customDimensions = "Please enter custom dimensions";
        }
        
        // If there are validation errors, show them and stop
        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            return;
        }
        
        setLoading(true);
        setResult(null);

        try {
            const payload = buildPayload();
            console.log("Submitting payload:", payload);
            const response = await api.addInventory(payload);
            console.log("API Response:", response);
            
            if (!response.success) {
                throw new Error('There was a problem generating the barcode. Please try again.');
            }
            
            if (!response.data) {
                throw new Error('There was a problem generating the barcode. Please try again.');
            }
            
            const normalized = {
                inventoryId: response.data.InventoryID || response.data.inventoryId || response.data.InventoryId || response.data.inventoryID,
                barcodeId: response.data.BarcodeID || response.data.barcodeId || response.data.BarcodeId || response.data.barcodeID,
                labelUrl: response.data.labelLink || response.data.labelUrl || response.data.labelURL || response.data.label || response.data.LabelLink,
                message: response.data.message || response.data.msg || response.message || undefined,
                raw: response
            };
            console.log("Normalized result:", normalized);
            setResult(normalized);
        } catch (err) {
            console.error("Error in add-inventory:", err);
            setError('There was a problem generating the barcode. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setResult(null);
        setError("");
        setCustomForm("");
        setFormData({
            productNameColor: "",
            productForm: "",
            sheetDimensions: "",
            customDimensions: "",
            diameter_mm: "",
            rod_length_mm: "",
            thickness: "",
            date: new Date().toISOString().split("T")[0],
            rack: "",
            location: "",
            quantity: "1",
            notes: ""
        });
    };

    const openPrint = (url?: string) => {
        if (!url) return;
        window.open(url, "_blank");
    };

    // UI
    if (result) {
        return (
            <div className={`min-h-screen p-4 ${
                theme === 'dark' 
                    ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' 
                    : 'bg-gradient-to-br from-blue-50 to-indigo-100'
            }`}>
                <div className="max-w-md mx-auto pt-8">
                    <button
                        onClick={onBack}
                        className={`flex items-center gap-2 mb-6 transition-colors ${
                            theme === 'dark' 
                                ? 'text-white/80 hover:text-white' 
                                : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        <ArrowLeft className="w-5 h-5" /> Back to Menu
                    </button>

                    <div className={`backdrop-blur-md rounded-2xl p-6 border ${
                        theme === 'dark'
                            ? 'bg-white/10 border-white/20'
                            : 'bg-white/40 border-white/50'
                    }`} style={{
                        backdropFilter: 'blur(12px)',
                        boxShadow: theme === 'dark' 
                            ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                            : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                    }}>
                        <h2 className={`text-2xl font-bold mb-6 text-center ${
                            theme === 'dark' ? 'text-white' : 'text-gray-800'
                        }`}>
                            Barcode Generated Successfully
                        </h2>

                        {result.labelUrl ? (
                            <div className="mb-6">
                                <img
                                    src={result.labelUrl}
                                    alt="Generated Label"
                                    className="w-full rounded-lg border border-white/20 bg-white p-2"
                                    onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                    }}
                                />
                            </div>
                        ) : (
                            <div className={`mb-4 ${
                                theme === 'dark' ? 'text-white/70' : 'text-gray-600'
                            }`}>Label not available for preview.</div>
                        )}

                        <div className={`space-y-4 ${
                            theme === 'dark' ? 'text-white' : 'text-gray-800'
                        }`}>
                            <div>
                                <span className={theme === 'dark' ? 'text-white/60' : 'text-gray-600'}>Barcode ID:</span>
                                <p className="font-mono text-lg text-[#D24B44]">
                                    {result.barcodeId || "Not generated"}
                                </p>
                            </div>

                            <div>
                                <span className={theme === 'dark' ? 'text-white/60' : 'text-gray-600'}>Inventory ID:</span>
                                <p className="font-mono">{result.inventoryId || "Not generated"}</p>
                            </div>

                            {result.message && (
                                <div>
                                    <span className={theme === 'dark' ? 'text-white/60' : 'text-gray-600'}>Status:</span>
                                    <p className="text-green-400">{result.message}</p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 mt-6">
                            {result.labelUrl && (
                                <button
                                    onClick={() => openPrint(result.labelUrl)}
                                    className={`w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 ${
                                        theme === 'dark'
                                            ? 'bg-[#8B9198]'
                                            : 'bg-[#052635]'
                                    }`}
                                >
                                    <Printer className="w-4 h-4" /> Print Label
                                </button>
                            )}
                            <button
                                onClick={resetForm}
                                className={`w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity border ${
                                    theme === 'dark'
                                        ? 'bg-gradient-to-r from-[#052635] to-[#010b2f] border-white/20'
                                        : 'bg-gradient-to-r from-[#8B9198] to-[#E26B64] border-gray-300'
                                }`}
                            >
                                Generate Another Barcode
                            </button>
                        </div>

                        <details className="mt-4 text-xs">
                            <summary className={`cursor-pointer ${
                                theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                            }`}>Debug Info</summary>
                            <pre className={`mt-2 overflow-auto p-2 rounded ${
                                theme === 'dark' 
                                    ? 'text-white/40 bg-black/20' 
                                    : 'text-gray-600 bg-white/50'
                            }`}>
                                {JSON.stringify(result, null, 2)}
                            </pre>
                        </details>
                    </div>
                </div>
            </div>
        );
    }

    // main form
    return (
        <div className={`min-h-screen p-4 ${
            theme === 'dark' 
                ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' 
                : 'bg-gradient-to-br from-blue-50 to-indigo-100'
        }`}>
            <div className="max-w-md mx-auto pt-8">
                <button
                    onClick={onBack}
                    className={`flex items-center gap-2 mb-6 transition-colors ${
                        theme === 'dark' 
                            ? 'text-white/80 hover:text-white' 
                            : 'text-gray-600 hover:text-gray-800'
                    }`}
                >
                    <ArrowLeft className="w-5 h-5" /> Back to Menu
                </button>

                <div className={`backdrop-blur-md rounded-2xl p-6 border ${
                    theme === 'dark'
                        ? 'bg-white/10 border-white/20'
                        : 'bg-white/40 border-white/50'
                }`} style={{
                    backdropFilter: 'blur(12px)',
                    boxShadow: theme === 'dark' 
                        ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                        : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                }}>
                    <h2 className={`text-2xl font-bold mb-6 text-center ${
                        theme === 'dark' ? 'text-white' : 'text-gray-800'
                    }`}>Generate Barcode</h2>

                    {error && (
                        <div className={`mb-4 p-3 border rounded-lg text-sm ${
                            theme === 'dark'
                                ? 'bg-red-500/20 border-red-500/50 text-red-200'
                                : 'bg-red-50 border-red-200 text-red-600'
                        }`}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Product name & color */}
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                            }`}>
                                <Package className="w-4 h-4" /> Product Name & Color
                            </label>
                            <input
                                type="text"
                                value={formData.productNameColor}
                                onChange={(e) =>
                                    setFormData({ ...formData, productNameColor: e.target.value })
                                }
                                className={`w-full px-4 py-3 border rounded-xl ${
                                    theme === 'dark'
                                        ? 'bg-white/10 border-white/20 text-white placeholder-white/50'
                                        : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:border-blue-400'
                                }`}
                                placeholder="e.g., PTFE White, Nylon Black"
                                required
                            />
                        </div>

                        {/* Product Form */}
                        <div>
                            <label className={`text-sm font-medium mb-2 block ${
                                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                            }`}>
                                Product Form
                            </label>
                            <select
                                value={formData.productForm}
                                onChange={(e) =>
                                    setFormData({ ...formData, productForm: e.target.value })
                                }
                                className={`w-full px-4 py-3 border rounded-xl ${
                                    theme === 'dark'
                                        ? 'bg-white/10 border-white/20 text-white'
                                        : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                }`}
                            >
                                {productFormOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {formData.productForm === "Custom" && (
                            <>
                                <div>
                                    <label className={`text-sm mb-2 block ${
                                        theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                                    }`}>
                                        Custom Product Form
                                    </label>
                                    <input
                                        type="text"
                                        value={customForm}
                                        onChange={(e) => setCustomForm(e.target.value)}
                                        className={`w-full px-4 py-3 border rounded-xl ${
                                            theme === 'dark'
                                                ? 'bg-white/10 border-white/20 text-white'
                                                : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                        }`}
                                        placeholder="e.g., Cloth, Film, Block"
                                        required
                                    />
                                </div>
                                
                                <div>
                                    <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                        theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                                    }`}>
                                        <Ruler className="w-4 h-4" />
                                        Custom Dimensions
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.customDimensions}
                                        onChange={(e) =>
                                            setFormData({ ...formData, customDimensions: e.target.value })
                                        }
                                        className={`w-full px-4 py-3 border rounded-xl ${
                                            validationErrors.customDimensions 
                                                ? 'border-red-500' 
                                                : theme === 'dark'
                                                    ? 'bg-white/10 border-white/20 text-white'
                                                    : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                        }`}
                                        placeholder="e.g., 1000x500mm, 2m length, etc."
                                    />
                                    {validationErrors.customDimensions && (
                                        <p className="text-red-500 text-xs mt-1">{validationErrors.customDimensions}</p>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Sheets */}
                        {isSheet && (
                            <>
                                <div>
                                    <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                        theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                                    }`}>
                                        <Ruler className="w-4 h-4" /> {getDimensionLabel()}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.sheetDimensions}
                                        onChange={(e) =>
                                            setFormData({ ...formData, sheetDimensions: e.target.value })
                                        }
                                        className={`w-full px-4 py-3 border rounded-xl ${
                                            theme === 'dark'
                                                ? 'bg-white/10 border-white/20 text-white'
                                                : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                        }`}
                                        placeholder={getDimensionPlaceholder()}
                                        required
                                    />
                                    <p className={`text-xs mt-2 ${
                                        theme === 'dark' ? 'text-white/50' : 'text-gray-500'
                                    }`}>
                                        Format: LengthxWidth in mm, e.g., <code>1220x2440</code>
                                    </p>
                                </div>

                                <div>
                                    <label className={`text-sm mb-2 block ${
                                        theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                                    }`}>Thickness (mm)</label>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        value={formData.thickness}
                                        onChange={(e) =>
                                            setFormData({ ...formData, thickness: e.target.value })
                                        }
                                        className={`w-full px-4 py-3 border rounded-xl ${
                                            theme === 'dark'
                                                ? 'bg-white/10 border-white/20 text-white'
                                                : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                        }`}
                                        placeholder="e.g., 5"
                                        required
                                    />
                                </div>
                            </>
                        )}

                        {/* Rods / Tubes / Bushes */}
                        {isRodLike && (
                            <>
                                <div>
                                    <label className={`text-sm mb-2 block ${
                                        theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                                    }`}>
                                        {getDimensionLabel()}
                                    </label>
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            value={formData.diameter_mm}
                                            onChange={(e) =>
                                                setFormData({ ...formData, diameter_mm: e.target.value })
                                            }
                                            className={`w-full px-4 py-3 border rounded-xl ${
                                                theme === 'dark'
                                                    ? 'bg-white/10 border-white/20 text-white'
                                                    : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                            }`}
                                            placeholder="Diameter mm (e.g., 25)"
                                            required
                                        />
                                        <input
                                            type="text"
                                            value={formData.rod_length_mm}
                                            onChange={(e) =>
                                                setFormData({ ...formData, rod_length_mm: e.target.value })
                                            }
                                            className={`w-full px-4 py-3 border rounded-xl ${
                                                theme === 'dark'
                                                    ? 'bg-white/10 border-white/20 text-white'
                                                    : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                            }`}
                                            placeholder="Length mm (e.g., 1000)"
                                            required
                                        />
                                    </div>
                                    {(formData.productForm.toLowerCase() === 'tubes' || formData.productForm.toLowerCase() === 'bushes') && (
                                        <p className={`text-xs mt-2 ${
                                            theme === 'dark' ? 'text-white/50' : 'text-gray-500'
                                        }`}>
                      
                                        </p>
                                    )}
                                </div>

                            </>
                        )}

                        {/* Generic fallback */}
                        {!formData.productForm && (
                            <div>
                                <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                    theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                                }`}>
                                    <Ruler className="w-4 h-4" /> Dimensions
                                </label>
                                <input
                                    type="text"
                                    value={formData.sheetDimensions}
                                    onChange={(e) =>
                                        setFormData({ ...formData, sheetDimensions: e.target.value })
                                    }
                                    className={`w-full px-4 py-3 border rounded-xl ${
                                        theme === 'dark'
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                    }`}
                                    placeholder={getDimensionPlaceholder()}
                                />
                            </div>
                        )}

                        {/* Date */}
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                            }`}>
                                <Calendar className="w-4 h-4" /> Date
                            </label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                className={`w-full px-4 py-3 border rounded-xl ${
                                    theme === 'dark'
                                        ? 'bg-white/10 border-white/20 text-white'
                                        : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                }`}
                                required
                            />
                        </div>

                        {/* Rack */}
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                            }`}>
                                <MapPin className="w-4 h-4" /> Rack
                            </label>
                            <input
                                type="text"
                                value={formData.rack}
                                onChange={(e) => setFormData({ ...formData, rack: e.target.value })}
                                className={`w-full px-4 py-3 border rounded-xl ${
                                    theme === 'dark'
                                        ? 'bg-white/10 border-white/20 text-white'
                                        : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                }`}
                                placeholder="e.g., A1"
                                required
                            />
                        </div>

                        {/* Location */}
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                            }`}>
                                <MapPin className="w-4 h-4" /> Location
                            </label>
                            <select
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                                    theme === 'dark'
                                        ? 'bg-white/10 border-white/20 text-white focus:ring-white/30'
                                        : 'bg-white/50 border-gray-300 text-gray-800 focus:ring-blue-300 focus:border-blue-400'
                                }`}
                                required
                            >
                                {locationOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Quantity */}
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                            }`}>
                                <Package className="w-4 h-4" /> Quantity
                            </label>
                            <input
                                type="number"
                                min="1"
                                step="1"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                                    validationErrors.quantity 
                                        ? 'border-red-500' 
                                        : theme === 'dark'
                                            ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                                            : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                                }`}
                                placeholder="e.g., 5"
                            />
                            {validationErrors.quantity && (
                                <p className="text-red-500 text-xs mt-1">{validationErrors.quantity}</p>
                            )}
                        </div>

                        {/* Notes */}
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                            }`}>
                                <FileText className="w-4 h-4" /> Notes (Optional)
                            </label>
                            <textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                rows={3}
                                className={`w-full px-4 py-3 border rounded-xl resize-none ${
                                    theme === 'dark'
                                        ? 'bg-white/10 border-white/20 text-white'
                                        : 'bg-white/50 border-gray-300 text-gray-800 focus:border-blue-400'
                                }`}
                                placeholder="Additional notes..."
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 ${
                                theme === 'dark'
                                    ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]'
                                    : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
                            }`}
                        >
                            {loading ? <LoadingSpinner size="sm" /> : null}
                            {loading ? "Generating..." : "Generate Barcode"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}