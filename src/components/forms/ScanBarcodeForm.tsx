import React, { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Camera, Hash, Eye, Package2, Scissors, MapPin, Download, Printer, RotateCcw, CircleCheck as CheckCircle, X, Plus } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { api } from '../../services/api'
import { LoadingSpinner } from '../LoadingSpinner'
import { InventoryItem } from '../../types'
import { Theme } from '../../hooks/useTheme'

// Helper function to map API response to InventoryItem format
const mapApiResponseToInventoryItem = (apiResponse: any): InventoryItem => {
  const material = apiResponse?.material || apiResponse

  // Parse dimensions based on the actual API response format
  let length = 0, width = 0
  let rawDimensionString = ''

  // Check if this is an RM (remnant) barcode
  const barcodeId = material.BarcodeID || ''
  const isRemnant = barcodeId.startsWith('RM-') || barcodeId.startsWith('RM')

  // For RM barcodes, check responsePayload.Dimensions first (comma-separated like "920x605,1025x1425")
  const responsePayloadDimensions = apiResponse?.responsePayload?.Dimensions

  // Check DimensionString field (e.g., "1025x2030x920x605x105x1425")
  const dimensionStringField = material['DimensionString'] || material['dimensionString']

  // Check PossibleRectangles (e.g., "tertiary:920x605|primary:1025x1425")
  const possibleRects = material['PossibleRectangles']

  if (isRemnant && responsePayloadDimensions) {
    rawDimensionString = responsePayloadDimensions.toString()
    const firstPart = rawDimensionString.split(',')[0]?.replace(/×/g, 'x')
    const match = firstPart?.match(/(\d+)x(\d+)/)
    if (match) {
      length = parseInt(match[1])
      width = parseInt(match[2])
    }
  } else if (isRemnant && possibleRects) {
    const parts = possibleRects.split('|').map((p: string) => {
      const dimPart = p.split(':')[1]?.replace(/×/g, 'x')
      return dimPart
    }).filter(Boolean)
    if (parts.length > 0) {
      rawDimensionString = parts.join(',')
      const match = parts[0]?.match(/(\d+)x(\d+)/)
      if (match) {
        length = parseInt(match[1])
        width = parseInt(match[2])
      }
    }
  } else if (isRemnant && dimensionStringField) {
    rawDimensionString = dimensionStringField.toString()
    const normalized = rawDimensionString.replace(/×/g, 'x')
    const match = normalized.match(/(\d+)x(\d+)/)
    if (match) {
      length = parseInt(match[1])
      width = parseInt(match[2])
    }
  }

  // Handle Dimensions_mm field (can be "1000" for rods or "1220x2440"/"1220×2440" for sheets)
  const dimensionsRawField = material['Dimensions_mm'] || material['Dimensions'] || material['dimensions']

  // Also check for Length_mm and Width_mm directly from API
  const directLength = material['Length_mm'] || material['length_mm'] || material['Length'] || material['length']
  const directWidth = material['Width_mm'] || material['width_mm'] || material['Width'] || material['width']

  if (length === 0 && directLength && directWidth) {
    length = parseInt(directLength.toString().replace(/[^\d]/g, '')) || 0
    width = parseInt(directWidth.toString().replace(/[^\d]/g, '')) || 0
  } else if (length === 0 && directLength && !directWidth) {
    length = parseInt(directLength.toString().replace(/[^\d]/g, '')) || 0
  }

  if (length === 0 && dimensionsRawField) {
    const dimensionsStr = dimensionsRawField.toString().replace(/×/g, 'x').replace(/mm/gi, '').trim()

    if (isRemnant && (dimensionsRawField.toString().includes(',') || dimensionsStr.includes(','))) {
      if (!rawDimensionString) rawDimensionString = dimensionsRawField.toString()
    } else if (dimensionsStr.includes('x') && /\d+x\d+/.test(dimensionsStr)) {
      const dimensionMatch = dimensionsStr.match(/(\d+)x(\d+)/)
      if (dimensionMatch) {
        length = parseInt(dimensionMatch[1])
        width = parseInt(dimensionMatch[2])
      }
    } else if (/^\d+$/.test(dimensionsStr)) {
      length = parseInt(dimensionsStr) || 0
    }
  }

  if (isRemnant && length > 0 && width > 0 && !rawDimensionString) {
    rawDimensionString = `${length}x${width}`
  }
  
  // Handle thickness/diameter field - try multiple possible field names
  let thickness = 0, diameter = 0
  
  // Debug: log the material object to see what fields are available
  console.log('Material object:', material)
  
  // Try various field names for thickness
  const thicknessValue = material['Thickness'] || material['thickness'] || material['Thickness_mm'] || material['thickness_mm']
  if (thicknessValue) {
    const thicknessStr = thicknessValue.toString().replace(/[^\d.]/g, '')
    thickness = parseFloat(thicknessStr) || 0
    console.log('Extracted thickness:', thickness, 'from:', thicknessValue)
  }
  
  // Try various field names for diameter
  const diameterValue = material['Diameter'] || material['diameter'] || material['Diameter_mm'] || material['diameter_mm']
  if (diameterValue) {
    const diameterStr = diameterValue.toString().replace(/[⌀\s]/g, '').replace(/[^\d.]/g, '')
    diameter = parseFloat(diameterStr) || 0
    console.log('Extracted diameter:', diameter, 'from:', diameterValue)
  }
  
  // Fallback: check if there's still the old combined field
  if (thickness === 0 && diameter === 0) {
    const thicknessDiameter = material['Thickness_mm___Diameter_mm'] || material['Thickness_mm/Diameter_mm']
    if (thicknessDiameter) {
      const form = (material[' Form'] || material.Form || '').toLowerCase()
      const value = parseFloat(thicknessDiameter.toString().replace(/[^\d.]/g, '')) || 0
      if (form.includes('rod') || form.includes('tube') || form.includes('bush')) {
        diameter = value
      } else {
        thickness = value
      }
      console.log('Used fallback field, extracted:', form.includes('rod') || form.includes('tube') || form.includes('bush') ? 'diameter' : 'thickness', value)
    }
  }
  return {
    InventoryID: material.InventoryID || '',
    ProductName: material.ProductName || '',
    ProductColor: material.ProductColor || '',
    Form: (material[' Form'] || material.Form || '').trim(), // Handle space in " Form"
    Thickness_mm: thickness,
    Length_mm: length,
    Width_mm: width,
    Diameter_mm: diameter,
    Area_mm2: material['Area_mm2,'] || material.Area_mm2 || 0, // Handle comma in field name
    SheetsQty: 1, // Default to 1 if not provided
    RemainingArea_mm2: material.RemainingArea_mm2 || 0,
    PurchaseDate: material.PurchaseDate || '',
    PurchasePricePerSheet: material.PurchasePricePerSheet ? parseFloat(material.PurchasePricePerSheet) : undefined,
    PurchasePriceEnteredBy: material.PurchasePriceEnteredBy || '',
    Rack: material.Rack || '',
    Status: material.Status || '',
    BarcodeID: material.BarcodeID || '',
    CreatedBy: material.CreatedBy || '',
    CreatedDate: material.CreatedDate || '',
    NeedsPrice: material.NeedsPrice === 'TRUE' || material.NeedsPrice === true,
    isSold: material.Status?.toLowerCase() === 'sold' || material.action === 'sold',
    rawDimensionString: rawDimensionString || undefined
  }
}

// Custom Remainder Input Component
interface CustomRemainderInputProps {
  value: string
  onChange: (value: string) => void
  onAddRow: () => void
  onRemove?: () => void
  theme: Theme
  placeholder?: string
  showRemove?: boolean
}

function CustomRemainderInput({ value, onChange, onAddRow, onRemove, theme, placeholder, showRemove }: CustomRemainderInputProps) {
  const handleBlur = () => {
    // Auto-create new row when user finishes typing and field has value
    if (value.trim()) {
      onAddRow()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Auto-create new row on Enter key
    if (e.key === 'Enter' && value.trim()) {
      e.preventDefault()
      onAddRow()
    }
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        onKeyPress={handleKeyPress}
        placeholder={placeholder || "e.g., 1220x2440 or 1025x2030x920x605"}
        className={`flex-1 px-3 py-2 rounded-lg border transition-colors text-sm ${
          theme === 'dark'
            ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:bg-white/15 focus:border-white/40'
            : 'bg-white/50 border-white/60 text-gray-800 placeholder-gray-500 focus:bg-white/70 focus:border-white/80'
        } focus:outline-none`}
      />
      {showRemove && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={`px-3 py-2 rounded-lg border transition-colors ${
            theme === 'dark'
              ? 'bg-red-500/20 border-red-500/30 text-red-200 hover:bg-red-500/30'
              : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onAddRow}
        className={`px-3 py-2 rounded-lg border transition-colors ${
          theme === 'dark'
            ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
            : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/70'
        }`}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

interface ScanBarcodeFormProps {
  onBack: () => void
  theme: Theme
}

export function ScanBarcodeForm({ onBack, theme }: ScanBarcodeFormProps) {
  const [loading, setLoading] = useState(false)
  const [scanMode, setScanMode] = useState<'choice' | 'camera' | 'manual' | null>(null)
  const [manualBarcode, setManualBarcode] = useState('')
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null)
  const [showCutForm, setShowCutForm] = useState(false)
  const [showSoldForm, setShowSoldForm] = useState(false)
  const [showChangeRackForm, setShowChangeRackForm] = useState(false)
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [showApproveCutForm, setShowApproveCutForm] = useState(false)
  const [approveCutFormData, setApproveCutFormData] = useState({ 
    rack: '',
    location: '' 
  })
  const [generatingBarcode, setGeneratingBarcode] = useState(false)
  const [newRackInput, setNewRackInput] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [soldFormData, setSoldFormData] = useState({
    soldTo: '',
    soldPrice: '',
    soldDate: new Date().toISOString().split('T')[0],
    notes: ''
  })
  const [cutData, setCutData] = useState({
    pieceLength: '',
    pieceWidth: '',
    quantity: '1',
    bladeThickness: ''
  })
  const [cutPlanImage, setCutPlanImage] = useState<string | null>(null)
  const [svgData, setSvgData] = useState<string | null>(null)
  const [showCutPlanView, setShowCutPlanView] = useState(false)
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null)
  const [cameraError, setCameraError] = useState<string>('')
  const [scanError, setScanError] = useState<string>('')
  const [svgZoom, setSvgZoom] = useState(100)
  const scannerRef = useRef<HTMLDivElement>(null)

  const [showRemnantChoice, setShowRemnantChoice] = useState(false)
  const [remnantMessage, setRemnantMessage] = useState<string>('')
  const [cutPlanResults, setCutPlanResults] = useState<any>(null)
  const [showBarcodeResult, setShowBarcodeResult] = useState(false)
  const [barcodeResult, setBarcodeResult] = useState<{
    barcodeId: string
    inventoryId: string
    message: string
    labelUrl: string
  } | null>(null)

  const [showRemnantSvgs, setShowRemnantSvgs] = useState(false)
  const [remnantSvgs, setRemnantSvgs] = useState<any[]>([])
  const [selectedRemnantIndex, setSelectedRemnantIndex] = useState(0)
  const [totalRequestedPieces, setTotalRequestedPieces] = useState(0)
  const [remnantZoom, setRemnantZoom] = useState(100)
  const [remnantFormData, setRemnantFormData] = useState({ rack: '', location: '' })
  const [remnantPdfUrl, setRemnantPdfUrl] = useState<string | null>(null)
  const [selectedDimensionStrings, setSelectedDimensionStrings] = useState<string[]>([])

  // Track PDF URLs for each remnant (key: remnantIndex, value: PDF URL)
  const [remnantPdfUrls, setRemnantPdfUrls] = useState<Map<number, string>>(new Map())
  // Track pieces that have been successfully barcoded
  const [barcodedPiecesCount, setBarcodedPiecesCount] = useState(0)

  // Preserve cut match data for barcode generation
  const [preservedCutMatchData, setPreservedCutMatchData] = useState<any>(null)
  const [locationFormData, setLocationFormData] = useState({ location: '', rack: '' })
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null)
  const [showBarcodeSuccess, setShowBarcodeSuccess] = useState(false)

  // Custom remainder inputs for remnant barcode generation
  const [customRemainders, setCustomRemainders] = useState<string[]>([''])

  // Custom remainder inputs for full sheet approve cut plan
  const [customFullSheetRemainders, setCustomFullSheetRemainders] = useState<string[]>([''])

  // Selected remainders for full sheet (from checkboxes)
  const [selectedFullSheetRemainders, setSelectedFullSheetRemainders] = useState<string[]>([])

  // Auto-start camera when scanMode changes to 'camera'
  useEffect(() => {
    if (scanMode === 'camera' && !scanner) {
      startCameraScanning()
    } else if (scanMode !== 'camera' && scanner) {
      stopCameraScanning()
    }
  }, [scanMode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanner) {
        scanner.stop().catch(console.error)
      }
    }
  }, [scanner])

  // Reset selected dimension strings and custom remainders when changing remnants
  useEffect(() => {
    setSelectedDimensionStrings([])
    setCustomRemainders([''])
  }, [selectedRemnantIndex])

  // Helper functions for custom remainder management
  const handleAddCustomRemainder = () => {
    setCustomRemainders([...customRemainders, ''])
  }

  const handleRemoveCustomRemainder = (index: number) => {
    const newRemainders = customRemainders.filter((_, i) => i !== index)
    setCustomRemainders(newRemainders.length > 0 ? newRemainders : [''])
  }

  const handleCustomRemainderChange = (index: number, value: string) => {
    const newRemainders = [...customRemainders]
    newRemainders[index] = value
    setCustomRemainders(newRemainders)

    // Auto-add new row if this is the last row and it has content
    if (index === customRemainders.length - 1 && value.trim()) {
      setCustomRemainders([...newRemainders, ''])
    }
  }

  // Helper functions for full sheet custom remainder management
  const handleAddCustomFullSheetRemainder = () => {
    setCustomFullSheetRemainders([...customFullSheetRemainders, ''])
  }

  const handleRemoveCustomFullSheetRemainder = (index: number) => {
    const newRemainders = customFullSheetRemainders.filter((_, i) => i !== index)
    setCustomFullSheetRemainders(newRemainders.length > 0 ? newRemainders : [''])
  }

  const handleCustomFullSheetRemainderChange = (index: number, value: string) => {
    const newRemainders = [...customFullSheetRemainders]
    newRemainders[index] = value
    setCustomFullSheetRemainders(newRemainders)

    // Auto-add new row if this is the last row and it has content
    if (index === customFullSheetRemainders.length - 1 && value.trim()) {
      setCustomFullSheetRemainders([...newRemainders, ''])
    }
  }

  const handleManualScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualBarcode.trim()) return

    setScanError('')
    setLoading(true)
    try {
      const response = await api.getItemByBarcode(manualBarcode.trim())
      console.log('API Response:', response)

      if (response.success && response.data) {
        const mappedItem = mapApiResponseToInventoryItem(response.data)
        console.log('Mapped Item:', mappedItem)
        setScannedItem(mappedItem)
      } else {
        const errorMsg = response.error || 'Material not found'
        setScanError(errorMsg)
        setTimeout(() => {
          setScanError('')
          setManualBarcode('')
          setScanMode('choice')
        }, 2500)
      }
    } catch (error) {
      console.error('Error fetching item:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      setScanError(errorMsg)
      setTimeout(() => {
        setScanError('')
        setManualBarcode('')
        setScanMode('choice')
      }, 2500)
    } finally {
      setLoading(false)
    }
  }

  const startCameraScanning = async () => {
    if (!scannerRef.current || scanner) return
    
    setCameraError('')
    
    try {
      const html5QrCode = new Html5Qrcode("qr-reader")
      
      // Get available cameras
      const devices = await Html5Qrcode.getCameras()
      if (devices && devices.length === 0) {
        setCameraError('No cameras found on this device')
        return
      }

      // Use back camera if available, otherwise use first camera
      const cameraId = devices.find(device => 
        device.label.toLowerCase().includes('back') || 
        device.label.toLowerCase().includes('rear')
      )?.id || devices[0].id

      await html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          // Success callback - barcode scanned
          console.log('Barcode scanned:', decodedText)
          handleBarcodeScanned(decodedText)
        },
        (error) => {
          // Error callback - can be ignored for continuous scanning
          // console.log('Scanning error:', error)
        }
      )
      
      setScanner(html5QrCode)
    } catch (error) {
      console.error('Camera start error:', error)
      if (error instanceof Error && error.message.includes('Permission denied')) {
        setCameraError('Camera access denied. Please allow camera permissions in your browser settings and refresh the page.')
      } else {
        setCameraError('Failed to start camera. Please check permissions.')
      }
    }
  }

  const handleBarcodeScanned = async (barcodeText: string) => {
    // Stop camera immediately to prevent multiple scans
    if (scanner) {
      try {
        await scanner.stop()
        setScanner(null)
      } catch (error) {
        console.error('Error stopping camera:', error)
      }
    }

    setScanError('')
    setLoading(true)
    try {
      const response = await api.getItemByBarcode(barcodeText.trim())
      console.log('API Response:', response)

      if (response.success && response.data) {
        const mappedItem = mapApiResponseToInventoryItem(response.data)
        console.log('Mapped Item:', mappedItem)
        setScannedItem(mappedItem)
      } else {
        const errorMsg = response.error || 'Material not found'
        setScanError(errorMsg)
        setTimeout(() => {
          setScanError('')
          setScanMode('choice')
        }, 2500)
      }
    } catch (error) {
      console.error('Error fetching item:', error)
      setScanError('Item not found. Please check the barcode and try again.')
      setTimeout(() => {
        setScanError('')
        setScanMode('choice')
      }, 2500)
    } finally {
      setLoading(false)
    }
  }

  const stopCameraScanning = async () => {
    if (scanner) {
      try {
        await scanner.stop()
        setScanner(null)
      } catch (error) {
        console.error('Error stopping camera:', error)
      }
    }
  }

  const handleMarkAsSold = async () => {
    if (!scannedItem) return
    
    // Prevent multiple rapid clicks
    if (loading) return
    
    setLoading(true)
    try {
      const response = await fetch('https://n8n.mkindustrials.com/webhook/mark-sold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scannedItem),
      })
      
      if (response.ok) {
        alert('Item marked as sold successfully!')
        setScannedItem({
          ...scannedItem,
          Status: 'Sold',
          isSold: true
        })
      } else {
        throw new Error('Failed to mark as sold')
      }
      
    } catch (error) {
      alert(`Failed to mark item as sold: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

 const handleCutPieces = async (e: React.FormEvent) => {
  e.preventDefault()
  if (!scannedItem) return

  setLoading(true)
  try {
    // Parse cut dimensions
    const pieceLength = parseInt(cutData.pieceLength) || 0
    const pieceWidth = cutData.pieceWidth ? parseInt(cutData.pieceWidth) : 0

    // Create dimension string for the cut pieces
    let dimensionString = ''
    if (pieceWidth > 0) {
      // For sheets: length x width format
      dimensionString = `${pieceLength}x${pieceWidth}`
    } else {
      // For rods/tubes: just length
      dimensionString = `${pieceLength}`
    }

    // Repeat the dimension string based on quantity
    const quantity = parseInt(cutData.quantity) || 1
    const dimensionParts = []
    for (let i = 0; i < quantity; i++) {
      dimensionParts.push(dimensionString)
    }
    const finalDimensionString = dimensionParts.join('x')

    console.log('📐 User-provided finalDimensionString (fallback):', finalDimensionString)
    
    console.log('📄 Sending cut plan data:', {
      Material: `${scannedItem.ProductName} ${scannedItem.ProductColor}`.trim(),
      Thickness_mm: scannedItem.Thickness_mm,
      DimensionString: finalDimensionString,
      Rack: scannedItem.Rack,
      Quantity: 1,
      BarcodeID: scannedItem.BarcodeID,
      CreatedBy: 'employee',
      Date: new Date().toLocaleDateString('en-GB')
    })
    
    // Use the generateCutMatch API method
    const response = await api.generateCutMatch({
      BarcodeID: scannedItem.BarcodeID,
      Material: `${scannedItem.ProductName} ${scannedItem.ProductColor}`.trim(),
      Thickness_mm: scannedItem.Thickness_mm,
      OriginalLength_mm: scannedItem.Length_mm,
      OriginalWidth_mm: scannedItem.Width_mm,
      PieceLength_mm: pieceLength,
      PieceWidth_mm: pieceWidth > 0 ? pieceWidth : undefined,
      Quantity: quantity,
      BladeThickness_mm: cutData.bladeThickness ? parseFloat(cutData.bladeThickness) : undefined,
      CreatedBy: 'employee',
      Date: new Date().toISOString().split('T')[0]
    })
    
    console.log('✅ Cut plan response:', response)
    console.log('📦 Full response.data:', JSON.stringify(response.data, null, 2))

    // Handle response that might be an array or a single object
    let responseData = response.data
    if (Array.isArray(responseData)) {
      responseData = responseData[0]
    }

    if (responseData?.success && responseData?.remnants?.length > 0) {
      console.log('🎯 Remnant response detected:', responseData.remnantCount, 'remnants')
      setTotalRequestedPieces(responseData.requestedTotal || 0)
      setRemnantSvgs(responseData.remnants)
      setSelectedRemnantIndex(0)
      setShowRemnantSvgs(true)
      return
    }

    // Check for SVG in multiple possible locations
    const directSvg = responseData?.svg || responseData?.cutPlan?.svg || responseData?.cutPlanSvg
    if (directSvg) {
      console.log('🎯 Direct SVG response detected')
      const svg = directSvg
      const remainders = responseData.remainders || responseData.cutPlan?.remainders || []
      const sourceBarcodeId = responseData.sheetInfo?.barcode || responseData.sourceBarcodeId || scannedItem.BarcodeID
      const backendDimensionString = responseData.dimensionString || ''
      const dataToStore = {
        sourceBarcodeId,
        svg,
        dimensionString: backendDimensionString,
        labels: remainders.length > 0 ? remainders.map((r: any) => r.label) : [],
        remainders
      }
      console.log('🔍 Initial visualize remainders:', remainders)
      setPreservedCutMatchData(dataToStore)
      setSvgData(svg)
      setCutPlanResults([responseData])
      setShowCutPlanView(true)
      return
    }

    const candidates = responseData?.candidates || []
    const firstResult = candidates[0]

    if (!firstResult) {
      console.error('❌ No usable result in response. Keys:', Object.keys(responseData || {}))
      return
    }

    const svg = firstResult.cutPlanSvg || firstResult.svg || firstResult.cutPlan?.svg
    const remainders = firstResult.remainders || firstResult.cutPlan?.remainders || []
    const sourceBarcodeId = firstResult.sourceBarcodeId || firstResult.sheetInfo?.barcode || scannedItem.BarcodeID

    if (!svg) {
      if (firstResult.message) {
        setRemnantMessage(firstResult.message)
        setShowRemnantChoice(true)
        return
      }
      console.error('❌ No SVG found in response')
      return
    }

    // ========================================
    // Extract DIMENSION STRING FROM BACKEND (with fallback to user input)
    // ========================================
    const backendDimensionString = firstResult.dimensionString || finalDimensionString || ''

    // ========================================
    // STORE THE COMPLETE DATA (SVG + REMAINDERS + LABELS + DIMENSION STRING)
    // ========================================
    const dataToStore = {
      sourceBarcodeId,
      svg,
      dimensionString: backendDimensionString,
      labels: remainders.length > 0 ? remainders.map(r => r.label) : [],
      remainders
    }

    console.log('✅ ✅ ✅ FINAL DATA BEING STORED:', dataToStore)
    console.log('Dimension String (Backend or Fallback):', dataToStore.dimensionString)
    console.log('Used backend value:', !!firstResult.dimensionString)
    console.log('Labels count:', dataToStore.labels.length)
    console.log('Remainders count:', dataToStore.remainders.length)

    setPreservedCutMatchData(dataToStore)
    setSvgData(svg)
    setCutPlanResults(candidates)
    setShowCutPlanView(true)
    
  } catch (error) {
    console.error('❌ Error creating cut plan:', error)
    console.error('❌ Error details:', JSON.stringify(error, null, 2))
    alert(`Failed to create cut plan: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    setLoading(false)
  }
}

  const handleChangeRackSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scannedItem || (!newRackInput.trim() && !purchaseDate.trim())) return
    
    setLoading(true)
    try {
      // Only send fields that are actually filled
      const rackToSend = newRackInput.trim() || undefined
      const dateToSend = purchaseDate.trim() || undefined
      
      const response = await api.changeRackAndDate(scannedItem.BarcodeID, rackToSend, dateToSend)
      
      if (response.success) {
        console.log('Changing rack position for barcode:', scannedItem.BarcodeID, 'to new rack:', newRackInput)
        setScannedItem({
          ...scannedItem,
          Rack: newRackInput.trim() || scannedItem.Rack,
          PurchaseDate: purchaseDate.trim() || scannedItem.PurchaseDate
        })
        setShowChangeRackForm(false)
        alert('Information updated successfully!')
      } else {
        throw new Error(response.error || 'Failed to update information')
      }
    } catch (error) {
      console.error('Error updating information:', error)
      alert('Failed to update information. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const goBackToCamera = () => {
    setScannedItem(null)
    setManualBarcode('')
    setScanMode('camera')
  }

  const handleCloseLocationForm = () => {
    setShowLocationForm(false)
    setLocationFormData({ location: '', rack: '' })
  }

const handleApproveCutPlan = () => {
  // Don't overwrite preservedCutMatchData - it's already set from handleCutPieces/handleRevisualizeCutPlan
  console.log('🎯 Opening form with preserved data:', preservedCutMatchData)
  setShowApproveCutForm(true)
}



  const handleRevisualize = async () => {
    // Implementation for re-visualizing cut plan
    console.log('Re-visualize clicked')
  }

  const handleRevisualizeCutPlan = async () => {
    if (!scannedItem || !cutData) return

    setLoading(true)
    try {
      const pieceLength = parseInt(cutData.pieceLength) || 0
      const pieceWidth = cutData.pieceWidth ? parseInt(cutData.pieceWidth) : 0
      const quantity = parseInt(cutData.quantity) || 1

      // Create fallback dimension string
      let dimensionString = ''
      if (pieceWidth > 0) {
        dimensionString = `${pieceLength}x${pieceWidth}`
      } else {
        dimensionString = `${pieceLength}`
      }
      const dimensionParts = []
      for (let i = 0; i < quantity; i++) {
        dimensionParts.push(dimensionString)
      }
      const fallbackDimensionString = dimensionParts.join('x')

      console.log('📄 Revisualize: Calling webhook with random strategy')
      console.log('📐 Fallback dimension string:', fallbackDimensionString)

      // Call the SAME API with strategy: 'random'
      const response = await api.generateCutMatch({
        BarcodeID: scannedItem.BarcodeID,
        Material: `${scannedItem.ProductName} ${scannedItem.ProductColor}`.trim(),
        Thickness_mm: scannedItem.Thickness_mm,
        OriginalLength_mm: scannedItem.Length_mm,
        OriginalWidth_mm: scannedItem.Width_mm,
        PieceLength_mm: pieceLength,
        PieceWidth_mm: pieceWidth > 0 ? pieceWidth : undefined,
        Quantity: quantity,
        BladeThickness_mm: cutData.bladeThickness ? parseFloat(cutData.bladeThickness) : undefined,
        strategy: 'random', // ⭐ This generates a different layout
        isRemnantGeneration: true,
        CreatedBy: 'employee',
        Date: new Date().toISOString().split('T')[0]
      })

      console.log('✅ Revisualized cut plan:', response)
      console.log('📦 REVISUALIZE Full response.data:', JSON.stringify(response.data, null, 2))
      
      // ========================================
      // WORLD-CLASS FIX: Handle both array formats
      // ========================================
      const resultArray = Array.isArray(response.data) ? response.data : (response.data?.candidates || [])
      const firstResult = resultArray[0]
      
      console.log('📦 REVISUALIZE First result extracted:', firstResult)
      
      if (!firstResult) {
        console.error('❌ REVISUALIZE No result found in response')
        return
      }
      
      // ========================================
      // Extract SVG from any possible location
      // ========================================
      const svg = firstResult.cutPlan?.svg || firstResult.cutPlanSvg
      
      // ========================================
      // Extract REMAINDERS from any possible location
      // ========================================
      const remainders = firstResult.remainders || firstResult.cutPlan?.remainders || []
      
      // ========================================
      // Extract SOURCE BARCODE ID
      // ========================================
      const sourceBarcodeId = firstResult.sheetInfo?.barcode || firstResult.sourceBarcodeId || scannedItem.BarcodeID
      
      console.log('📦 REVISUALIZE ✅ EXTRACTED DATA:', {
        hasSvg: !!svg,
        svgLength: svg?.length || 0,
        remaindersCount: remainders.length,
        sourceBarcodeId,
        remainders: remainders
      })
      
      if (!svg) {
        console.error('❌ REVISUALIZE No SVG found in response')
        return
      }
      
      // ========================================
      // Extract DIMENSION STRING FROM BACKEND (with fallback to user input)
      // ========================================
      const backendDimensionString = firstResult.dimensionString || fallbackDimensionString || ''

      // ========================================
      // STORE THE COMPLETE DATA (SVG + REMAINDERS + LABELS + DIMENSION STRING)
      // ========================================
      const dataToStore = {
        sourceBarcodeId,
        svg,
        dimensionString: backendDimensionString,
        labels: remainders.length > 0 ? remainders.map(r => r.label) : [],
        remainders
      }

      console.log('✅ ✅ ✅ REVISUALIZE FINAL DATA BEING STORED:', dataToStore)
      console.log('REVISUALIZE Dimension String (Backend or Fallback):', dataToStore.dimensionString)
      console.log('REVISUALIZE Used backend value:', !!firstResult.dimensionString)
      console.log('REVISUALIZE Labels count:', dataToStore.labels.length)
      console.log('REVISUALIZE Remainders count:', dataToStore.remainders.length)

      setPreservedCutMatchData(dataToStore)
      setSvgData(svg)
      setCutPlanResults(resultArray)
      setShowCutPlanView(true)

    } catch (error) {
      console.error('❌ Error revisualize cut plan:', error)
      alert(`Failed to revisualize: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const downloadSvg = () => {
    if (!svgData) return

    const blob = new Blob([svgData], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cut-plan-${Date.now()}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleGenerateCutPlanForRemaining = async () => {
    if (!scannedItem || remnantSvgs.length === 0) return

    setLoading(true)
    try {
      const pieceLength = parseInt(cutData.pieceLength) || 0
      const pieceWidth = cutData.pieceWidth ? parseInt(cutData.pieceWidth) : 0
      const totalPlaced = remnantSvgs.reduce((sum: number, r: any) => sum + (r.nestingResult?.placedPieces || 0), 0)
      const remainingPieces = totalRequestedPieces - totalPlaced

      console.log('📊 Generating cut plan for remaining pieces:', {
        totalRequested: totalRequestedPieces,
        totalPlaced,
        remainingPieces
      })

      const response = await api.generateCutMatch({
        BarcodeID: scannedItem.BarcodeID,
        Material: `${scannedItem.ProductName} ${scannedItem.ProductColor}`.trim(),
        Thickness_mm: scannedItem.Thickness_mm,
        OriginalLength_mm: scannedItem.Length_mm,
        OriginalWidth_mm: scannedItem.Width_mm,
        PieceLength_mm: pieceLength,
        PieceWidth_mm: pieceWidth > 0 ? pieceWidth : undefined,
        Quantity: remainingPieces,
        BladeThickness_mm: cutData.bladeThickness ? parseFloat(cutData.bladeThickness) : undefined,
        isRemnantGeneration: true,
        CreatedBy: 'employee',
        Date: new Date().toISOString().split('T')[0]
      })

      console.log('✅ Cut plan for remaining pieces response:', response)

      const resultArray = Array.isArray(response.data) ? response.data : (response.data?.candidates || [])
      const firstResult = resultArray[0]

      if (!firstResult) {
        console.error('❌ No result found in response')
        return
      }

      const svg = firstResult.cutPlan?.svg || firstResult.cutPlanSvg
      if (!svg) {
        console.error('❌ No SVG found in response')
        return
      }

      const remainders = firstResult.remainders || firstResult.cutPlan?.remainders || []
      const sourceBarcodeId = firstResult.sheetInfo?.barcode || firstResult.sourceBarcodeId || scannedItem.BarcodeID
      const backendDimensionString = firstResult.dimensionString || ''

      const dataToStore = {
        sourceBarcodeId,
        svg,
        dimensionString: backendDimensionString,
        labels: remainders.length > 0 ? remainders.map(r => r.label) : [],
        remainders
      }

      setPreservedCutMatchData(dataToStore)
      setSvgData(svg)
      setCutPlanResults(resultArray)
      setShowRemnantSvgs(false)
      setShowCutPlanView(true)

    } catch (error) {
      console.error('❌ Error generating cut plan for remaining pieces:', error)
      alert(`Failed to generate cut plan: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRevisualizeRemnant = async () => {
    if (!scannedItem || remnantSvgs.length === 0) return

    setLoading(true)
    try {
      const pieceLength = parseInt(cutData.pieceLength) || 0
      const pieceWidth = cutData.pieceWidth ? parseInt(cutData.pieceWidth) : 0
      const originalQuantity = parseInt(cutData.quantity) || 1

      // ⭐ NEW: Subtract pieces that have already been barcoded
      const adjustedQuantity = Math.max(1, originalQuantity - barcodedPiecesCount)

      console.log('🔄 Revisualize remnant with random strategy')
      console.log('📊 Original quantity:', originalQuantity, '| Barcoded:', barcodedPiecesCount, '| Adjusted:', adjustedQuantity)

      const response = await api.generateCutMatch({
        BarcodeID: scannedItem.BarcodeID,
        Material: `${scannedItem.ProductName} ${scannedItem.ProductColor}`.trim(),
        Thickness_mm: scannedItem.Thickness_mm,
        OriginalLength_mm: scannedItem.Length_mm,
        OriginalWidth_mm: scannedItem.Width_mm,
        PieceLength_mm: pieceLength,
        PieceWidth_mm: pieceWidth > 0 ? pieceWidth : undefined,
        Quantity: adjustedQuantity,  // ⭐ Use adjusted quantity
        BladeThickness_mm: cutData.bladeThickness ? parseFloat(cutData.bladeThickness) : undefined,
        strategy: 'random',
        CreatedBy: 'employee',
        Date: new Date().toISOString().split('T')[0]
      })

      console.log('✅ Revisualize response:', response)

      let remnantResponse = response.data
      if (Array.isArray(response.data) && response.data[0]) {
        remnantResponse = response.data[0]
      }

      if (remnantResponse?.success && remnantResponse?.remnants && remnantResponse?.remnantCount) {
        console.log('🎯 New remnants from revisualize')
        setTotalRequestedPieces(remnantResponse.requestedTotal)

        // Preserve remnants that already have PDFs generated
        const newRemnants = remnantResponse.remnants.map((newRemnant: any, index: number) => {
          // Check if this remnant index already has a PDF
          const hasPdf = remnantPdfUrls.has(index)
          if (hasPdf && remnantSvgs[index]) {
            // Preserve the old remnant data (including SVG and PDF)
            console.log(`Preserving remnant #${index} with existing PDF`)
            return remnantSvgs[index]
          }
          // Use new remnant data for remnants without PDFs
          return newRemnant
        })

        setRemnantSvgs(newRemnants)
        // DO NOT reset selectedRemnantIndex - stay on current view
        return
      }

      const resultArray = Array.isArray(response.data) ? response.data : (response.data?.candidates || [])
      const firstResult = resultArray[0]

      if (!firstResult) {
        console.error('❌ No result found in response')
        return
      }

      const svg = firstResult.cutPlan?.svg || firstResult.cutPlanSvg
      if (!svg) {
        console.error('❌ No SVG found in response')
        return
      }

      const remainders = firstResult.remainders || firstResult.cutPlan?.remainders || []
      const sourceBarcodeId = firstResult.sheetInfo?.barcode || firstResult.sourceBarcodeId || scannedItem.BarcodeID
      const backendDimensionString = firstResult.dimensionString || ''

      const dataToStore = {
        sourceBarcodeId,
        svg,
        dimensionString: backendDimensionString,
        labels: remainders.length > 0 ? remainders.map(r => r.label) : [],
        remainders
      }

      setPreservedCutMatchData(dataToStore)
      setSvgData(svg)
      setCutPlanResults(resultArray)
      setShowRemnantSvgs(false)
      setShowCutPlanView(true)

    } catch (error) {
      console.error('❌ Error revisualize:', error)
      alert(`Failed to revisualize: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

const handleGenerateBarcodeWithLocation = async (e: React.FormEvent) => {
  e.preventDefault()

  if (!locationFormData.rack || !locationFormData.location) {
    alert('Please fill in both rack and location')
    return
  }

  if (!preservedCutMatchData) {
    alert('No cut match data available. Please generate a cut plan first.')
    return
  }

  // Combine selected checkboxes (from cut plan view) and custom remainders
  // Expand LxW to LxWxLxW format for both checkboxes and custom inputs
  const expandedCheckboxRemainders = selectedFullSheetRemainders.map(r => expandDimensionString(r))
  const validCustomFullSheetRemainders = customFullSheetRemainders
    .filter(r => r.trim())
    .map(r => expandDimensionString(r))
  const allSelectedRemainders = [...expandedCheckboxRemainders, ...validCustomFullSheetRemainders]

  setGeneratingBarcode(true)

  try {
    const payload: any = {
      sourceBarcodeId: preservedCutMatchData.sourceBarcodeId,
      svg: preservedCutMatchData.svg,
      rack: locationFormData.rack,
      location: locationFormData.location,
      isRemnantGeneration: false
    }

    // If user selected specific remainders or added custom ones, send them as dimensionString1, etc.
    if (allSelectedRemainders.length > 0) {
      allSelectedRemainders.forEach((remainder, index) => {
        payload[`dimensionString${index + 1}`] = remainder
      })
    } else {
      // Otherwise, send the original dimensionString and labels/remainders
      payload.dimensionString = preservedCutMatchData.dimensionString
      payload.labels = preservedCutMatchData.labels
      payload.remainders = preservedCutMatchData.remainders
    }

    console.log('🚀 Triggering webhook/generate-barcode with payload:', payload)

    const response = await fetch('https://n8n.mkindustrials.com/webhook/generate-barcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) throw new Error('HTTP error')

    const responseData = await response.json()
    console.log('✅ Webhook response:', responseData)

    const data = Array.isArray(responseData) ? responseData[0] : responseData

    if (data.success === 'true' || data.success === true) {
      if (data.labelLink) {
        setGeneratedPdfUrl(data.labelLink)
        setShowBarcodeSuccess(true)
        setShowLocationForm(false)
        setShowApproveCutForm(false)
        setLocationFormData({ location: '', rack: '' })
      }
    } else {
      alert('Barcode generated but no label link received')
    }

  } catch (err) {
    console.error('❌ Error generating barcode:', err)
    alert('Failed to generate barcode')
  } finally {
    setGeneratingBarcode(false)
  }
}

const simplifyDimensionString = (dimString: string): string => {
  const parts = dimString.split('x')

  if (parts.length === 2) {
    return dimString
  }

  if (parts.length === 4 && parts[0] === parts[2] && parts[1] === parts[3]) {
    return `${parts[0]}x${parts[1]}`
  }

  if (parts.length === 6 && parts[0] === parts[2] && parts[0] === parts[4] && parts[1] === parts[3] && parts[1] === parts[5]) {
    return `${parts[0]}x${parts[1]}`
  }

  return dimString
}

const expandDimensionString = (dimString: string): string => {
  const normalized = dimString.replace(/×/g, 'x').trim()
  const parts = normalized.split('x').filter(p => p.trim())

  if (parts.length === 2) {
    return `${parts[0]}x${parts[1]}x${parts[0]}x${parts[1]}`
  }

  return normalized
}

const handleApproveRemnantAndGenerateBarcode = async (e: React.FormEvent) => {
  e.preventDefault()

  if (!remnantFormData.rack || !remnantFormData.location) {
    alert('Please fill in both rack and location')
    return
  }

  if (remnantSvgs.length === 0 || !remnantSvgs[selectedRemnantIndex]) {
    alert('No remnant selected')
    return
  }

  // Combine selected checkboxes and custom remainders
  // Expand LxW to LxWxLxW format for both checkboxes and custom inputs
  const expandedCheckboxDimStrings = selectedDimensionStrings.map(r => expandDimensionString(r))
  const validCustomRemainders = customRemainders
    .filter(r => r.trim())
    .map(r => expandDimensionString(r))
  const allDimensionStrings = [...expandedCheckboxDimStrings, ...validCustomRemainders]

  if (allDimensionStrings.length === 0) {
    alert('Please select at least one remainder or add a custom remainder to generate barcode')
    return
  }

  const confirmed = window.confirm(`Generate barcode for ${allDimensionStrings.length} remainder(s)?`)
  if (!confirmed) {
    return
  }

  setGeneratingBarcode(true)

  try {
    const currentRemnant = remnantSvgs[selectedRemnantIndex]

    const payload: any = {
      sourceBarcodeId: currentRemnant.barcodeId,
      svg: currentRemnant.svg,
      rack: remnantFormData.rack,
      location: remnantFormData.location,
      isRemnantGeneration: true
    }

    allDimensionStrings.forEach((dimStr, index) => {
      payload[`dimensionString${index + 1}`] = dimStr
    })

    console.log('🚀 Triggering webhook/generate-barcode for remnant:', payload)

    const response = await fetch('https://n8n.mkindustrials.com/webhook/generate-barcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) throw new Error('HTTP error')

    const responseData = await response.json()
    console.log('✅ Webhook response:', responseData)

    const data = Array.isArray(responseData) ? responseData[0] : responseData

    if (data.success === 'true' || data.success === true) {
      if (data.labelLink) {
        // ⭐ NEW: Store PDF URL for this specific remnant
        const newPdfUrls = new Map(remnantPdfUrls)
        newPdfUrls.set(selectedRemnantIndex, data.labelLink)
        setRemnantPdfUrls(newPdfUrls)

        // ⭐ NEW: Track pieces that have been barcoded
        const piecesInThisRemnant = currentRemnant.nestingResult?.placedPieces || 0
        setBarcodedPiecesCount(prev => prev + piecesInThisRemnant)
      }
    } else {
      alert('Barcode generated but no label link received')
    }

  } catch (err) {
    console.error('❌ Error generating remnant barcode:', err)
    alert('Failed to generate barcode')
  } finally {
    setGeneratingBarcode(false)
  }
}

const downloadRemnantSvg = () => {
  if (remnantSvgs.length === 0 || !remnantSvgs[selectedRemnantIndex]) {
    alert('No remnant SVG available')
    return
  }

  const currentRemnant = remnantSvgs[selectedRemnantIndex]
  const svg = currentRemnant.svg
  const filename = `remnant-${currentRemnant.barcodeId || 'unknown'}.svg`

  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

if (showRemnantSvgs && remnantSvgs.length > 0) {
  const currentRemnant = remnantSvgs[selectedRemnantIndex]
  const totalPlaced = remnantSvgs.reduce((sum: number, r: any) => sum + (r.nestingResult?.placedPieces || 0), 0)
  const remainingPieces = totalRequestedPieces - totalPlaced

  // ⭐ Check if current remnant has a PDF generated
  const currentRemnantPdfUrl = remnantPdfUrls.get(selectedRemnantIndex)
  const hasPdfForCurrentRemnant = !!currentRemnantPdfUrl

  return (
    <div className={`min-h-screen p-4 ${theme === 'dark' ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`}>
      <div className="max-w-7xl mx-auto pt-8">
        <button
          onClick={() => {
            setShowRemnantSvgs(false)
            setRemnantSvgs([])
            setRemnantFormData({ rack: '', location: '' })
            setRemnantPdfUrl(null)
            setSelectedDimensionStrings([])
            setRemnantPdfUrls(new Map())
            setBarcodedPiecesCount(0)
          }}
          className={`flex items-center gap-2 mb-6 transition-colors ${theme === 'dark' ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-800'}`}
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>

        <div className={`backdrop-blur-md rounded-2xl p-4 sm:p-6 border ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-white/40 border-white/50'}`}>
          <h2 className={`text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-center ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
            Remnants Found
          </h2>

          {/* ⭐ FIXED: Responsive message box */}
          <div className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl ${theme === 'dark' ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-blue-50 border border-blue-300'}`}>
            <p className={`text-center text-sm sm:text-base font-medium ${theme === 'dark' ? 'text-blue-200' : 'text-blue-700'} break-words`}>
              There are <span className="font-bold">{remnantSvgs.length}</span> remnant{remnantSvgs.length > 1 ? 's' : ''} present in rack <span className="font-bold">{currentRemnant?.rack}</span> with possible rectangles <span className="font-bold break-all">{currentRemnant?.possibleRectangles}</span> that could fit <span className="font-bold">{totalPlaced}</span> piece{totalPlaced > 1 ? 's' : ''}.
            </p>
            {remainingPieces > 0 && (
              <p className={`text-center text-xs sm:text-sm mt-2 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'}`}>
                <span className="font-bold">{remainingPieces}</span> piece{remainingPieces > 1 ? 's' : ''} still need to be cut from fresh material.
              </p>
            )}
          </div>

          <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-2">
            {remnantSvgs.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedRemnantIndex(Math.max(0, selectedRemnantIndex - 1))}
                  disabled={selectedRemnantIndex === 0}
                  className={`px-3 py-1 rounded text-sm border transition-colors ${
                    selectedRemnantIndex === 0
                      ? theme === 'dark' ? 'bg-white/5 border-white/10 text-white/40' : 'bg-gray-200 border-gray-300 text-gray-400'
                      : theme === 'dark' ? 'bg-white/10 border-white/20 text-white hover:bg-white/15' : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                  }`}
                >
                  Previous
                </button>

                <span className={`text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  Remnant {selectedRemnantIndex + 1} of {remnantSvgs.length} - {currentRemnant?.barcodeId}
                </span>

                <button
                  onClick={() => setSelectedRemnantIndex(Math.min(remnantSvgs.length - 1, selectedRemnantIndex + 1))}
                  disabled={selectedRemnantIndex === remnantSvgs.length - 1}
                  className={`px-3 py-1 rounded text-sm border transition-colors ${
                    selectedRemnantIndex === remnantSvgs.length - 1
                      ? theme === 'dark' ? 'bg-white/5 border-white/10 text-white/40' : 'bg-gray-200 border-gray-300 text-gray-400'
                      : theme === 'dark' ? 'bg-white/10 border-white/20 text-white hover:bg-white/15' : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                  }`}
                >
                  Next
                </button>
              </>
            )}

            <div className="flex items-center gap-2 sm:ml-auto">
              <button
                onClick={() => setRemnantZoom(Math.max(50, remnantZoom - 10))}
                className={`px-3 py-1 rounded text-sm border transition-colors ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                    : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                }`}
                title="Zoom Out"
              >
                −
              </button>
              <span className={`text-sm px-2 min-w-[50px] text-center ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {remnantZoom}%
              </span>
              <button
                onClick={() => setRemnantZoom(Math.min(200, remnantZoom + 10))}
                className={`px-3 py-1 rounded text-sm border transition-colors ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                    : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                }`}
                title="Zoom In"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
              {currentRemnant?.svg && (
                <div className={`mb-4 p-4 rounded-xl overflow-auto ${
                  theme === 'dark' ? 'bg-white/10' : 'bg-white/50'
                }`} style={{
                  backdropFilter: 'blur(12px)',
                  boxShadow: theme === 'dark'
                    ? '0 8px 16px -4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                    : '0 8px 16px -4px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
                  maxHeight: '500px',
                  maxWidth: '600px'
                }}>
                  <div
                    className="rounded-lg bg-white p-2"
                    dangerouslySetInnerHTML={{ __html: currentRemnant.svg }}
                    style={{ transform: `scale(${remnantZoom / 100})`, transformOrigin: 'top left', display: 'inline-block' }}
                  />
                </div>
              )}

              <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-white/10' : 'bg-white/50'}`}>
                <h3 className={`font-medium mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  {currentRemnant?.message}
                </h3>
                <p className={`text-sm ${theme === 'dark' ? 'text-white/70' : 'text-gray-600'}`}>
                  Product: {currentRemnant?.productName} | Thickness: {currentRemnant?.thickness}mm | Colour: {currentRemnant?.colour}
                </p>
              </div>

              <button
                onClick={downloadRemnantSvg}
                className={`w-full mt-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 border ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                    : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                }`}
              >
                <Download className="w-4 h-4" />
                Download SVG
              </button>
            </div>

            <div className="w-full lg:w-80">
              {/* ⭐ CONDITIONAL RENDERING: Show form OR success message */}
              {!hasPdfForCurrentRemnant ? (
                <form onSubmit={handleApproveRemnantAndGenerateBarcode} className="space-y-4">
                  {currentRemnant && (
                    <>
                      {(() => {
                        const dimStrings: Array<{ key: string; original: string; display: string }> = []

                        if (currentRemnant.dimensionString1) {
                          dimStrings.push({
                            key: 'dimensionString1',
                            original: currentRemnant.dimensionString1,
                            display: simplifyDimensionString(currentRemnant.dimensionString1)
                          })
                        }
                        if (currentRemnant.dimensionString2) {
                          dimStrings.push({
                            key: 'dimensionString2',
                            original: currentRemnant.dimensionString2,
                            display: simplifyDimensionString(currentRemnant.dimensionString2)
                          })
                        }
                        if (currentRemnant.dimensionString3) {
                          dimStrings.push({
                            key: 'dimensionString3',
                            original: currentRemnant.dimensionString3,
                            display: simplifyDimensionString(currentRemnant.dimensionString3)
                          })
                        }

                        if (dimStrings.length > 0) {
                          return (
                            <div className="w-full">
                              <label className={`block text-sm sm:text-base font-medium mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                                Select Remainders to Generate Barcode
                              </label>
                              <div className="space-y-2">
                                {dimStrings.map((dimStr) => (
                                  <label
                                    key={dimStr.key}
                                    className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border cursor-pointer transition-colors ${
                                      selectedDimensionStrings.includes(dimStr.original)
                                        ? theme === 'dark'
                                          ? 'bg-blue-500/20 border-blue-500/50'
                                          : 'bg-blue-100 border-blue-400'
                                        : theme === 'dark'
                                        ? 'bg-white/5 border-white/10 hover:bg-white/10'
                                        : 'bg-white/30 border-white/40 hover:bg-white/50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedDimensionStrings.includes(dimStr.original)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedDimensionStrings([...selectedDimensionStrings, dimStr.original])
                                        } else {
                                          setSelectedDimensionStrings(selectedDimensionStrings.filter(s => s !== dimStr.original))
                                        }
                                      }}
                                      className="w-4 h-4 sm:w-5 sm:h-5 rounded flex-shrink-0"
                                    />
                                    <span className={`font-medium text-sm sm:text-base break-all ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                                      {dimStr.display}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </>
                  )}

                  {/* Custom Remainder Inputs */}
                  <div className="w-full">
                    <label className={`block text-sm font-medium mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                      Custom Remainders (Optional)
                    </label>
                    <div className="space-y-2">
                      {customRemainders.map((remainder, index) => (
                        <CustomRemainderInput
                          key={index}
                          value={remainder}
                          onChange={(value) => handleCustomRemainderChange(index, value)}
                          onAddRow={handleAddCustomRemainder}
                          onRemove={index > 0 ? () => handleRemoveCustomRemainder(index) : undefined}
                          showRemove={index > 0}
                          theme={theme}
                          placeholder="e.g., 1220x2440 or dimensions separated by x"
                        />
                      ))}
                    </div>
                    <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-white/50' : 'text-gray-500'}`}>
                      Enter dimensions separated by 'x' (e.g., 1220x2440 or 1025x2030x920x605)
                    </p>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                      Rack
                    </label>
                    <input
                      type="text"
                      value={remnantFormData.rack}
                      onChange={(e) => setRemnantFormData({ ...remnantFormData, rack: e.target.value })}
                      placeholder="Enter rack"
                      className={`w-full px-3 py-2 rounded-lg border transition-colors ${
                        theme === 'dark'
                          ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:bg-white/15 focus:border-white/40'
                          : 'bg-white/50 border-white/60 text-gray-800 placeholder-gray-500 focus:bg-white/70 focus:border-white/80'
                      } focus:outline-none`}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                      Location
                    </label>
                    <select
                      value={remnantFormData.location}
                      onChange={(e) => setRemnantFormData({ ...remnantFormData, location: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border transition-colors ${
                        theme === 'dark'
                          ? 'bg-white/10 border-white/20 text-white focus:bg-white/15 focus:border-white/40'
                          : 'bg-white/50 border-white/60 text-gray-800 focus:bg-white/70 focus:border-white/80'
                      } focus:outline-none`}
                    >
                      <option value="">Select location</option>
                      <option value="warehouse">Warehouse</option>
                      <option value="office">Office</option>
                      <option value="godown">Godown</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={generatingBarcode}
                    className={`w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 ${
                      theme === 'dark'
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700'
                        : 'bg-gradient-to-r from-blue-600 to-blue-700'
                    }`}
                  >
                    {generatingBarcode ? <LoadingSpinner size="sm" /> : <CheckCircle className="w-4 h-4" />}
                    {generatingBarcode ? 'Generating...' : 'Approve Remnant & Generate Barcode'}
                  </button>
                </form>
              ) : (
                // ⭐ SUCCESS VIEW: Only show PDF link and remaining buttons
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-green-500/20 border border-green-500/30' : 'bg-green-50 border border-green-300'}`}>
                    <p className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-green-200' : 'text-green-700'}`}>
                      Barcode Generated Successfully!
                    </p>
                    <button
                      onClick={() => window.open(currentRemnantPdfUrl, '_blank')}
                      className={`w-full text-white py-2 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 ${
                        theme === 'dark'
                          ? 'bg-gradient-to-r from-green-600 to-green-700'
                          : 'bg-gradient-to-r from-green-600 to-green-700'
                      }`}
                    >
                      <Printer className="w-4 h-4" /> Download/Print PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 mt-6">
            {/* ⭐ Only show "Generate Cut Plan" if there are remaining pieces */}
            {remainingPieces > 0 && (
              <button
                onClick={handleGenerateCutPlanForRemaining}
                disabled={loading}
                className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-green-600 to-green-700'
                    : 'bg-gradient-to-r from-green-600 to-green-700'
                }`}
              >
                {loading ? <LoadingSpinner size="sm" /> : <Scissors className="w-4 h-4" />}
                {loading ? 'Generating...' : `Generate Cut Plan for Remaining ${remainingPieces} Pieces`}
              </button>
            )}

            {/* ⭐ Only show "Revisualize" if PDF hasn't been generated for current remnant */}
            {!hasPdfForCurrentRemnant && (
              <button
                onClick={handleRevisualizeRemnant}
                disabled={loading}
                className={`w-full border py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                    : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                }`}
              >
                <Eye className="w-4 h-4" />
                Revisualize Remnant
              </button>
            )}

            <button
              onClick={() => {
                setShowRemnantSvgs(false)
                setRemnantSvgs([])
                setRemnantFormData({ rack: '', location: '' })
                setRemnantPdfUrl(null)
                setSelectedDimensionStrings([])
                setRemnantPdfUrls(new Map())
                setBarcodedPiecesCount(0)
              }}
              className={`w-full border py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                theme === 'dark'
                  ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                  : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
              }`}
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

if (showBarcodeSuccess && generatedPdfUrl) {
  return (
    <div className={`min-h-screen p-4 ${theme === 'dark' ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`}>
      <div className="max-w-md mx-auto pt-8">
        <button onClick={() => {
          setShowBarcodeSuccess(false)
          setGeneratedPdfUrl(null)
          setScannedItem(null)
          setManualBarcode('')
          setScanMode('camera')
        }}
          className={`flex items-center gap-2 mb-6 transition-colors ${theme === 'dark' ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-800'}`}>
          <ArrowLeft className="w-5 h-5" /> Back to Scanner
        </button>
        <div className={`backdrop-blur-md rounded-2xl p-6 border ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-white/40 border-white/50'}`}>
          <h2 className={`text-2xl font-bold mb-6 text-center ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
            Barcode Generated Successfully
          </h2>
          <div className="space-y-4">
            <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-green-500/20 border border-green-500/30' : 'bg-green-50 border border-green-300'}`}>
              <p className={`text-center font-medium ${theme === 'dark' ? 'text-green-200' : 'text-green-700'}`}>
                PDF generated and ready to download
              </p>
            </div>
            <button
              onClick={() => window.open(generatedPdfUrl, '_blank')}
              className={`w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 ${
                theme === 'dark'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700'
              }`}
            >
              <Printer className="w-4 h-4" /> Download/Print PDF
            </button>
            <button
              onClick={() => {
                setShowBarcodeSuccess(false)
                setGeneratedPdfUrl(null)
                setScannedItem(null)
                setManualBarcode('')
                setScanMode('camera')
              }}
              className={`w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity ${
                theme === 'dark'
                  ? 'bg-white/10 border border-white/20 text-white'
                  : 'bg-white/50 border border-white/60 text-gray-800'
              }`}
            >
              Back to Scanner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

if (showApproveCutForm) {
  return (
    <div className={`min-h-screen p-4 ${theme === 'dark' ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' : 'bg-gradient-to-br from-blue-50 to-indigo-100'}`}>
      <div className="max-w-md mx-auto pt-8">
        <button onClick={() => setShowApproveCutForm(false)}
          className={`flex items-center gap-2 mb-6 transition-colors ${theme === 'dark' ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-800'}`}>
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <div className={`backdrop-blur-md rounded-2xl p-6 border ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-white/40 border-white/50'}`}>
          <h2 className={`text-2xl font-bold mb-6 text-center ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Generate Barcode for Cut Plan</h2>
          <form onSubmit={handleGenerateBarcodeWithLocation} className="space-y-4">

            <div>
              <label className={`text-sm font-medium mb-2 block ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                Rack
              </label>
              <input
                type="text"
                value={locationFormData.rack}
                onChange={(e) => setLocationFormData({ ...locationFormData, rack: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500'
                }`}
                placeholder="e.g., F4, U1, Gr2"
                required
              />
            </div>

            <div>
              <label className={`text-sm font-medium mb-2 block ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                Location
              </label>
              <select
                value={locationFormData.location}
                onChange={(e) => setLocationFormData({ ...locationFormData, location: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-white/50 border-gray-300 text-gray-800'
                }`}
                required
              >
                <option value="">Select Location</option>
                <option value="Godown">Godown</option>
                <option value="Warehouse">Warehouse</option>
                <option value="Office">Office</option>
              </select>
            </div>

            <button
              type="submit"
              className={`w-full text-white py-3 rounded-xl font-medium ${
                theme === 'dark'
                  ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]'
                  : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
              }`}
            >
              Generate Barcode
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

  
  // Cut Plan View - separate from form
  if (showCutPlanView && (svgData || cutPlanImage)) {
    return (
      <div className={`min-h-screen p-4 ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' 
          : 'bg-gradient-to-br from-blue-50 to-indigo-100'
      }`}>
        <div className="max-w-md mx-auto pt-8">
          <button
            onClick={() => setShowCutPlanView(false)}
            className={`flex items-center gap-2 mb-6 transition-colors ${
              theme === 'dark' 
                ? 'text-white/80 hover:text-white' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Cut Form
          </button>
          
          <div className={`backdrop-blur-md rounded-2xl p-6 border ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <h2 className={`text-2xl font-bold mb-6 text-center ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              Cut Plan Visualization
            </h2>
            
            {/* SVG Display Container with boundaries */}
            {svgData && (
              <div className="mb-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setSvgZoom(Math.max(50, svgZoom - 25))}
                  className={`px-3 py-1 rounded text-sm border transition-colors ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                      : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                  }`}
                >
                  Zoom Out
                </button>
                
                <span className={`px-3 py-1 text-sm ${
                  theme === 'dark' ? 'text-white' : 'text-gray-800'
                }`}>
                  {svgZoom}%
                </span>
                
                <button
                  onClick={() => setSvgZoom(Math.min(200, svgZoom + 25))}
                  className={`px-3 py-1 rounded text-sm border transition-colors ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                      : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                  }`}
                >
                  Zoom In
                </button>
                
                <button
                  onClick={() => setSvgZoom(100)}
                  className={`px-3 py-1 rounded text-sm border transition-colors ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                      : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                  }`}
                >
                  Reset
                </button>
                
                <button
                  onClick={downloadSvg}
                  className="px-4 py-1 rounded text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:opacity-90 flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  Download SVG
                </button>
              </div>
            )}
            
            <div className={`mb-6 p-4 rounded-xl overflow-auto ${
              theme === 'dark' ? 'bg-white/10' : 'bg-white/50'
            }`} style={{
              backdropFilter: 'blur(12px)',
              boxShadow: theme === 'dark' 
                ? '0 8px 16px -4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                : '0 8px 16px -4px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
              maxHeight: '400px'
            }}>
              {svgData ? (
                <div 
                  className="rounded-lg bg-white p-2 transition-transform duration-200"
                  style={{ 
                    transform: `scale(${svgZoom / 100})`,
                    transformOrigin: 'top left',
                    minWidth: 'fit-content'
                  }}
                  dangerouslySetInnerHTML={{ __html: svgData }}
                />
              ) : cutPlanImage ? (
                <img 
                  src={cutPlanImage}
                  alt="Cut Plan Visualization"
                  className="rounded-lg bg-white p-2 transition-transform duration-200"
                  style={{ 
                    transform: `scale(${svgZoom / 100})`,
                    transformOrigin: 'top left'
                  }}
                />
              ) : null}
            </div>
            
            {/* ALWAYS Display message below SVG when available */}
            {cutPlanResults && Array.isArray(cutPlanResults) && cutPlanResults[0]?.message && (
              <div className={`mb-4 p-4 rounded-xl ${
                theme === 'dark'
                  ? 'bg-blue-500/20 border border-blue-500/30'
                  : 'bg-blue-50 border border-blue-300'
              }`}>
                <p className={`text-center font-medium ${
                  theme === 'dark' ? 'text-blue-200' : 'text-blue-700'
                }`}>
                  {cutPlanResults[0].message}
                </p>
              </div>
            )}

            {/* Remainder selection - checkboxes and custom inputs */}
            {preservedCutMatchData && preservedCutMatchData.remainders && preservedCutMatchData.remainders.length > 0 && (
              <div className={`mb-4 p-4 rounded-xl border ${
                theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white/40 border-white/50'
              }`}>
                <label className={`block text-sm font-medium mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  Select Remainders for Barcode (Optional)
                </label>
                <div className="space-y-2 mb-3">
                  {preservedCutMatchData.remainders.map((remainder: any, index: number) => {
                    const displayDim = remainder.dimensions || remainder.label || ''
                    return (
                      <label
                        key={index}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selectedFullSheetRemainders.includes(displayDim)
                            ? theme === 'dark'
                              ? 'bg-blue-500/20 border-blue-500/50'
                              : 'bg-blue-100 border-blue-400'
                            : theme === 'dark'
                            ? 'bg-white/5 border-white/10 hover:bg-white/10'
                            : 'bg-white/30 border-white/40 hover:bg-white/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFullSheetRemainders.includes(displayDim)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedFullSheetRemainders([...selectedFullSheetRemainders, displayDim])
                            } else {
                              setSelectedFullSheetRemainders(selectedFullSheetRemainders.filter(s => s !== displayDim))
                            }
                          }}
                          className="w-4 h-4 rounded flex-shrink-0"
                        />
                        <span className={`font-medium text-sm break-all ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                          {displayDim}
                        </span>
                      </label>
                    )
                  })}
                </div>

                {/* Custom Remainder Inputs */}
                <label className={`block text-xs font-medium mb-2 ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}>
                  Add Custom Remainders
                </label>
                <div className="space-y-2">
                  {customFullSheetRemainders.map((remainder, index) => (
                    <CustomRemainderInput
                      key={index}
                      value={remainder}
                      onChange={(value) => handleCustomFullSheetRemainderChange(index, value)}
                      onAddRow={handleAddCustomFullSheetRemainder}
                      onRemove={index > 0 ? () => handleRemoveCustomFullSheetRemainder(index) : undefined}
                      showRemove={index > 0}
                      theme={theme}
                      placeholder="e.g., 1220x2440"
                    />
                  ))}
                </div>
                <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-white/40' : 'text-gray-500'}`}>
                  Leave all unchecked to send all remainders, or select specific ones
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleApproveCutPlan}
                className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-green-600 to-green-700'
                    : 'bg-gradient-to-r from-green-600 to-green-700'
                }`}
              >
                <Package2 className="w-4 h-4" />
                Approve Cut Plan & Generate Barcode
              </button>
              
              <button
                onClick={handleRevisualizeCutPlan}
                className={`w-full border py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                    : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                }`}
              >
                <Eye className="w-4 h-4" />
                Revisualize Cut Plan
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (showCutForm && scannedItem) {
    return (
      <div className={`min-h-screen p-4 ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' 
          : 'bg-gradient-to-br from-blue-50 to-indigo-100'
      }`}>
        <div className="max-w-md mx-auto pt-8">
          <button
            onClick={() => setShowCutForm(false)}
            className={`flex items-center gap-2 mb-6 transition-colors ${
              theme === 'dark' 
                ? 'text-white/80 hover:text-white' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Item
          </button>
          
          <div className={`backdrop-blur-md rounded-2xl p-6 border ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <h2 className={`text-2xl font-bold mb-6 text-center ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              Cut Pieces
            </h2>
            
            <div className={`mb-6 p-4 rounded-xl ${
              theme === 'dark' ? 'bg-white/10' : 'bg-white/50'
            }`} style={{
              backdropFilter: 'blur(12px)',
              boxShadow: theme === 'dark' 
                ? '0 8px 16px -4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                : '0 8px 16px -4px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            }}>
              <h3 className={`font-medium mb-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>Original Item:</h3>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-600'
              }`}>
                {scannedItem.ProductName} - {(() => {
                  // Check if this is a remnant with raw dimension string
                  if (scannedItem.rawDimensionString) {
                    return `Dimensions: ${scannedItem.rawDimensionString}`;
                  }

                  const form = scannedItem.Form?.toLowerCase() || '';
                  if (['rods', 'tubes', 'bushes'].includes(form)) {
                    // For rods/tubes/bushes: show diameter x length
                    return `${scannedItem.Diameter_mm || 0}mm dia x ${scannedItem.Length_mm || 0}mm length`;
                  } else {
                    // For sheets: show thickness x length x width
                    return `${scannedItem.Thickness_mm || 0}mm x ${scannedItem.Length_mm || 0}mm x ${scannedItem.Width_mm || 0}mm`;
                  }
                })()}
              </p>
            </div>
            
            <form onSubmit={handleCutPieces} className="space-y-4">
              <div>
                <label className={`text-sm font-medium mb-2 block ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  Piece Length (mm)
                </label>
                <input
                  type="text"
                  value={cutData.pieceLength}
                  onChange={(e) => setCutData({ ...cutData, pieceLength: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                      : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                  }`}
                  placeholder="e.g., 500"
                  required
                />
              </div>
              
              <div>
                <label className={`text-sm font-medium mb-2 block ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  {(() => {
                    const form = scannedItem.Form?.toLowerCase() || '';
                    if (['rods', 'tubes', 'bushes'].includes(form)) {
                      return null; // Don't show width input for rods/tubes/bushes
                    } else {
                      return 'Piece Width (mm)';
                    }
                  })()}
                </label>
                {(() => {
                  const form = scannedItem.Form?.toLowerCase() || '';
                  if (['rods', 'tubes', 'bushes'].includes(form)) {
                    return null; // Don't show width input for rods/tubes/bushes
                  } else {
                    return (
                      <input
                        type="text"
                        value={cutData.pieceWidth}
                        onChange={(e) => setCutData({ ...cutData, pieceWidth: e.target.value })}
                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                          theme === 'dark'
                            ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                            : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                        }`}
                        placeholder="e.g., 300"
                        required
                      />
                    );
                  }
                })()}
              </div>
              
              <div>
                <label className={`text-sm font-medium mb-2 block ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  Quantity
                </label>
                <input
                  type="text"
                  value={cutData.quantity}
                  onChange={(e) => setCutData({ ...cutData, quantity: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                      : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                  }`}
                  placeholder="e.g., 4"
                  required
                />
              </div>
              
              <div>
                <label className={`text-sm font-medium mb-2 block ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  Blade Thickness (mm)
                </label>
                <input
                  type="text"
                  value={cutData.bladeThickness}
                  onChange={(e) => setCutData({ ...cutData, bladeThickness: e.target.value })}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                      : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                  }`}
                  placeholder="e.g., 3"
                />
                <p className={`text-xs mt-1 ${
                  theme === 'dark' ? 'text-white/50' : 'text-gray-500'
                }`}>
                  Thickness of the cutting blade (kerf width)
                </p>
              </div>
              
              <div className="flex items-center gap-2 p-4 bg-white/5 rounded-xl">
                <input
                  type="checkbox"
                  id="confirm-dims"
                  className="w-4 h-4"
                  required
                />
                <label htmlFor="confirm-dims" className={`text-sm ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  I confirm the original dimensions shown above are correct
                </label>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]'
                    : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
                }`}
              >
                {loading ? <LoadingSpinner size="sm" /> : <Eye className="w-4 h-4" />}
                {loading ? 'Creating Plan...' : 'Visualize Cut Plan'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // Change Rack Form
  if (showChangeRackForm && scannedItem) {
    return (
      <div className={`min-h-screen p-4 ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' 
          : 'bg-gradient-to-br from-blue-50 to-indigo-100'
      }`}>
        <div className="max-w-md mx-auto pt-8">
          <button
            onClick={() => setShowChangeRackForm(false)}
            className={`flex items-center gap-2 mb-6 transition-colors ${
              theme === 'dark' 
                ? 'text-white/80 hover:text-white' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Item
          </button>
          
          <div className={`backdrop-blur-md rounded-2xl p-6 border ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <h2 className={`text-2xl font-bold mb-6 text-center ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              Change Rack/Date
            </h2>
            
            <div className={`mb-6 p-4 rounded-xl ${
              theme === 'dark' ? 'bg-white/10' : 'bg-white/50'
            }`} style={{
              backdropFilter: 'blur(12px)',
              boxShadow: theme === 'dark' 
                ? '0 8px 16px -4px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)' 
                : '0 8px 16px -4px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
            }}>
              <h3 className={`font-medium mb-2 ${
                theme === 'dark' ? 'text-white' : 'text-gray-800'
              }`}>Current Item:</h3>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-600'
              }`}>
                {scannedItem.ProductName} {scannedItem.ProductColor}
              </p>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-600'
              }`}>
                Current Rack: <span className="font-medium">{scannedItem.Rack}</span>
              </p>
            </div>
            
            <form onSubmit={handleChangeRackSubmit} className="space-y-4">
              <div>
                <label className={`text-sm font-medium mb-2 block ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  New Rack Position (Optional)
                </label>
                <input
                  type="text"
                  value={newRackInput}
                  onChange={(e) => setNewRackInput(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                      : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                  }`}
                  placeholder="e.g., B3, A1, C2"
                />
              </div>
              
              <div>
                <label className={`text-sm font-medium mb-2 block ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  Purchase Date (Optional)
                </label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                      : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                  }`}
                />
              </div>
              
              <button
                type="submit"
                disabled={loading || (!newRackInput.trim() && !purchaseDate.trim())}
                className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 select-none ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700'
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                {loading ? <LoadingSpinner size="sm" /> : <MapPin className="w-4 h-4" />}
                {loading ? 'Updating...' : 'Update'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (scannedItem) {
    return (
      <div className={`min-h-screen p-4 ${
        theme === 'dark' 
          ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]' 
          : 'bg-gradient-to-br from-blue-50 to-indigo-100'
      }`}>
        <div className="max-w-md mx-auto pt-8">
          <button
            onClick={goBackToCamera}
            className={`flex items-center gap-2 mb-6 transition-colors ${
              theme === 'dark' 
                ? 'text-white/80 hover:text-white' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
            Continue Scanning
          </button>
          
          <div className={`backdrop-blur-md rounded-2xl p-6 border ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <h2 className={`text-2xl font-bold mb-6 text-center ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              Item Details
            </h2>
            
            {scannedItem.isSold && (
              <div className={`mb-6 p-4 rounded-xl border-2 text-center ${
                theme === 'dark'
                  ? 'bg-red-500/20 border-red-500/50 text-red-200'
                  : 'bg-red-50 border-red-300 text-red-700'
              }`}>
                <h3 className="font-bold text-lg mb-1">ITEM ALREADY SOLD</h3>
                <p className="text-sm">This item has been marked as sold and is no longer available for transactions.</p>
              </div>
            )}
            
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                  }`}>Product:</span>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>{scannedItem.ProductName}</p>
                </div>
                <div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                  }`}>Color:</span>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>{scannedItem.ProductColor}</p>
                </div>
                <div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                  }`}>Dimensions:</span>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>
                    {(() => {
                      // Check if this is a remnant with raw dimension string
                      if (scannedItem.rawDimensionString) {
                        return scannedItem.rawDimensionString;
                      }

                      const form = scannedItem.Form?.toLowerCase() || '';
                      if (form === 'sheets') {
                        // For sheets: show Length x Width
                        if (scannedItem.Length_mm && scannedItem.Width_mm && scannedItem.Length_mm > 0 && scannedItem.Width_mm > 0) {
                          return `${scannedItem.Length_mm}x${scannedItem.Width_mm}mm`;
                        }
                      } else if (['rods', 'tubes', 'bushes'].includes(form)) {
                        // For rods/tubes/bushes: show length only
                        if (scannedItem.Length_mm && scannedItem.Length_mm > 0) {
                          return `${scannedItem.Length_mm}mm`;
                        }
                      } else {
                        // For other forms: show whatever is available
                        if (scannedItem.Length_mm && scannedItem.Width_mm && scannedItem.Length_mm > 0 && scannedItem.Width_mm > 0) {
                          return `${scannedItem.Length_mm}x${scannedItem.Width_mm}mm`;
                        } else if (scannedItem.Length_mm && scannedItem.Length_mm > 0) {
                          return `${scannedItem.Length_mm}mm`;
                        }
                      }
                      return 'N/A';
                    })()}
                  </p>
                </div>
                <div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                  }`}>
                    {(() => {
                      const form = scannedItem.Form?.toLowerCase() || '';
                      if (['rods', 'tubes', 'bushes'].includes(form)) {
                        return 'Diameter:';
                      } else {
                        return 'Thickness:';
                      }
                    })()}
                  </span>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>
                    {(() => {
                      const form = scannedItem.Form?.toLowerCase() || '';
                      if (['rods', 'tubes', 'bushes'].includes(form)) {
                        // For rods/tubes/bushes: show diameter instead of thickness
                        return scannedItem.Diameter_mm && scannedItem.Diameter_mm > 0 ? `Ã˜${scannedItem.Diameter_mm}mm` : 'N/A';
                      } else {
                        // For sheets and other forms: show thickness
                        return scannedItem.Thickness_mm && scannedItem.Thickness_mm > 0 ? `${scannedItem.Thickness_mm}mm` : 'N/A';
                      }
                    })()}
                  </p>
                </div>
                <div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                  }`}>Form:</span>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>{scannedItem.Form}</p>
                </div>
                <div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                  }`}>Rack:</span>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>{scannedItem.Rack}</p>
                </div>
                <div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                  }`}>Status:</span>
                  <p className={`font-medium ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>{scannedItem.Status}</p>
                </div>
                <div>
                  <span className={`text-sm ${
                    theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                  }`}>Barcode ID:</span>
                  <p className={`font-mono text-sm ${
                    theme === 'dark' ? 'text-white' : 'text-gray-800'
                  }`}>{scannedItem.BarcodeID}</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <button
                onClick={handleMarkAsSold}
                disabled={loading || scannedItem.isSold}
                className={`w-full py-3 rounded-xl font-medium transition-opacity flex items-center justify-center gap-2 select-none ${
                  scannedItem.isSold
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                    : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:opacity-90 disabled:opacity-50'
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                {loading ? <LoadingSpinner size="sm" /> : <Package2 className="w-4 h-4" />}
                {scannedItem.isSold ? 'Already Sold' : 'Mark as Sold'}
              </button>
              
              <button
                onClick={() => setShowCutForm(true)}
                disabled={scannedItem.isSold}
                className={`w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 select-none ${
                  scannedItem.isSold
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                    : theme === 'dark'
                      ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]'
                      : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                <Scissors className="w-4 h-4" />
                {scannedItem.isSold ? 'Cannot Cut (Sold)' : 'Cut Pieces'}
              </button>
              
              <button
                onClick={() => setShowChangeRackForm(true)}
                disabled={scannedItem.isSold}
                className={`w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 select-none ${
                  scannedItem.isSold
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                    : theme === 'dark'
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700'
                      : 'bg-gradient-to-r from-blue-600 to-blue-700'
                }`}
                style={{ touchAction: 'manipulation' }}
              >
                <MapPin className="w-4 h-4" />
                {scannedItem.isSold ? 'Cannot Move (Sold)' : 'Change Rack/Date'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
          <ArrowLeft className="w-5 h-5" />
          Back to Menu
        </button>
        
        <div className={`backdrop-blur-md rounded-2xl p-6 border ${
          theme === 'dark'
            ? 'bg-white/10 border-white/20'
            : 'bg-white/40 border-white/50'
        }`}>
          <h2 className={`text-2xl font-bold mb-6 text-center ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            Scan Barcode
          </h2>
          
          {scanMode === null && (
            <div className="space-y-4">
              <button
                onClick={() => setScanMode('camera')}
                className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]'
                    : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
                }`}
              >
                <Camera className="w-5 h-5" />
                Use Camera
              </button>
              
              <button
                onClick={() => setScanMode('manual')}
                className={`w-full border py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                    : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                }`}
              >
                <Hash className="w-5 h-5" />
                Enter Manually
              </button>
            </div>
          )}

          {scanMode === 'choice' && (
            <div className="space-y-4">
              <button
                onClick={() => setScanMode('camera')}
                className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]'
                    : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
                }`}
              >
                <Camera className="w-5 h-5" />
                Use Camera
              </button>
              
              <button
                onClick={() => setScanMode('manual')}
                className={`w-full border py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                    : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                }`}
              >
                <Hash className="w-5 h-5" />
                Enter Manually
              </button>
              
              <button
                onClick={() => setScanMode(null)}
                className={`w-full border py-3 rounded-xl font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    : 'bg-white/30 border-white/40 text-gray-600 hover:bg-white/40'
                }`}
              >
                Back to Menu
              </button>
            </div>
          )}
          
          {/* Inline scan error message - shows for both camera and manual */}
          {scanError && (
            <div className={`p-4 rounded-xl border animate-pulse ${
              theme === 'dark'
                ? 'bg-red-500/20 border-red-500/40 text-red-200'
                : 'bg-red-50 border-red-300 text-red-700'
            }`}>
              <p className="text-sm font-medium text-center">{scanError}</p>
              <p className={`text-xs text-center mt-1 ${
                theme === 'dark' ? 'text-red-300/70' : 'text-red-500'
              }`}>Returning to scanner...</p>
            </div>
          )}

          {scanMode === 'manual' && !scanError && (
            <form onSubmit={handleManualScan} className="space-y-4">
              <div>
                <label className={`text-sm font-medium mb-2 block ${
                  theme === 'dark' ? 'text-white/80' : 'text-gray-700'
                }`}>
                  Barcode ID
                </label>
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 font-mono ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                      : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                  }`}
                  placeholder="Enter barcode ID..."
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScanMode('choice')}
                  className={`flex-1 border py-3 rounded-xl font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                      : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                  }`}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 ${
                    theme === 'dark'
                      ? 'bg-gradient-to-r from-[#8B9198] to-[#E26B64]'
                      : 'bg-gradient-to-r from-[#052635] to-[#010b2f]'
                  }`}
                >
                  {loading ? <LoadingSpinner size="sm" /> : null}
                  {loading ? 'Searching...' : 'Find Item'}
                </button>
              </div>
            </form>
          )}

          {scanMode === 'camera' && !scanError && (
            <div>
              {cameraError ? (
                <div className="text-center">
                  <div className={`mb-4 p-4 rounded-xl ${
                    theme === 'dark'
                      ? 'bg-red-500/20 border border-red-500/30 text-red-200'
                      : 'bg-red-50 border border-red-200 text-red-600'
                  }`}>
                    <p className="text-sm">{cameraError}</p>
                  </div>
                  <button
                    onClick={() => setScanMode('choice')}
                    className={`border py-3 px-6 rounded-xl font-medium transition-colors ${
                      theme === 'dark'
                        ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                        : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                    }`}
                  >
                    Back
                  </button>
                </div>
              ) : (
                <>
                  <div
                    id="qr-reader"
                    ref={scannerRef}
                    className="w-full mb-4 rounded-xl overflow-hidden bg-black"
                    style={{ minHeight: '300px' }}
                  />
                  <div className="text-center">
                    <p className={`mb-4 ${
                      theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                    }`}>
                      Point your camera at a barcode
                    </p>
                    <button
                      onClick={() => setScanMode('choice')}
                      className={`border py-3 px-6 rounded-xl font-medium transition-colors ${
                        theme === 'dark'
                          ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                          : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                      }`}
                    >
                      Stop Camera
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
