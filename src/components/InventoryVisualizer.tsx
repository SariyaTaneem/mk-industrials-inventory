import React, { useState, useRef, useEffect } from 'react'
import { Play, RefreshCw, Plus, Trash2, Download, SquareCheck as CheckSquare, MapPin, Camera, Hash, ChevronDown, ChevronUp, Scissors } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { LoadingSpinner } from './LoadingSpinner'
import { Theme } from '../hooks/useTheme'

interface Panel {
  id: string
  length: string
  width: string
  qty: string
}

interface StockSheet {
  id: string
  length: string
  width: string
  qty: string
}

interface VisualizerProps {
  theme: Theme
}

interface UsedSheet {
  sheetNumber: number
  stockSheet: string
  efficiency: number
  wasteArea: number
  svg: string
  placedParts?: number
}

interface WebhookResponse {
  success: boolean
  totalPanelsRequested?: number
  totalPanelsPlaced?: number
  totalPanelsUnplaced?: number
  sheetsUsed: number
  sheetsAvailable?: number
  sheetsUnused?: number
  efficiency: number
  message: string
  usedSheets: UsedSheet[]
  unplacedParts?: any[]
  unplacedItems?: Array<{ size: string; requested: number; placed: number; remaining: number }>
  quantityTracking?: Record<string, { requested: number; placed: number; remaining: number }>
  svg1?: string
  svg2?: string
  svg3?: string
  svg4?: string
  svg5?: string
  remnants?: any[]
  remnantCount?: number
  requestedTotal?: number
  placementSummary?: any
  dimensionString1?: string
  dimensionString2?: string
  dimensionString3?: string
  dimensionString4?: string
  dimensionString5?: string
}

interface RemnantItem {
  barcodeId: string
  inventoryId: string
  location: string
  svg: string
  rack: string
  productName: string
  thickness: number
  colour: string
  fixedRemainders?: Array<{ label: string; dimensions: string; area: number }>
  remnants?: Array<{ dimensionString: string; edgeCount: number }>
  dimensionString1?: string
  dimensionString2?: string
  dimensionString3?: string
  nestingResult?: {
    totalPanels: number
    placedPanels: number
    placedPieces?: number
    unplacedPanels?: number
    kerf: number
    strategy: string
    placedBySize?: Record<string, number>
  }
  message?: string
  possibleRectangles?: string
}


const parseDimensionsString = (value?: string | null) => {
  if (!value) return { length: '', width: '' }
  const clean = String(value).replace(/mm/gi, '').trim()
  const parts = clean.split('x').map(p => p.trim())
  return {
    length: parts[0] || '',
    width: parts[1] || ''
  }
}

const getMaterialThickness = (material: any) => {
  return (
    material?.Thickness_mm ||
    material?.Thickness ||
    material?.['Thickness_mm___Diameter_mm'] ||
    material?.responsePayload?.Thickness ||
    ''
  )
}

const getMaterialSize = (material: any) => {
  const directLength = material?.Length_mm || material?.Length || ''
  const directWidth = material?.Width_mm || material?.Width || ''

  if (directLength && directWidth) {
    return { length: directLength, width: directWidth }
  }

  const dims =
    material?.Dimensions_mm ||
    material?.Dimensions ||
    material?.responsePayload?.Dimensions ||
    ''

  return parseDimensionsString(dims)
}

const collectDimensionStrings = (obj: any) => {
  if (!obj) return []

  const keys = [
    'dimensionString1',
    'dimensionString2',
    'dimensionString3',
    'dimensionString4',
    'dimensionString5'
  ]

  const out: string[] = []

  keys.forEach(k => {
    if (obj[k] && !out.includes(obj[k])) out.push(obj[k])
  })

  if (obj.dimensionString && !out.includes(obj.dimensionString)) {
    out.push(obj.dimensionString)
  }

  if (Array.isArray(obj.remainders)) {
    obj.remainders.forEach((r: any) => {
      const label = r?.label || r?.dimensions || r?.dimensionString
      if (label && !out.includes(label)) out.push(label)
    })
  }

  return out
}

export function InventoryVisualizer({ theme }: VisualizerProps) {
  const [bladeThickness, setBladeThickness] = useState('3')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [rotationAngle, setRotationAngle] = useState(0)
  const [panels, setPanels] = useState<Panel[]>([
    { id: '1', length: '', width: '', qty: '' },
    { id: '2', length: '', width: '', qty: '' },
    { id: '3', length: '', width: '', qty: '' },
    { id: '4', length: '', width: '', qty: '' },
    { id: '5', length: '', width: '', qty: '' },
  ])
  const [stockSheets, setStockSheets] = useState<StockSheet[]>([
    { id: '1', length: '', width: '', qty: '' },
    { id: '2', length: '', width: '', qty: '' },
    { id: '3', length: '', width: '', qty: '' },
    { id: '4', length: '', width: '', qty: '' },
    { id: '5', length: '', width: '', qty: '' },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [cutplans, setCutplans] = useState<UsedSheet[]>([])
  const [webhookResponse, setWebhookResponse] = useState<WebhookResponse | null>(null)
  const [barcodeScanData, setBarcodeScanData] = useState<Record<string, any>>({})
  const [scannedSheetId, setScannedSheetId] = useState<string | null>(null)
  const [barcodeInput, setBarcodeInput] = useState<string>('')
  const [approvingSheet, setApprovingSheet] = useState<string | null>(null)
  const [productName, setProductName] = useState('')
  const [productColor, setProductColor] = useState('')
  const [productThickness, setProductThickness] = useState('')
  const [scanMode, setScanMode] = useState<'choice' | 'camera' | 'manual' | null>(null)
  const [scanner, setScanner] = useState<Html5Qrcode | null>(null)
  const [cameraError, setCameraError] = useState('')
  const scannerRef = useRef<HTMLDivElement>(null)

  const [showRemnantSvgs, setShowRemnantSvgs] = useState(false)
  const [remnantSvgs, setRemnantSvgs] = useState<RemnantItem[]>([])
  const [selectedRemnantIndex, setSelectedRemnantIndex] = useState(0)
  const [remnantZoom, setRemnantZoom] = useState(75)
  const [showRemnantBarcodeForm, setShowRemnantBarcodeForm] = useState(false)
  const [remnantFormData, setRemnantFormData] = useState({ rack: '', location: '' })
  const [generatingRemnantBarcode, setGeneratingRemnantBarcode] = useState(false)
  const [remnantPdfUrls, setRemnantPdfUrls] = useState<Map<number, string>>(new Map())
  const [selectedRemnantDimStrings, setSelectedRemnantDimStrings] = useState<Map<number, string[]>>(new Map())
  const [customRemnantInputs, setCustomRemnantInputs] = useState<Map<number, string[]>>(new Map([[0, ['']]]))
  const [remnantSectionCollapsed, setRemnantSectionCollapsed] = useState(false)

  const [lockedRemnantIndexes, setLockedRemnantIndexes] = useState<Set<number>>(new Set())
  const [lockedRemnantSnapshots, setLockedRemnantSnapshots] = useState<Map<number, RemnantItem>>(new Map())
  const [lockedFullSheetSvg, setLockedFullSheetSvg] = useState<string | null>(null)

  const [remainingCutPlanSvg, setRemainingCutPlanSvg] = useState<string | null>(null)
  const [remainingCutPlanData, setRemainingCutPlanData] = useState<any>(null)
  const [remainingCutPlanLoading, setRemainingCutPlanLoading] = useState(false)
  const [remainingCutPlanZoom, setRemainingCutPlanZoom] = useState(75)
  const [showRemainingBarcodeForm, setShowRemainingBarcodeForm] = useState(false)
  const [remainingFormData, setRemainingFormData] = useState({ rack: '', location: '' })
  const [generatingRemainingBarcode, setGeneratingRemainingBarcode] = useState(false)
  const [remainingPdfUrl, setRemainingPdfUrl] = useState<string | null>(null)
  const [selectedRemainingRemainders, setSelectedRemainingRemainders] = useState<string[]>([])
  const [customRemainingInputs, setCustomRemainingInputs] = useState<string[]>([''])
  const [remainingDimStrings, setRemainingDimStrings] = useState<string[]>([])
  const [remainingScanMode, setRemainingScanMode] = useState<'choice' | 'camera' | 'manual' | null>(null)
  const [remainingBarcodeInput, setRemainingBarcodeInput] = useState('')
  const [remainingScanner, setRemainingScanner] = useState<Html5Qrcode | null>(null)
  const [remainingScanData, setRemainingScanData] = useState<any>(null)
  const [remainingCameraError, setRemainingCameraError] = useState('')

  const [selectedFullSheetRemainders, setSelectedFullSheetRemainders] = useState<string[]>([])
  const [customFullSheetInputs, setCustomFullSheetInputs] = useState<string[]>([''])
  const [showFullSheetBarcodeForm, setShowFullSheetBarcodeForm] = useState(false)
  const [fullSheetFormData, setFullSheetFormData] = useState({ rack: '', location: '' })
  const [generatingFullSheetBarcode, setGeneratingFullSheetBarcode] = useState(false)
  const [fullSheetPdfUrl, setFullSheetPdfUrl] = useState<string | null>(null)
  const [preservedFullSheetData, setPreservedFullSheetData] = useState<any>(null)

  const [apiQuantityTracking, setApiQuantityTracking] = useState<Record<string, { requested: number; placed: number; remaining: number }> | null>(null)
  const [apiUnplacedItems, setApiUnplacedItems] = useState<Array<{ size: string; requested: number; placed: number; remaining: number }> | null>(null)
  const [fullSheetDimStrings, setFullSheetDimStrings] = useState<string[]>([])

  useEffect(() => {
    return () => {
      if (scanner) scanner.stop().catch(console.error)
    }
  }, [scanner])

  useEffect(() => {
    return () => {
      if (remainingScanner) remainingScanner.stop().catch(console.error)
    }
  }, [remainingScanner])

  const getCurrentSelectedDimStrings = () => selectedRemnantDimStrings.get(selectedRemnantIndex) || []
  const getCurrentCustomInputs = () => customRemnantInputs.get(selectedRemnantIndex) || ['']

  const toggleRemnantDimString = (dimStr: string) => {
    const current = getCurrentSelectedDimStrings()
    const updated = current.includes(dimStr)
      ? current.filter(s => s !== dimStr)
      : [...current, dimStr]
    setSelectedRemnantDimStrings(new Map(selectedRemnantDimStrings).set(selectedRemnantIndex, updated))
  }

  const handleCustomRemnantInputChange = (idx: number, value: string) => {
    const current = getCurrentCustomInputs()
    const updated = [...current]
    updated[idx] = value
    setCustomRemnantInputs(new Map(customRemnantInputs).set(selectedRemnantIndex, updated))
  }

  const handleAddCustomRemnantInput = () => {
    const current = getCurrentCustomInputs()
    setCustomRemnantInputs(new Map(customRemnantInputs).set(selectedRemnantIndex, [...current, '']))
  }

  const handleRemoveCustomRemnantInput = (idx: number) => {
    const current = getCurrentCustomInputs()
    const updated = current.filter((_, i) => i !== idx)
    setCustomRemnantInputs(new Map(customRemnantInputs).set(selectedRemnantIndex, updated.length > 0 ? updated : ['']))
  }

  const expandDimensionString = (dimString: string): string => {
    const normalized = dimString.replace(/Ã—/g, 'x').trim()
    const parts = normalized.split('x').filter(p => p.trim())
    if (parts.length === 2) {
      return `${parts[0]}x${parts[1]}x${parts[0]}x${parts[1]}`
    }
    return normalized
  }

  const simplifyDimensionString = (dimString: string): string => {
    const parts = dimString.split('x')
    if (parts.length === 2) return dimString
    if (parts.length === 4 && parts[0] === parts[2] && parts[1] === parts[3]) {
      return `${parts[0]}x${parts[1]}`
    }
    if (parts.length === 6 && parts[0] === parts[2] && parts[0] === parts[4] && parts[1] === parts[3] && parts[1] === parts[5]) {
      return `${parts[0]}x${parts[1]}`
    }
    return dimString
  }

  const getValidPanels = () => panels
    .filter(p => p.length && p.width && p.qty)
    .map(p => ({
      length: parseFloat(p.length),
      width: parseFloat(p.width),
      qty: parseInt(p.qty)
    }))
    .filter(p => p.length > 0 && p.width > 0 && p.qty > 0)

  const computeRemnantQuantityTracking = () => {
    const validPanels = getValidPanels()

    const totalRequestedBySize: Record<string, number> = {}
    validPanels.forEach(p => {
      const key = `${p.length}x${p.width}`
      totalRequestedBySize[key] = (totalRequestedBySize[key] || 0) + p.qty
    })

    const totalPlacedBySize: Record<string, number> = {}
    let totalPlacedAcrossAll = 0

    remnantSvgs.forEach(r => {
      const placed = r.nestingResult?.placedPieces ?? r.nestingResult?.placedPanels ?? 0
      totalPlacedAcrossAll += placed

      if (r.nestingResult?.placedBySize) {
        Object.entries(r.nestingResult.placedBySize).forEach(([size, count]) => {
          totalPlacedBySize[size] = (totalPlacedBySize[size] || 0) + count
        })
      }
    })

    const totalRequested = Object.values(totalRequestedBySize).reduce((a, b) => a + b, 0)

    const sizeBreakdown = Object.entries(totalRequestedBySize).map(([size, requested]) => {
      const placed = totalPlacedBySize[size] || 0
      const unplaced = Math.max(0, requested - placed)
      return { size, requested, placed, unplaced }
    })

    const totalUnplaced = Math.max(0, totalRequested - totalPlacedAcrossAll)

    return {
      totalRequested,
      totalPlaced: totalPlacedAcrossAll,
      totalUnplaced,
      sizeBreakdown,
      totalPlacedBySize
    }
  }

  const computeRemainingPanels = () => {
    const validPanels = getValidPanels()
    const tracking = computeRemnantQuantityTracking()

    const placedBySize = { ...tracking.totalPlacedBySize }

    return validPanels.map(p => {
      const sizeKey = `${p.length}x${p.width}`
      const placed = placedBySize[sizeKey] || 0
      const remaining = Math.max(0, p.qty - placed)
      return { length: p.length, width: p.width, qty: remaining }
    }).filter(p => p.qty > 0)
  }

  const handleRemnantBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!remnantFormData.rack || !remnantFormData.location) {
      alert('Please fill in both rack and location')
      return
    }

    const currentRemnant = remnantSvgs[selectedRemnantIndex]
    if (!currentRemnant) return

    if (!currentRemnant.barcodeId) {
      alert('No source remnant barcode found for this remnant.')
      return
    }

    const selectedDims = getCurrentSelectedDimStrings()
    const customDims = getCurrentCustomInputs().filter(s => s.trim())

    const allDimStrings: string[] = []

    if (selectedDims.length > 0 || customDims.length > 0) {
      allDimStrings.push(...selectedDims.map(d => expandDimensionString(d)), ...customDims.map(d => expandDimensionString(d)))
    } else {
      const keys = ['dimensionString1', 'dimensionString2', 'dimensionString3', 'dimensionString4', 'dimensionString5']
      keys.forEach(k => {
        const val = (currentRemnant as any)[k]
        if (val) allDimStrings.push(val)
      })
    }

    if (allDimStrings.length === 0 && currentRemnant.remnants && currentRemnant.remnants.length > 0) {
      currentRemnant.remnants.forEach(r => {
        if (r.dimensionString) allDimStrings.push(r.dimensionString)
      })
    }

    setGeneratingRemnantBarcode(true)

    try {
      const payload: any = {
        sourceBarcodeId: currentRemnant.barcodeId,
        svg: currentRemnant.svg,
        rack: remnantFormData.rack,
        location: remnantFormData.location,
        isRemnantGeneration: true
      }

      allDimStrings.forEach((dimStr, index) => {
        payload[`dimensionString${index + 1}`] = dimStr
      })

      const response = await fetch('https://n8n.mkindustrials.com/webhook/generate-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) throw new Error('HTTP error')

      const responseData = await response.json()
      const data = Array.isArray(responseData) ? responseData[0] : responseData

      if (data.success === 'true' || data.success === true) {
        if (data.labelLink) {
          setRemnantPdfUrls(new Map(remnantPdfUrls).set(selectedRemnantIndex, data.labelLink))
        }
        setShowRemnantBarcodeForm(false)
        setRemnantFormData({ rack: '', location: '' })
      } else {
        alert('Barcode generation failed')
      }
    } catch (err) {
      alert(`Failed to generate barcode: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGeneratingRemnantBarcode(false)
    }
  }

  const addPanelRow = () => {
    setPanels(prev => [...prev, { id: Date.now().toString(), length: '', width: '', qty: '' }])
  }

  const addStockSheetRow = () => {
    setStockSheets(prev => [...prev, { id: Date.now().toString(), length: '', width: '', qty: '' }])
  }

  const handlePanelFocus = (index: number) => {
    if (index >= panels.length - 2) {
      const hasEmptyRow = panels.some(p => p.length === '' && p.width === '' && p.qty === '')
      if (!hasEmptyRow) addPanelRow()
    }
  }

  const handleStockSheetFocus = (index: number) => {
    if (index >= stockSheets.length - 2) {
      const hasEmptyRow = stockSheets.some(s => s.length === '' && s.width === '' && s.qty === '')
      if (!hasEmptyRow) addStockSheetRow()
    }
  }

  const updatePanel = (id: string, field: keyof Panel, value: string) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const updateStockSheet = (id: string, field: keyof StockSheet, value: string) => {
    setStockSheets(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  const removePanelRow = (id: string) => {
    if (panels.length > 4) setPanels(prev => prev.filter(p => p.id !== id))
  }

  const removeStockSheetRow = (id: string) => {
    if (stockSheets.length > 4) setStockSheets(prev => prev.filter(s => s.id !== id))
  }

  const prepareWebhookData = () => {
    const validPanels = getValidPanels()
    const validStockSheets = stockSheets
      .filter(s => s.length && s.width && s.qty)
      .map(s => ({ length: parseFloat(s.length), width: parseFloat(s.width), qty: parseInt(s.qty) }))
      .filter(s => s.length > 0 && s.width > 0 && s.qty > 0)

    return { bladeThickness: parseFloat(bladeThickness) || 3, panels: validPanels, stocksheets: validStockSheets, productName, productColor, productThickness }
  }

  const processVisualizationResponse = (result: any) => {
    const responses = Array.isArray(result) ? result : [result]
    const webhookData = responses[0]
    setWebhookResponse(webhookData)

    const allDimStrings: string[] = []

    responses.forEach((res: any) => {
      collectDimensionStrings(res).forEach((d: string) => {
        if (!allDimStrings.includes(d)) allDimStrings.push(d)
      })

      if (Array.isArray(res.usedSheets)) {
        res.usedSheets.forEach((sheet: any) => {
          collectDimensionStrings(sheet).forEach((d: string) => {
            if (!allDimStrings.includes(d)) allDimStrings.push(d)
          })
        })
      }
    })

    setFullSheetDimStrings(allDimStrings)

    if (webhookData?.remnants && webhookData.remnants.length > 0) {
      const incomingRemnants = webhookData.remnants as RemnantItem[]

      const mergedRemnants = incomingRemnants.map((item, idx) => {
        return lockedRemnantIndexes.has(idx) ? (lockedRemnantSnapshots.get(idx) || item) : item
      })

      setRemnantSvgs(mergedRemnants)
      setSelectedRemnantIndex(0)
      setShowRemnantSvgs(true)

      // DO NOT reset locked properties here
      setCutplans([])
      setRemainingCutPlanSvg(null)
      setRemainingCutPlanData(null)
      setRemnantSectionCollapsed(false)
    } else {
      setShowRemnantSvgs(false)
    }

    if (webhookData.quantityTracking) {
      setApiQuantityTracking(webhookData.quantityTracking)
    } else {
      setApiQuantityTracking(null)
    }

    if (webhookData.unplacedItems) {
      setApiUnplacedItems(webhookData.unplacedItems)
    } else {
      setApiUnplacedItems(null)
    }

    const allUsedSheets: UsedSheet[] = []
    responses.forEach((res: any) => {
      const svgKeys = Object.keys(res).filter(key => key.match(/^svg\d*$/))
      if (svgKeys.length > 0) {
        svgKeys.forEach((svgKey, index) => {
          const svgContent = res[svgKey]
          if (svgContent) {
            const sheetInfo = res.usedSheets?.[index] || {}
            allUsedSheets.push({
              sheetNumber: index + 1,
              stockSheet: sheetInfo.stockSheet || `Sheet ${index + 1}`,
              efficiency: sheetInfo.efficiency || 0,
              wasteArea: sheetInfo.wasteArea || 0,
              svg: svgContent,
              placedParts: sheetInfo.placedParts
            })
          }
        })
      } else if (res.usedSheets && res.usedSheets.length > 0) {
        res.usedSheets.forEach((sheet: UsedSheet) => {
          if (sheet.svg) allUsedSheets.push(sheet)
        })
      }
    })

    setCutplans(allUsedSheets)

    if (webhookData) {
      const remainders = webhookData.remainders || webhookData.usedSheets?.[0]?.remainders || []
      setPreservedFullSheetData({
        sourceBarcodeId: webhookData.sourceBarcodeId || '',
        svg: allUsedSheets[0]?.svg || '',
        dimensionString: webhookData.dimensionString || '',
        remainders,
        labels: remainders.map((r: any) => r.label || r.dimensions || '')
      })

      if (webhookData.quantityTracking) setApiQuantityTracking(webhookData.quantityTracking)
      else setApiQuantityTracking(null)

      if (webhookData.unplacedItems) setApiUnplacedItems(webhookData.unplacedItems)
      else setApiUnplacedItems(null)

      const dimStrings: string[] = []
      const dsKeys = ['dimensionString1', 'dimensionString2', 'dimensionString3', 'dimensionString4', 'dimensionString5']
      dsKeys.forEach(k => { if ((webhookData as any)[k]) dimStrings.push((webhookData as any)[k]) })
      if (dimStrings.length === 0 && webhookData.usedSheets) {
        webhookData.usedSheets.forEach((sheet: any) => {
          dsKeys.forEach(k => { if (sheet[k] && !dimStrings.includes(sheet[k])) dimStrings.push(sheet[k]) })
        })
      }
      setFullSheetDimStrings(dimStrings)
      setSelectedFullSheetRemainders([])
    }

    if (allUsedSheets.length === 0) {
      setError('No cutplan visualization data received from server.')
    }
  }

  const handleDownloadAll = () => {
    cutplans.forEach((sheet, index) => {
      const blob = new Blob([sheet.svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `cutplan-sheet-${sheet.sheetNumber || index + 1}.svg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    })
  }

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.2, 3))
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.2, 0.2))
  const handleResetZoom = () => setZoomLevel(1)
  const handleRotateLeft = () => setRotationAngle(prev => prev - 90)
  const handleRotateRight = () => setRotationAngle(prev => prev + 90)
  const handleResetRotation = () => setRotationAngle(0)

  const handleRevisualizeRemnants = async () => {
    const data = prepareWebhookData()
    if (data.panels.length === 0) { setError('Please add at least one panel.'); return }
    if (data.stocksheets.length === 0) { setError('Please add at least one stock sheet.'); return }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('https://n8n.mkindustrials.com/webhook/Visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, strategy: 'random' }),
      })

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const responseText = await response.text()
      if (!responseText || responseText.trim() === '') throw new Error('Empty response from server')

      const result = JSON.parse(responseText)
      processVisualizationResponse(result)
    } catch (error) {
      setError(`Failed to revisualize: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRevisualizeFullSheet = async () => {
    const data = prepareWebhookData()
    if (data.panels.length === 0) { setError('Please add at least one panel.'); return }
    if (data.stocksheets.length === 0) { setError('Please add at least one stock sheet.'); return }

    setLoading(true)
    setError('')
    setCutplans([])

    try {
      const response = await fetch('https://n8n.mkindustrials.com/webhook/Visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, strategy: 'random', isRemnantGeneration: true }),
      })

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const responseText = await response.text()
      if (!responseText || responseText.trim() === '') throw new Error('Empty response from server')

      const result = JSON.parse(responseText)
      processVisualizationResponse(result)
    } catch (error) {
      setError(`Failed to revisualize: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleVisualize = async () => {
    const data = prepareWebhookData()
    if (data.panels.length === 0) { setError('Please add at least one panel with valid dimensions and quantity.'); return }
    if (data.stocksheets.length === 0) { setError('Please add at least one stock sheet with valid dimensions and quantity.'); return }
    if (!productName.trim()) { setError('Please enter Product Name.'); return }
    if (!productColor.trim()) { setError('Please enter Product Color.'); return }
    if (!productThickness.trim()) { setError('Please enter Product Thickness.'); return }

    setLoading(true)
    setError('')
    setCutplans([])
    setShowRemnantSvgs(false)
    setRemainingCutPlanSvg(null)
    setRemainingCutPlanData(null)
    setFullSheetPdfUrl(null)
    setApiQuantityTracking(null)
    setApiUnplacedItems(null)
    setFullSheetDimStrings([])
    setRemnantPdfUrls(new Map())
    setSelectedRemnantDimStrings(new Map())
    setCustomRemnantInputs(new Map([[0, ['']]]))
    setLockedRemnantIndexes(new Set())
    setLockedRemnantSnapshots(new Map())
    setLockedFullSheetSvg(null)

    try {
      const response = await fetch('https://n8n.mkindustrials.com/webhook/Visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const responseText = await response.text()
      if (!responseText || responseText.trim() === '') throw new Error('Empty response from server')

      const result = JSON.parse(responseText)
      processVisualizationResponse(result)
    } catch (error) {
      setError(`Failed to generate cutplan: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleScanBarcode = (sheetId: string) => {
    setScannedSheetId(sheetId)
    setScanMode('choice')
    setError('')
  }

  const startCameraScanning = async () => {
    if (scanner) return
    setCameraError('')

    try {
      const html5QrCode = new Html5Qrcode("qr-reader-inventory")
      const devices = await Html5Qrcode.getCameras()
      if (!devices || devices.length === 0) { setCameraError('No cameras found on this device'); return }

      const cameraId = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'))?.id || devices[0].id

      await html5QrCode.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText) => { handleCameraBarcodeScanned(decodedText) },
        () => {}
      )
      setScanner(html5QrCode)
    } catch (err) {
      setCameraError(err instanceof Error && err.message.includes('Permission denied')
        ? 'Camera access denied. Please allow camera permissions.'
        : 'Failed to start camera. Please check permissions.')
    }
  }

  const stopCameraScanning = async () => {
    if (scanner) {
      try { await scanner.stop(); setScanner(null) } catch (err) { console.error('Error stopping camera:', err) }
    }
  }

  const startRemainingCameraScanning = async () => {
    if (remainingScanner) return
    setRemainingCameraError('')
    try {
      const html5QrCode = new Html5Qrcode("qr-reader-remaining")
      const devices = await Html5Qrcode.getCameras()
      if (!devices || devices.length === 0) { setRemainingCameraError('No cameras found on this device'); return }
      const cameraId = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'))?.id || devices[0].id
      await html5QrCode.start(
        cameraId,
        { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText) => { handleRemainingCameraScanned(decodedText) },
        () => {}
      )
      setRemainingScanner(html5QrCode)
    } catch (err) {
      setRemainingCameraError(err instanceof Error && err.message.includes('Permission denied')
        ? 'Camera access denied. Please allow camera permissions.'
        : 'Failed to start camera. Please check permissions.')
    }
  }

  const stopRemainingCameraScanning = async () => {
    if (remainingScanner) {
      try { await remainingScanner.stop(); setRemainingScanner(null) } catch (err) { console.error(err) }
    }
  }

  const handleRemainingCameraScanned = async (barcodeText: string) => {
    if (remainingScanner) {
      try { await remainingScanner.stop(); setRemainingScanner(null) } catch (err) { console.error(err) }
    }
    await processRemainingBarcode(barcodeText.trim())
  }

  const processRemainingBarcode = async (barcode: string) => {
    try {
      const response = await fetch('https://n8n.mkindustrials.com/webhook/scan-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ BarcodeID: barcode })
      })
      const data = await response.json()
      const scanResult = Array.isArray(data) && data[0] ? data[0] : data
      if (scanResult?.success) {
        setRemainingScanData(scanResult)
        setRemainingScanMode(null)
        setRemainingBarcodeInput('')
      } else {
        setError('Barcode scan failed: ' + (scanResult?.message || 'Unknown error'))
        setRemainingScanMode(null)
      }
    } catch (err) {
      setError('Error scanning barcode: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setRemainingScanMode(null)
    }
  }

  const handleCameraBarcodeScanned = async (barcodeText: string) => {
    if (scanner) {
      try { await scanner.stop(); setScanner(null) } catch (err) { console.error(err) }
    }
    await processScannedBarcode(barcodeText.trim())
  }

  const processScannedBarcode = async (barcode: string) => {
    if (!scannedSheetId) return

    try {
      const response = await fetch('https://n8n.mkindustrials.com/webhook/scan-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ BarcodeID: barcode })
      })
      const data = await response.json()
      const scanResult = Array.isArray(data) && data[0] ? data[0] : data

      if (scanResult?.success) {
        const material = scanResult.material || scanResult

        const scannedProductName = (material.ProductName || '').trim().toLowerCase()
        const scannedColor = (material.ProductColor || '').trim().toLowerCase()
        const thicknessVal = getMaterialThickness(material);
      const scannedThickness = String(thicknessVal).replace(/[^\d.]/g, '').trim()

        const inputProductName = productName.trim().toLowerCase()
        const inputColor = productColor.trim().toLowerCase()
        const inputThickness = productThickness.replace(/[^\d.]/g, '').trim()

        const nameMatch = scannedProductName === inputProductName || scannedProductName.includes(inputProductName) || inputProductName.includes(scannedProductName)
        const colorMatch = scannedColor === inputColor || scannedColor.includes(inputColor) || inputColor.includes(scannedColor)
        const thicknessMatch = scannedThickness === inputThickness

        if (!nameMatch || !colorMatch || !thicknessMatch) {
          const mismatches: string[] = []
          if (!nameMatch) mismatches.push(`Product Name (entered: "${productName}", scanned: "${material.ProductName || 'N/A'}")`)
          if (!colorMatch) mismatches.push(`Color (entered: "${productColor}", scanned: "${material.ProductColor || 'N/A'}")`)
          if (!thicknessMatch) mismatches.push(`Thickness (entered: "${productThickness}", scanned: "${scannedThickness || 'N/A'}")`)
          setError(`Sorry, but the barcode details don't match with the input entered â€” ${mismatches.join('; ')}`)
          setScanMode(null)
          return
        }

        const sizeInfo = getMaterialSize(material);
      const scannedLength = parseFloat(String(sizeInfo.length || '0').replace(/[^\d.]/g, ''))
        const scannedWidth = parseFloat(String(sizeInfo.width || '0').replace(/[^\d.]/g, ''))

        if (scannedLength > 0 && scannedWidth > 0) {
          const validStockSheets = stockSheets
            .filter(s => s.length && s.width && s.qty)
            .map(s => ({ length: parseFloat(s.length), width: parseFloat(s.width) }))
            .filter(s => s.length > 0 && s.width > 0)

          const sizeMatch = validStockSheets.some(s =>
            (Math.abs(s.length - scannedLength) < 5 && Math.abs(s.width - scannedWidth) < 5) ||
            (Math.abs(s.length - scannedWidth) < 5 && Math.abs(s.width - scannedLength) < 5)
          )

          if (!sizeMatch) {
            setError(`This size of stock sheet (${scannedLength}x${scannedWidth}mm) with the requested details doesn't exist. Please check your input.`)
            setScanMode(null)
            return
          }
        }

        setBarcodeScanData(prev => ({ ...prev, [scannedSheetId!]: scanResult }))
        setScanMode(null)
        setBarcodeInput('')
      } else {
        setError('Barcode scan failed: ' + (scanResult?.message || 'Unknown error'))
        setScanMode(null)
      }
    } catch (err) {
      setError('Error scanning barcode: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setScanMode(null)
    }
  }

  const handleApprove = () => {
    const fullSheetScan = barcodeScanData['sheet-1']
    if (!fullSheetScan?.success) {
      setError('Please scan the full sheet barcode before generating the barcode.')
      return
    }
    setApprovingSheet('cutplan-approval')
    setShowFullSheetBarcodeForm(true)
  }

  const handleFullSheetBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullSheetFormData.rack || !fullSheetFormData.location) {
      alert('Please fill in both rack and location')
      return
    }

    const fullSheetScan = barcodeScanData['sheet-1']
    if (!fullSheetScan?.success) {
      alert('Please scan the full sheet barcode before generating the barcode')
      return
    }

    const expandedCheckboxRemainders = selectedFullSheetRemainders.map(r => expandDimensionString(r))
    const validCustom = customFullSheetInputs.filter(r => r.trim()).map(r => expandDimensionString(r))

    const apiDims = [
      ...fullSheetDimStrings,
      ...collectDimensionStrings(preservedFullSheetData)
    ]

    const dimsToSend = expandedCheckboxRemainders.length > 0 ? expandedCheckboxRemainders : apiDims
    const allSelectedRemainders = [...new Set([...dimsToSend, ...validCustom])]

    setGeneratingFullSheetBarcode(true)

    try {
      const payload: any = {
        sourceBarcodeId:
          fullSheetScan?.material?.BarcodeID ||
          preservedFullSheetData?.sourceBarcodeId ||
          '',
        svg: lockedFullSheetSvg || preservedFullSheetData?.svg || cutplans[0]?.svg || '',
        rack: fullSheetFormData.rack,
        location: fullSheetFormData.location,
        isRemnantGeneration: true
      }

      allSelectedRemainders.forEach((r, i) => {
        payload[`dimensionString${i + 1}`] = r
      })

      if (preservedFullSheetData?.remainders) {
        payload.remainders = preservedFullSheetData.remainders
      }

      if (preservedFullSheetData?.labels) {
        payload.labels = preservedFullSheetData.labels
      }

      const response = await fetch('https://n8n.mkindustrials.com/webhook/generate-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) throw new Error(`HTTP error ${response.status}`)

      const responseData = await response.json()
      const data = Array.isArray(responseData) ? responseData[0] : responseData

      if (data.success === true || data.success === 'true') {
        if (data.labelLink) setFullSheetPdfUrl(data.labelLink)
        setLockedFullSheetSvg(preservedFullSheetData?.svg || cutplans[0]?.svg || null)
        setShowFullSheetBarcodeForm(false)
        setFullSheetFormData({ rack: '', location: '' })
      } else {
        alert('Barcode generation failed')
      }
    } catch (err) {
      alert('Failed to generate barcode: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setGeneratingFullSheetBarcode(false)
    }
  }

  const handleGenerateRemainingCutPlan = async () => {
    const remainingPanels = computeRemainingPanels()
    if (remainingPanels.length === 0) { setError('All pieces have been placed.'); return }

    const data = prepareWebhookData()
    setRemainingCutPlanLoading(true)

    try {
      const response = await fetch('https://n8n.mkindustrials.com/webhook/Visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, panels: remainingPanels, isRemnantGeneration: true })
      })

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const responseText = await response.text()
      if (!responseText || responseText.trim() === '') throw new Error('Empty response')

      const result = JSON.parse(responseText)
      const responses = Array.isArray(result) ? result : [result]
      const firstResponse = responses[0]

      let svgFound = ''
      if (firstResponse?.usedSheets?.[0]?.svg) {
        svgFound = firstResponse.usedSheets[0].svg
      } else {
        const svgKeys = Object.keys(firstResponse).filter(k => k.match(/^svg\d*$/))
        if (svgKeys.length > 0) svgFound = firstResponse[svgKeys[0]]
      }

      if (svgFound) {
        setRemainingCutPlanSvg(svgFound)
        setRemainingCutPlanData(firstResponse)
        setRemnantSectionCollapsed(true)
        setSelectedRemainingRemainders([])
        setCustomRemainingInputs([''])
        setRemainingScanData(null)
        const dsKeys = ['dimensionString1', 'dimensionString2', 'dimensionString3', 'dimensionString4', 'dimensionString5']
        const dsList: string[] = []
        dsKeys.forEach(k => { if (firstResponse[k]) dsList.push(firstResponse[k]) })
        setRemainingDimStrings(dsList)
      } else {
        setError('No SVG received for remaining cut plan.')
      }
    } catch (err) {
      setError(`Failed to generate remaining cut plan: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setRemainingCutPlanLoading(false)
    }
  }

  const handleRevisualizeRemainingCutPlan = async () => {
    const remainingPanelsList = remainingPanels.length > 0 ? remainingPanels : computeRemainingPanels()
    if (remainingPanelsList.length === 0) { setError('All pieces have been placed.'); return }

    const data = prepareWebhookData()
    setRemainingCutPlanLoading(true)
    setRemainingCutPlanSvg(null)

    try {
      const response = await fetch('https://n8n.mkindustrials.com/webhook/Visualize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, panels: remainingPanelsList, isRemnantGeneration: true, strategy: 'random' })
      })

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const responseText = await response.text()
      if (!responseText || responseText.trim() === '') throw new Error('Empty response')

      const result = JSON.parse(responseText)
      const responses = Array.isArray(result) ? result : [result]
      const firstResponse = responses[0]

      let svgFound = ''
      if (firstResponse?.usedSheets?.[0]?.svg) {
        svgFound = firstResponse.usedSheets[0].svg
      } else {
        const svgKeys = Object.keys(firstResponse).filter(k => k.match(/^svg\d*$/))
        if (svgKeys.length > 0) svgFound = firstResponse[svgKeys[0]]
      }

      if (svgFound) {
        setRemainingCutPlanSvg(svgFound)
        setRemainingCutPlanData(firstResponse)
        setRemnantSectionCollapsed(true)
        setSelectedRemainingRemainders([])
        setCustomRemainingInputs([''])
        setRemainingScanData(null)
        const dsKeys = ['dimensionString1', 'dimensionString2', 'dimensionString3', 'dimensionString4', 'dimensionString5']
        const dsList: string[] = []
        dsKeys.forEach(k => { if (firstResponse[k]) dsList.push(firstResponse[k]) })
        setRemainingDimStrings(dsList)
      } else {
        setError('No SVG received for remaining cut plan.')
      }
    } catch (err) {
      setError(`Failed to revisualize: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setRemainingCutPlanLoading(false)
    }
  }

  const handleRemainingBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!remainingFormData.rack || !remainingFormData.location) { alert('Please fill in both rack and location'); return }
    if (!remainingScanData?.success) {
      alert('Please scan the full sheet barcode before generating the barcode')
      return
    }

    const expandedCheckbox = selectedRemainingRemainders.map(r => expandDimensionString(r))
    const validCustom = customRemainingInputs.filter(r => r.trim()).map(r => expandDimensionString(r))
    const allDimStrings = [...expandedCheckbox, ...validCustom]

    setGeneratingRemainingBarcode(true)

    try {
      const payload: any = {
        sourceBarcodeId: remainingCutPlanData?.sourceBarcodeId || '',
        svg: remainingCutPlanSvg || '',
        rack: remainingFormData.rack,
        location: remainingFormData.location,
        isRemnantGeneration: true
      }

      if (allDimStrings.length > 0) {
        allDimStrings.forEach((d, i) => { payload[`dimensionString${i + 1}`] = d })
      } else if (remainingDimStrings.length > 0) {
        remainingDimStrings.forEach((d, i) => { payload[`dimensionString${i + 1}`] = d })
      } else if (remainingCutPlanData) {
        payload.dimensionString = remainingCutPlanData.dimensionString || ''
        payload.remainders = remainingCutPlanData.remainders || []
      }

      const response = await fetch('https://n8n.mkindustrials.com/webhook/generate-barcode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      })

      if (!response.ok) throw new Error('HTTP error')
      const responseData = await response.json()
      const data = Array.isArray(responseData) ? responseData[0] : responseData

      if (data.success === 'true' || data.success === true) {
        if (data.labelLink) { setRemainingPdfUrl(data.labelLink); setShowRemainingBarcodeForm(false); setRemainingFormData({ rack: '', location: '' }) }
      } else { alert('Barcode generation failed') }
    } catch (err) {
      alert(`Failed to generate barcode: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGeneratingRemainingBarcode(false)
    }
  }

  const cls = {
    inputField: `w-full px-2 py-1 border rounded text-sm ${theme === 'dark' ? 'bg-white/5 border-white/20 text-white' : 'bg-white/50 border-gray-300 text-gray-800'}`,
    card: `rounded-xl border p-4 ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white/40 border-white/50'}`,
    label: `text-xs ${theme === 'dark' ? 'text-white/50' : 'text-gray-500'}`,
    text: `${theme === 'dark' ? 'text-white' : 'text-gray-800'}`,
    subtext: `${theme === 'dark' ? 'text-white/70' : 'text-gray-600'}`,
    checkboxRow: (checked: boolean) => `flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
      checked
        ? theme === 'dark' ? 'bg-blue-500/20 border-blue-500/50' : 'bg-blue-100 border-blue-400'
        : theme === 'dark' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white/30 border-white/40 hover:bg-white/50'
    }`,
    btnPrimary: 'w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700',
    btnSecondary: `w-full border py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white hover:bg-white/15' : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'}`,
    zoomBtn: `px-3 py-1 rounded text-sm border transition-colors ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white hover:bg-white/15' : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'}`,
  }

  const renderRemainderSection = (
    remainders: any[],
    selected: string[],
    setSelected: (v: string[]) => void,
    customInputs: string[],
    setCustomInputs: (v: string[]) => void
  ) => (
    <div className={`mb-4 ${cls.card}`}>
      {remainders.length > 0 && (
        <>
          <label className={`block text-sm font-medium mb-3 ${cls.text}`}>Select Remainders for Barcode (Optional)</label>
          <div className="space-y-2 mb-3">
            {remainders.map((remainder: any, idx: number) => {
              const displayDim = remainder.dimensions || remainder.label || ''
              if (!displayDim) return null
              const isChecked = selected.includes(displayDim)
              return (
                <label key={idx} className={cls.checkboxRow(isChecked)}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => setSelected(isChecked ? selected.filter(s => s !== displayDim) : [...selected, displayDim])}
                    className="w-4 h-4 rounded flex-shrink-0"
                  />
                  <span className={`font-medium text-sm break-all ${cls.text}`}>{displayDim}</span>
                </label>
              )
            })}
          </div>
        </>
      )}
      <label className={`block text-xs font-medium mb-2 ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}>
        Custom Remainders {remainders.length > 0 ? '(Optional)' : ''}
      </label>
      <div className="space-y-2">
        {customInputs.map((val, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type="text"
              value={val}
              onChange={(e) => {
                const updated = [...customInputs]; updated[idx] = e.target.value; setCustomInputs(updated)
              }}
              placeholder="e.g., 1220x2440"
              className={`flex-1 px-3 py-2 border rounded-lg text-sm ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`}
            />
            <button type="button" onClick={() => setCustomInputs([...customInputs, ''])} className={`px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20' : 'bg-white/50 border border-gray-300 text-gray-700 hover:bg-white/70'}`}>+</button>
            {idx > 0 && (
              <button type="button" onClick={() => { const u = customInputs.filter((_, i) => i !== idx); setCustomInputs(u.length > 0 ? u : ['']) }} className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10">x</button>
            )}
          </div>
        ))}
      </div>
      {remainders.length > 0 && <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-white/40' : 'text-gray-500'}`}>Leave all unchecked to send all remainders, or select specific ones</p>}
    </div>
  )

  const renderBarcodeForm = (
    formData: { rack: string; location: string },
    setFormData: (v: { rack: string; location: string }) => void,
    onSubmit: (e: React.FormEvent) => void,
    generating: boolean,
    onCancel: () => void
  ) => (
    <form onSubmit={onSubmit} className={cls.card}>
      <h5 className={`font-medium mb-4 text-center ${cls.text}`}>Enter Storage Location</h5>
      <div className="space-y-3 mb-4">
        <div>
          <label className={`flex items-center gap-2 text-sm font-medium mb-1.5 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}><MapPin className="w-4 h-4" /> Rack</label>
          <input type="text" value={formData.rack} onChange={(e) => setFormData({ ...formData, rack: e.target.value })} placeholder="e.g., B2" required className={`w-full px-3 py-2.5 border rounded-xl ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`} />
        </div>
        <div>
          <label className={`flex items-center gap-2 text-sm font-medium mb-1.5 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}><MapPin className="w-4 h-4" /> Location</label>
          <select value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} required className={`w-full px-3 py-2.5 border rounded-xl ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white' : 'bg-white/50 border-gray-300 text-gray-800'}`}>
            <option value="">Select location</option>
            <option value="Office">Office</option>
            <option value="Godown">Godown</option>
            <option value="Warehouse">Warehouse</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={generating} className="flex-1 text-white py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700">
          {generating ? <><LoadingSpinner size="sm" />Generating...</> : 'Generate Barcode'}
        </button>
        <button type="button" onClick={onCancel} className={`px-4 py-2.5 rounded-xl font-medium border ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white hover:bg-white/15' : 'bg-white/50 border-gray-300 text-gray-700 hover:bg-white/60'}`}>Cancel</button>
      </div>
    </form>
  )

  const renderScanBarcodeModal = (sheetIndex: number) => {
    const sheetId = `sheet-${sheetIndex + 1}`
    if (scanMode === null || scannedSheetId !== sheetId) return null

    return (
      <div className={`mt-3 p-3 rounded-lg ${theme === 'dark' ? 'bg-white/10' : 'bg-white/50'}`}>
        {scanMode === 'choice' && (
          <div className="space-y-2">
            <h6 className={`font-medium mb-3 text-center ${cls.text}`}>Scan Barcode</h6>
            <button onClick={() => { setScanMode('camera'); setTimeout(() => startCameraScanning(), 100) }} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}><Camera className="w-4 h-4" /> Use Camera</button>
            <button onClick={() => setScanMode('manual')} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white hover:bg-white/15' : 'bg-white/50 border-gray-300 text-gray-700 hover:bg-white/60'}`}><Hash className="w-4 h-4" /> Enter Manually</button>
            <button onClick={() => { setScanMode(null); stopCameraScanning() }} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10' : 'bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200'}`}>Cancel</button>
          </div>
        )}
        {scanMode === 'camera' && (
          <div>
            <div ref={scannerRef} id="qr-reader-inventory" className="mb-3 rounded-lg overflow-hidden" style={{ minHeight: '250px' }} />
            {cameraError && <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`}>{cameraError}</p>}
            <button onClick={() => { setScanMode('choice'); stopCameraScanning() }} className={`w-full px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>Cancel</button>
          </div>
        )}
        {scanMode === 'manual' && (
          <div>
            <h6 className={`font-medium mb-3 ${cls.text}`}>Enter Barcode:</h6>
            <input type="text" placeholder="Type or scan barcode..." value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} className={`w-full p-2 rounded text-sm mb-3 ${theme === 'dark' ? 'bg-white/10 text-white placeholder-white/50' : 'bg-white/50 text-gray-800 placeholder-gray-500'}`} onKeyPress={(e) => { if (e.key === 'Enter' && barcodeInput.trim()) { processScannedBarcode(barcodeInput.trim()); setBarcodeInput('') } }} autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { if (barcodeInput.trim()) { processScannedBarcode(barcodeInput.trim()); setBarcodeInput('') } }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>Scan</button>
              <button onClick={() => { setScanMode(null); setBarcodeInput('') }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const remnantTracking = showRemnantSvgs && remnantSvgs.length > 0
    ? (apiQuantityTracking
        ? (() => {
            const sizeBreakdown = Object.entries(apiQuantityTracking).map(([size, v]) => ({
              size,
              requested: v.requested,
              placed: v.placed,
              unplaced: v.remaining
            }))
            const totalRequested = sizeBreakdown.reduce((s, x) => s + x.requested, 0)
            const totalPlaced = sizeBreakdown.reduce((s, x) => s + x.placed, 0)
            const totalUnplaced = sizeBreakdown.reduce((s, x) => s + x.unplaced, 0)
            const totalPlacedBySize: Record<string, number> = {}
            sizeBreakdown.forEach(x => { totalPlacedBySize[x.size.replace(/Ã—/g, 'x')] = x.placed })
            return { totalRequested, totalPlaced, totalUnplaced, sizeBreakdown, totalPlacedBySize }
          })()
        : computeRemnantQuantityTracking())
    : null
  const remainingPanels = remnantTracking
    ? (apiUnplacedItems
        ? apiUnplacedItems
            .filter(u => u.remaining > 0)
            .map(u => {
              const parts = u.size.replace(/Ã—/g, 'x').split('x')
              return { length: parseFloat(parts[0]) || 0, width: parseFloat(parts[1]) || 0, qty: u.remaining }
            })
            .filter(p => p.qty > 0)
        : computeRemainingPanels())
    : []
  const totalRemainingPieces = remainingPanels.reduce((sum, p) => sum + p.qty, 0)

  const mockSvg = `<svg width="400" height="200" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="200" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2" stroke-dasharray="5,5"/><text x="200" y="95" text-anchor="middle" font-family="Arial" font-size="14" fill="#6c757d">Cutplan visualization will appear here</text><text x="200" y="120" text-anchor="middle" font-family="Arial" font-size="12" fill="#6c757d">Click "Play" to generate cutplan</text></svg>`

  return (
    <div className={`p-6 rounded-2xl border backdrop-blur-md ${theme === 'dark' ? 'bg-white/10 border-white/20' : 'bg-white/40 border-white/50'}`} style={{ backdropFilter: 'blur(12px)', boxShadow: theme === 'dark' ? '0 20px 25px -5px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' : '0 20px 25px -5px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)' }}>
      <div className="flex items-center justify-between mb-6">
        <h3 className={`text-xl font-bold ${cls.text}`}>Inventory Visualizer</h3>
        <div className="flex items-center gap-2">
          <label className={`text-sm font-medium ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Blade/Kerf (mm):</label>
          <input type="number" step="0.1" min="0" value={bladeThickness} onChange={(e) => setBladeThickness(e.target.value)} className={`w-20 px-2 py-1 border rounded text-center ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white' : 'bg-white/50 border-gray-300 text-gray-800'}`} />
        </div>
      </div>

      {error && (
        <div className={`mb-4 p-3 border rounded-lg text-sm ${theme === 'dark' ? 'bg-red-500/20 border-red-500/50 text-red-200' : 'bg-red-50 border-red-200 text-red-600'}`}>
          {error}
          <button className="ml-2 underline text-xs" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className={`font-semibold ${cls.text}`}>Panels (Sizes)</h4>
            <button onClick={addPanelRow} className={`p-1 rounded hover:opacity-80 ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}><Plus className="w-4 h-4" /></button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className={`border-b ${theme === 'dark' ? 'border-white/20' : 'border-gray-200'}`}>
              <th className={`text-left p-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Length</th>
              <th className={`text-left p-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Width</th>
              <th className={`text-left p-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Qty</th>
              <th className="w-8"></th>
            </tr></thead>
            <tbody>
              {panels.map((panel, index) => (
                <tr key={panel.id} className={`border-b ${theme === 'dark' ? 'border-white/10' : 'border-gray-100'}`}>
                  <td className="p-1"><input type="number" step="0.1" min="0" value={panel.length} onChange={(e) => updatePanel(panel.id, 'length', e.target.value)} onFocus={() => handlePanelFocus(index)} className={cls.inputField} placeholder="mm" /></td>
                  <td className="p-1"><input type="number" step="0.1" min="0" value={panel.width} onChange={(e) => updatePanel(panel.id, 'width', e.target.value)} onFocus={() => handlePanelFocus(index)} className={cls.inputField} placeholder="mm" /></td>
                  <td className="p-1"><input type="number" min="1" value={panel.qty} onChange={(e) => updatePanel(panel.id, 'qty', e.target.value)} onFocus={() => handlePanelFocus(index)} className={cls.inputField} placeholder="qty" /></td>
                  <td className="p-1">{panels.length > 4 && <button onClick={() => removePanelRow(panel.id)} className={`p-1 rounded ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}><Trash2 className="w-3 h-3" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className={`font-semibold ${cls.text}`}>Stock Sheets</h4>
            <button onClick={addStockSheetRow} className={`p-1 rounded hover:opacity-80 ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}><Plus className="w-4 h-4" /></button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className={`border-b ${theme === 'dark' ? 'border-white/20' : 'border-gray-200'}`}>
              <th className={`text-left p-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Length</th>
              <th className={`text-left p-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Width</th>
              <th className={`text-left p-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Qty</th>
              <th className="w-8"></th>
            </tr></thead>
            <tbody>
              {stockSheets.map((sheet, index) => (
                <tr key={sheet.id} className={`border-b ${theme === 'dark' ? 'border-white/10' : 'border-gray-100'}`}>
                  <td className="p-1"><input type="number" step="0.1" min="0" value={sheet.length} onChange={(e) => updateStockSheet(sheet.id, 'length', e.target.value)} onFocus={() => handleStockSheetFocus(index)} className={cls.inputField} placeholder="mm" /></td>
                  <td className="p-1"><input type="number" step="0.1" min="0" value={sheet.width} onChange={(e) => updateStockSheet(sheet.id, 'width', e.target.value)} onFocus={() => handleStockSheetFocus(index)} className={cls.inputField} placeholder="mm" /></td>
                  <td className="p-1"><input type="number" min="1" value={sheet.qty} onChange={(e) => updateStockSheet(sheet.id, 'qty', e.target.value)} onFocus={() => handleStockSheetFocus(index)} className={cls.inputField} placeholder="qty" /></td>
                  <td className="p-1">{stockSheets.length > 4 && <button onClick={() => removeStockSheetRow(sheet.id)} className={`p-1 rounded ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}><Trash2 className="w-3 h-3" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6">
        <h4 className={`font-semibold mb-4 ${cls.text}`}>Product Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Product Name <span className="text-red-500">*</span></label>
            <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g., POM, Acrylic" className={`w-full px-3 py-2 border rounded-lg ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`} />
          </div>
          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Product Color <span className="text-red-500">*</span></label>
            <input type="text" value={productColor} onChange={(e) => setProductColor(e.target.value)} placeholder="e.g., Black, Natural" className={`w-full px-3 py-2 border rounded-lg ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`} />
          </div>
          <div>
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-white/80' : 'text-gray-700'}`}>Product Thickness <span className="text-red-500">*</span></label>
            <input type="text" value={productThickness} onChange={(e) => setProductThickness(e.target.value)} placeholder="e.g., 3mm, 5mm" className={`w-full px-3 py-2 border rounded-lg ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end mb-6">
        <button onClick={handleVisualize} disabled={loading} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'} ${theme === 'dark' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>
          {loading ? <><LoadingSpinner size="sm" />Processing...</> : <><Play className="w-4 h-4" />Play</>}
        </button>
      </div>

      {/* ===== REMNANT SVG VIEW ===== */}
      {showRemnantSvgs && remnantSvgs.length > 0 && (
        <div className={`rounded-2xl border mb-4 ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white/40 border-white/50'}`}>
          <button
            onClick={() => setRemnantSectionCollapsed(!remnantSectionCollapsed)}
            className={`w-full flex items-center justify-between p-4 rounded-t-2xl transition-colors ${theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-white/30'}`}
          >
            <h4 className={`text-lg font-bold ${cls.text}`}>Remnant Cut Plans ({remnantSvgs.length} remnant{remnantSvgs.length > 1 ? 's' : ''})</h4>
            {remnantSectionCollapsed
              ? <ChevronDown className={`w-5 h-5 ${cls.subtext}`} />
              : <ChevronUp className={`w-5 h-5 ${cls.subtext}`} />}
          </button>

          {!remnantSectionCollapsed && (
            <div className="p-4 pt-0">
              {remnantTracking && remnantTracking.totalRequested > 0 && (
                <div className={`mb-4 ${cls.card}`}>
                  <h5 className={`font-semibold mb-3 ${cls.text}`}>Overall Quantity Tracking</h5>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className={`p-3 rounded-lg text-center ${theme === 'dark' ? 'bg-white/10' : 'bg-white/60'}`}>
                      <div className={`text-xs ${cls.label}`}>Total Requested</div>
                      <div className={`text-lg font-bold ${cls.text}`}>{remnantTracking.totalRequested}</div>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${theme === 'dark' ? 'bg-green-500/20' : 'bg-green-50'}`}>
                      <div className={`text-xs ${theme === 'dark' ? 'text-green-300' : 'text-green-700'}`}>Placed</div>
                      <div className="text-lg font-bold text-green-500">{remnantTracking.totalPlaced}</div>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${theme === 'dark' ? 'bg-red-500/20' : 'bg-red-50'}`}>
                      <div className={`text-xs ${theme === 'dark' ? 'text-red-300' : 'text-red-700'}`}>Unplaced</div>
                      <div className="text-lg font-bold text-red-500">{remnantTracking.totalUnplaced}</div>
                    </div>
                  </div>
                  {remnantTracking.sizeBreakdown.length > 0 && (
                    <div className={`overflow-hidden rounded-lg border ${theme === 'dark' ? 'border-white/10' : 'border-gray-200'}`}>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={`${theme === 'dark' ? 'bg-white/10' : 'bg-gray-100'}`}>
                            <th className={`text-left px-3 py-2 font-semibold ${cls.text}`}>Size (mm)</th>
                            <th className={`text-center px-3 py-2 font-semibold ${cls.text}`}>Requested</th>
                            <th className="text-center px-3 py-2 font-semibold text-green-500">Placed</th>
                            <th className="text-center px-3 py-2 font-semibold text-red-500">Unplaced</th>
                          </tr>
                        </thead>
                        <tbody>
                          {remnantTracking.sizeBreakdown.map((s, i) => (
                            <tr key={i} className={`border-t ${theme === 'dark' ? 'border-white/5' : 'border-gray-100'} ${s.unplaced > 0 ? (theme === 'dark' ? 'bg-red-500/5' : 'bg-red-50/50') : ''}`}>
                              <td className={`px-3 py-2 font-medium ${cls.text}`}>{s.size}</td>
                              <td className={`text-center px-3 py-2 ${cls.subtext}`}>{s.requested}</td>
                              <td className="text-center px-3 py-2 text-green-500 font-medium">{s.placed}</td>
                              <td className={`text-center px-3 py-2 font-medium ${s.unplaced > 0 ? 'text-red-500' : cls.subtext}`}>{s.unplaced}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {remnantSvgs.length > 1 && (
                <div className="flex gap-2 mb-4 flex-wrap">
                  {remnantSvgs.map((remnant, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedRemnantIndex(index)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedRemnantIndex === index ? (theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white') : (theme === 'dark' ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-white/50 text-gray-600 hover:bg-white/70')}`}
                    >
                      {remnant.barcodeId || `Remnant ${index + 1}`}
                      {remnantPdfUrls.has(index) && <span className="ml-1 text-green-400">âœ“</span>}
                    </button>
                  ))}
                </div>
              )}

              {remnantSvgs[selectedRemnantIndex] && (
                <div>
                  {(() => {
                    const r = remnantSvgs[selectedRemnantIndex]
                    const placed = r.nestingResult?.placedPieces ?? r.nestingResult?.placedPanels ?? 0
                    const total = r.nestingResult?.totalPanels ?? 0
                    const unplaced = r.nestingResult?.unplacedPanels ?? Math.max(0, total - placed)
                    return (
                      <div className={`mb-4 p-3 rounded-lg ${theme === 'dark' ? 'bg-white/5' : 'bg-white/50'}`}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                          <div><span className={cls.label}>Barcode</span><p className={`font-medium truncate ${cls.text}`}>{r.barcodeId}</p></div>
                          <div><span className={cls.label}>Location</span><p className={`font-medium ${cls.text}`}>{r.rack || r.location || 'N/A'}</p></div>
                          <div><span className={cls.label}>Product</span><p className={`font-medium ${cls.text}`}>{r.productName || 'N/A'}</p></div>
                          <div>
                            <span className={cls.label}>Placed / Total</span>
                            <p className={`font-medium ${cls.text}`}>{placed} / {total} <span className="text-red-400 text-xs">({unplaced} unplaced)</span></p>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="mb-3 flex items-center justify-center gap-2 flex-wrap">
                    <button onClick={() => setRemnantZoom(p => Math.max(25, p - 25))} className={cls.zoomBtn}>Zoom Out</button>
                    <span className={`px-3 py-1 text-sm ${cls.text}`}>{remnantZoom}%</span>
                    <button onClick={() => setRemnantZoom(p => Math.min(200, p + 25))} className={cls.zoomBtn}>Zoom In</button>
                    <button onClick={() => setRemnantZoom(75)} className={cls.zoomBtn}>Reset</button>
                  </div>

                  <div className="w-full overflow-auto border rounded mb-4" style={{ maxHeight: '400px' }}>
                    <div style={{ transform: `scale(${remnantZoom / 100})`, transformOrigin: 'top left', transition: 'transform 0.2s ease' }} dangerouslySetInnerHTML={{ __html: remnantSvgs[selectedRemnantIndex].svg }} />
                  </div>

                  {(() => {
                    const r = remnantSvgs[selectedRemnantIndex]
                    const dimStrings: Array<{ key: string; original: string; display: string }> = []
                    if (r.dimensionString1) dimStrings.push({ key: 'ds1', original: r.dimensionString1, display: simplifyDimensionString(r.dimensionString1) })
                    if (r.dimensionString2) dimStrings.push({ key: 'ds2', original: r.dimensionString2, display: simplifyDimensionString(r.dimensionString2) })
                    if (r.dimensionString3) dimStrings.push({ key: 'ds3', original: r.dimensionString3, display: simplifyDimensionString(r.dimensionString3) })
                    const selectedDims = getCurrentSelectedDimStrings()
                    const customInputs = getCurrentCustomInputs()
                    const availableRemainders = r.fixedRemainders || []
                    const checkboxesToShow = dimStrings.length > 0
                      ? dimStrings.map(d => ({ dimensions: d.display, _original: d.original }))
                      : availableRemainders

                    return (
                      <div>
                        {checkboxesToShow.length > 0 && (
                          <div className={`mb-4 ${cls.card}`}>
                            <label className={`block text-sm font-medium mb-3 ${cls.text}`}>Select Remainders to Generate Barcode</label>
                            <div className="space-y-2">
                              {checkboxesToShow.map((item: any, idx: number) => {
                                const origKey = item._original || item.dimensions || item.label || ''
                                const dispVal = item.dimensions || item.label || ''
                                const isChecked = selectedDims.includes(origKey)
                                return (
                                  <label key={idx} className={cls.checkboxRow(isChecked)}>
                                    <input type="checkbox" checked={isChecked} onChange={() => toggleRemnantDimString(origKey)} className="w-4 h-4 rounded flex-shrink-0" />
                                    <span className={`font-medium text-sm break-all ${cls.text}`}>{dispVal}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div className={`mb-4 ${cls.card}`}>
                          <label className={`block text-xs font-medium mb-2 ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}>Custom Remainders (Optional)</label>
                          <div className="space-y-2">
                            {customInputs.map((val, idx) => (
                              <div key={idx} className="flex gap-2">
                                <input type="text" value={val} onChange={(e) => handleCustomRemnantInputChange(idx, e.target.value)} placeholder="e.g., 1220x2440" className={`flex-1 px-3 py-2 border rounded-lg text-sm ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`} />
                                <button type="button" onClick={handleAddCustomRemnantInput} className={`px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20' : 'bg-white/50 border border-gray-300 text-gray-700 hover:bg-white/70'}`}>+</button>
                                {idx > 0 && <button type="button" onClick={() => handleRemoveCustomRemnantInput(idx)} className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10">x</button>}
                              </div>
                            ))}
                          </div>
                          <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-white/40' : 'text-gray-500'}`}>Enter custom remainder dimensions (e.g., 1220x2440)</p>
                        </div>
                      </div>
                    )
                  })()}

                  {remnantPdfUrls.get(selectedRemnantIndex) && (
                    <div className={`mb-4 p-3 rounded-xl ${theme === 'dark' ? 'bg-green-500/20 border border-green-500/30' : 'bg-green-50 border border-green-300'}`}>
                      <p className={`text-center text-sm font-medium mb-2 ${theme === 'dark' ? 'text-green-200' : 'text-green-700'}`}>Barcode generated for this remnant</p>
                      <button onClick={() => window.open(remnantPdfUrls.get(selectedRemnantIndex)!, '_blank')} className="w-full text-white py-2 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700"><Download className="w-4 h-4" /> Download/Print PDF</button>
                    </div>
                  )}

                  {!showRemnantBarcodeForm
                    ? <button onClick={() => setShowRemnantBarcodeForm(true)} className={cls.btnPrimary}><CheckSquare className="w-4 h-4" />Approve Remnant Cut Plan & Generate Barcode</button>
                    : renderBarcodeForm(remnantFormData, setRemnantFormData, handleRemnantBarcodeSubmit, generatingRemnantBarcode, () => { setShowRemnantBarcodeForm(false); setRemnantFormData({ rack: '', location: '' }) })
                  }

                  <button onClick={handleRevisualizeRemnants} disabled={loading} className={`w-full mt-3 disabled:opacity-50 ${cls.btnSecondary}`}>
                    {loading ? <><LoadingSpinner size="sm" />Revisualizing...</> : <><RefreshCw className="w-4 h-4" />Revisualize</>}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== GENERATE CUT PLAN FOR REMAINING PIECES ===== */}
      {showRemnantSvgs && remnantSvgs.length > 0 && (totalRemainingPieces > 0 || remainingCutPlanSvg) && (
        <div className={`rounded-2xl border mb-6 p-4 ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white/40 border-white/50'}`}>
          {!remainingCutPlanSvg && totalRemainingPieces > 0 && (
            <>
              <p className={`text-sm mb-3 text-center ${cls.subtext}`}>
                After placing pieces in remnants: {remainingPanels.map(p => `${p.length}x${p.width}mm Ã— ${p.qty}`).join(', ')} still need fresh material.
              </p>
              <button
                onClick={handleGenerateRemainingCutPlan}
                disabled={remainingCutPlanLoading}
                className="w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 to-teal-700"
              >
                {remainingCutPlanLoading ? <><LoadingSpinner size="sm" />Generating...</> : <><Scissors className="w-4 h-4" />Generate Cut Plan for Remaining {totalRemainingPieces} Pieces</>}
              </button>
            </>
          )}

          {remainingCutPlanSvg && (
            <div>
              <h4 className={`text-lg font-bold mb-4 text-center ${cls.text}`}>Cut Plan for Remaining Pieces</h4>

              {remainingCutPlanData?.quantityTracking && Object.keys(remainingCutPlanData.quantityTracking).length > 0 && (
                <div className={`mb-4 p-3 rounded-lg border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white/40 border-white/50'}`}>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className={`p-2 rounded-lg text-center ${theme === 'dark' ? 'bg-white/10' : 'bg-white/60'}`}>
                      <div className={`text-xs ${cls.label}`}>Requested</div>
                      <div className={`text-base font-bold ${cls.text}`}>{remainingCutPlanData.totalPanelsRequested || 0}</div>
                    </div>
                    <div className={`p-2 rounded-lg text-center ${theme === 'dark' ? 'bg-green-500/20' : 'bg-green-50'}`}>
                      <div className={`text-xs ${theme === 'dark' ? 'text-green-300' : 'text-green-700'}`}>Placed</div>
                      <div className="text-base font-bold text-green-500">{remainingCutPlanData.totalPanelsPlaced || 0}</div>
                    </div>
                    <div className={`p-2 rounded-lg text-center ${theme === 'dark' ? 'bg-red-500/20' : 'bg-red-50'}`}>
                      <div className={`text-xs ${theme === 'dark' ? 'text-red-300' : 'text-red-700'}`}>Unplaced</div>
                      <div className="text-base font-bold text-red-500">{remainingCutPlanData.totalPanelsUnplaced || 0}</div>
                    </div>
                  </div>
                  <div className={`overflow-hidden rounded-lg border ${theme === 'dark' ? 'border-white/10' : 'border-gray-200'}`}>
                    <table className="w-full text-xs">
                      <thead><tr className={`${theme === 'dark' ? 'bg-white/10' : 'bg-gray-100'}`}>
                        <th className={`text-left px-3 py-2 font-semibold ${cls.text}`}>Size (mm)</th>
                        <th className={`text-center px-3 py-2 font-semibold ${cls.text}`}>Req</th>
                        <th className="text-center px-3 py-2 font-semibold text-green-500">Placed</th>
                        <th className="text-center px-3 py-2 font-semibold text-red-500">Unplaced</th>
                      </tr></thead>
                      <tbody>
                        {Object.entries(remainingCutPlanData.quantityTracking as Record<string, { requested: number; placed: number; remaining: number }>).map(([size, v], i) => (
                          <tr key={i} className={`border-t ${theme === 'dark' ? 'border-white/5' : 'border-gray-100'} ${v.remaining > 0 ? (theme === 'dark' ? 'bg-red-500/5' : 'bg-red-50/50') : ''}`}>
                            <td className={`px-3 py-2 font-medium ${cls.text}`}>{size}</td>
                            <td className={`text-center px-3 py-2 ${cls.subtext}`}>{v.requested}</td>
                            <td className="text-center px-3 py-2 text-green-500 font-medium">{v.placed}</td>
                            <td className={`text-center px-3 py-2 font-medium ${v.remaining > 0 ? 'text-red-500' : cls.subtext}`}>{v.remaining}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mb-3 flex items-center justify-center gap-2 flex-wrap">
                <button onClick={() => setRemainingCutPlanZoom(p => Math.max(25, p - 25))} className={cls.zoomBtn}>Zoom Out</button>
                <span className={`px-3 py-1 text-sm ${cls.text}`}>{remainingCutPlanZoom}%</span>
                <button onClick={() => setRemainingCutPlanZoom(p => Math.min(200, p + 25))} className={cls.zoomBtn}>Zoom In</button>
                <button onClick={() => setRemainingCutPlanZoom(75)} className={cls.zoomBtn}>Reset</button>
              </div>

              <div className="w-full overflow-auto border rounded mb-4" style={{ maxHeight: '400px' }}>
                <div style={{ transform: `scale(${remainingCutPlanZoom / 100})`, transformOrigin: 'top left', transition: 'transform 0.2s ease' }} dangerouslySetInnerHTML={{ __html: remainingCutPlanSvg }} />
              </div>

              <div className="mt-4 mb-4">
                <button
                  onClick={() => setRemainingScanMode(remainingScanMode ? null : 'choice')}
                  className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
                >
                  Scan Barcode
                </button>
                {remainingScanMode && (
                  <div className={`mt-3 p-3 rounded-lg ${theme === 'dark' ? 'bg-white/10' : 'bg-white/50'}`}>
                    {remainingScanMode === 'choice' && (
                      <div className="space-y-2">
                        <h6 className={`font-medium mb-3 text-center ${cls.text}`}>Scan Barcode</h6>
                        <button onClick={() => { setRemainingScanMode('camera'); setTimeout(() => startRemainingCameraScanning(), 100) }} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}><Camera className="w-4 h-4" /> Use Camera</button>
                        <button onClick={() => setRemainingScanMode('manual')} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white hover:bg-white/15' : 'bg-white/50 border-gray-300 text-gray-700 hover:bg-white/60'}`}><Hash className="w-4 h-4" /> Enter Manually</button>
                        <button onClick={() => { setRemainingScanMode(null); stopRemainingCameraScanning() }} className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10' : 'bg-gray-100 border border-gray-200 text-gray-600 hover:bg-gray-200'}`}>Cancel</button>
                      </div>
                    )}
                    {remainingScanMode === 'camera' && (
                      <div>
                        <div id="qr-reader-remaining" className="mb-3 rounded-lg overflow-hidden" style={{ minHeight: '250px' }} />
                        {remainingCameraError && <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`}>{remainingCameraError}</p>}
                        <button onClick={() => { setRemainingScanMode('choice'); stopRemainingCameraScanning() }} className={`w-full px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>Cancel</button>
                      </div>
                    )}
                    {remainingScanMode === 'manual' && (
                      <div>
                        <h6 className={`font-medium mb-3 ${cls.text}`}>Enter Barcode:</h6>
                        <input type="text" placeholder="Type or scan barcode..." value={remainingBarcodeInput} onChange={(e) => setRemainingBarcodeInput(e.target.value)} className={`w-full p-2 rounded text-sm mb-3 ${theme === 'dark' ? 'bg-white/10 text-white placeholder-white/50' : 'bg-white/50 text-gray-800 placeholder-gray-500'}`} onKeyPress={(e) => { if (e.key === 'Enter' && remainingBarcodeInput.trim()) { processRemainingBarcode(remainingBarcodeInput.trim()) } }} autoFocus />
                        <div className="flex gap-2">
                          <button onClick={() => { if (remainingBarcodeInput.trim()) processRemainingBarcode(remainingBarcodeInput.trim()) }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>Scan</button>
                          <button onClick={() => { setRemainingScanMode(null); setRemainingBarcodeInput('') }} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {remainingScanData && (() => {
          const material = remainingScanData.material || remainingScanData.responsePayload || {}
          const thickness = getMaterialThickness(material)
          const size = getMaterialSize(material)

          return (
            <div className={`mt-3 p-3 rounded-lg text-xs ${theme === 'dark' ? 'bg-white/10' : 'bg-white/50'}`}>
              <h6 className={`font-medium mb-2 ${cls.text}`}>Material Details:</h6>
              <div className="grid grid-cols-2 gap-2">
                <div><span className={cls.label}>Product:</span><p className={`font-medium ${cls.text}`}>{material?.ProductName || material?.Product || 'N/A'}</p></div>
                <div><span className={cls.label}>Color:</span><p className={`font-medium ${cls.text}`}>{material?.ProductColor || material?.Color || 'N/A'}</p></div>
                <div><span className={cls.label}>Thickness:</span><p className={`font-medium ${cls.text}`}>{thickness || 'N/A'}mm</p></div>
                <div><span className={cls.label}>Size:</span><p className={`font-medium ${cls.text}`}>{size.length || 'N/A'} x {size.width || 'N/A'}mm</p></div>
              </div>
            </div>
          )
        })()}
              </div>

              {(remainingDimStrings.length > 0 || remainingCutPlanData?.remainders?.length > 0) && (
                <div className={`mb-4 ${cls.card}`}>
                  {remainingDimStrings.length > 0 && (
                    <>
                      <label className={`block text-sm font-medium mb-3 ${cls.text}`}>Select Remainders for Barcode (Optional)</label>
                      <div className="space-y-2 mb-3">
                        {remainingDimStrings.map((ds, idx) => {
                          const display = simplifyDimensionString(ds)
                          const isChecked = selectedRemainingRemainders.includes(ds)
                          return (
                            <label key={idx} className={cls.checkboxRow(isChecked)}>
                              <input type="checkbox" checked={isChecked} onChange={() => setSelectedRemainingRemainders(isChecked ? selectedRemainingRemainders.filter(s => s !== ds) : [...selectedRemainingRemainders, ds])} className="w-4 h-4 rounded flex-shrink-0" />
                              <span className={`font-medium text-sm break-all ${cls.text}`}>{display}</span>
                            </label>
                          )
                        })}
                      </div>
                    </>
                  )}
                  <label className={`block text-xs font-medium mb-2 ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}>Custom Remainders (Optional)</label>
                  <div className="space-y-2">
                    {customRemainingInputs.map((val, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input type="text" value={val} onChange={(e) => { const u = [...customRemainingInputs]; u[idx] = e.target.value; setCustomRemainingInputs(u) }} placeholder="e.g., 1220x2440" className={`flex-1 px-3 py-2 border rounded-lg text-sm ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`} />
                        <button type="button" onClick={() => setCustomRemainingInputs([...customRemainingInputs, ''])} className={`px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20' : 'bg-white/50 border border-gray-300 text-gray-700 hover:bg-white/70'}`}>+</button>
                        {idx > 0 && <button type="button" onClick={() => { const u = customRemainingInputs.filter((_, i) => i !== idx); setCustomRemainingInputs(u.length > 0 ? u : ['']) }} className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10">x</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {remainingDimStrings.length === 0 && (remainingCutPlanData?.remainders?.length === 0 || !remainingCutPlanData?.remainders) && (
                <div className={`mb-4 ${cls.card}`}>
                  <label className={`block text-xs font-medium mb-2 ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}>Custom Remainders (Optional)</label>
                  <div className="space-y-2">
                    {customRemainingInputs.map((val, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input type="text" value={val} onChange={(e) => { const u = [...customRemainingInputs]; u[idx] = e.target.value; setCustomRemainingInputs(u) }} placeholder="e.g., 1220x2440" className={`flex-1 px-3 py-2 border rounded-lg text-sm ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`} />
                        <button type="button" onClick={() => setCustomRemainingInputs([...customRemainingInputs, ''])} className={`px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20' : 'bg-white/50 border border-gray-300 text-gray-700 hover:bg-white/70'}`}>+</button>
                        {idx > 0 && <button type="button" onClick={() => { const u = customRemainingInputs.filter((_, i) => i !== idx); setCustomRemainingInputs(u.length > 0 ? u : ['']) }} className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10">x</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {remainingPdfUrl && (
                <div className={`mb-4 p-3 rounded-xl ${theme === 'dark' ? 'bg-green-500/20 border border-green-500/30' : 'bg-green-50 border border-green-300'}`}>
                  <p className={`text-center text-sm font-medium mb-2 ${theme === 'dark' ? 'text-green-200' : 'text-green-700'}`}>Barcode generated</p>
                  <button onClick={() => window.open(remainingPdfUrl, '_blank')} className="w-full text-white py-2 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700"><Download className="w-4 h-4" /> Download/Print PDF</button>
                </div>
              )}

              {!showRemainingBarcodeForm
                ? <button onClick={() => setShowRemainingBarcodeForm(true)} className={cls.btnPrimary}><CheckSquare className="w-4 h-4" />Approve Cut Line & Generate Barcode</button>
                : renderBarcodeForm(remainingFormData, setRemainingFormData, handleRemainingBarcodeSubmit, generatingRemainingBarcode, () => { setShowRemainingBarcodeForm(false); setRemainingFormData({ rack: '', location: '' }) })
              }

              <button onClick={handleRevisualizeRemainingCutPlan} disabled={remainingCutPlanLoading} className={`w-full mt-3 disabled:opacity-50 ${cls.btnSecondary}`}>
                {remainingCutPlanLoading ? <><LoadingSpinner size="sm" />Revisualizing...</> : <><RefreshCw className="w-4 h-4" />Revisualize</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== REGULAR CUTPLAN RESULTS (full sheets) ===== */}
      {cutplans.length > 0 && !showRemnantSvgs && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className={`font-semibold ${cls.text}`}>Cutplan Results ({cutplans.length} sheets)</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 mr-4">
                <button onClick={handleZoomOut} className={`p-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>-</button>
                <span className={`px-2 text-sm ${cls.text}`}>{Math.round(zoomLevel * 100)}%</span>
                <button onClick={handleZoomIn} className={`p-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>+</button>
                <button onClick={handleResetZoom} className={`px-2 py-1 rounded-lg text-xs font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>Reset</button>
              </div>
              <div className="flex items-center gap-1 mr-4">
                <button onClick={handleRotateLeft} className={`p-2 rounded-lg font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>&#8634;</button>
                <span className={`px-2 text-sm ${cls.text}`}>{rotationAngle}&deg;</span>
                <button onClick={handleRotateRight} className={`p-2 rounded-lg font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>&#8635;</button>
                <button onClick={handleResetRotation} className={`px-2 py-1 rounded-lg text-xs font-medium ${theme === 'dark' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-400 hover:bg-gray-500 text-white'}`}>Reset</button>
              </div>
              <button onClick={handleDownloadAll} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}><Download className="w-4 h-4" />Download All SVGs</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cutplans.map((sheet, index) => (
              <div key={index} className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-white/5 border-white/20' : 'bg-white/50 border-gray-300'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h5 className={`font-medium ${cls.text}`}>Sheet {sheet.sheetNumber}</h5>
                  <div className={`text-sm ${cls.subtext}`}>{webhookResponse?.totalPanelsRequested ? `Efficiency: ${Math.round(((webhookResponse.totalPanelsPlaced || 0) / webhookResponse.totalPanelsRequested) * 100)}%` : ''}</div>
                </div>
                <div className="w-full overflow-auto border rounded" style={{ maxHeight: '400px' }}>
                  <div style={{ transform: `scale(${zoomLevel}) rotate(${rotationAngle}deg)`, transformOrigin: 'center center', transition: 'transform 0.2s ease' }} dangerouslySetInnerHTML={{ __html: sheet.svg }} className="w-full h-full flex items-center justify-center" />
                </div>
                <div className={`mt-3 text-xs ${cls.subtext}`}>Stock: {sheet.stockSheet}{sheet.placedParts ? ` | Parts: ${sheet.placedParts}` : ''}</div>
                <div className="mt-4">
                  <button onClick={() => handleScanBarcode(`sheet-${index + 1}`)} className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}>Scan Barcode</button>
                </div>
                {renderScanBarcodeModal(index)}
                {barcodeScanData[`sheet-${index + 1}`] && (() => {
                const scanObj = barcodeScanData[`sheet-${index + 1}`]
                const material = scanObj.material || scanObj.responsePayload || {}
                const thickness = getMaterialThickness(material)
                const size = getMaterialSize(material)

                return (
                  <div className={`mt-3 p-3 rounded-lg text-xs ${theme === 'dark' ? 'bg-white/10' : 'bg-white/50'}`}>
                    <h6 className={`font-medium mb-2 ${cls.text}`}>Material Details:</h6>
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className={cls.label}>Product:</span><p className={`font-medium ${cls.text}`}>{material?.ProductName || material?.Product || 'N/A'}</p></div>
                      <div><span className={cls.label}>Color:</span><p className={`font-medium ${cls.text}`}>{material?.ProductColor || material?.Color || 'N/A'}</p></div>
                      <div><span className={cls.label}>Thickness:</span><p className={`font-medium ${cls.text}`}>{thickness || 'N/A'}mm</p></div>
                      <div><span className={cls.label}>Size:</span><p className={`font-medium ${cls.text}`}>{size.length || 'N/A'} x {size.width || 'N/A'}mm</p></div>
                    </div>
                  </div>
                )
              })()}
              </div>
            ))}
          </div>

          {webhookResponse && (
            <div className={`mt-6 p-4 rounded-lg border ${theme === 'dark' ? 'bg-white/5 border-white/20' : 'bg-white/50 border-gray-300'}`}>
              <h4 className={`font-medium mb-4 ${cls.text}`}>Cutting Statistics</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {[
                  { label: 'Total Requested', value: webhookResponse.totalPanelsRequested || 0, color: cls.text },
                  { label: 'Total Placed', value: webhookResponse.totalPanelsPlaced || 0, color: 'text-green-500' },
                  { label: 'Unplaced', value: webhookResponse.totalPanelsUnplaced || 0, color: 'text-red-500' },
                  { label: 'Sheets Used', value: webhookResponse.sheetsUsed || 0, color: cls.text },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-white/10' : 'bg-white/60'}`}>
                    <div className={`text-xs ${cls.label}`}>{label}</div>
                    <div className={`text-lg font-semibold ${color}`}>{value}</div>
                  </div>
                ))}
              </div>

              {apiQuantityTracking && Object.keys(apiQuantityTracking).length > 0 && (
                <div className={`overflow-hidden rounded-lg border ${theme === 'dark' ? 'border-white/10' : 'border-gray-200'}`}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={`${theme === 'dark' ? 'bg-white/10' : 'bg-gray-100'}`}>
                        <th className={`text-left px-3 py-2 font-semibold ${cls.text}`}>Size (mm)</th>
                        <th className={`text-center px-3 py-2 font-semibold ${cls.text}`}>Requested</th>
                        <th className="text-center px-3 py-2 font-semibold text-green-500">Placed</th>
                        <th className="text-center px-3 py-2 font-semibold text-red-500">Unplaced</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(apiQuantityTracking).map(([size, v], i) => (
                        <tr key={i} className={`border-t ${theme === 'dark' ? 'border-white/5' : 'border-gray-100'} ${v.remaining > 0 ? (theme === 'dark' ? 'bg-red-500/5' : 'bg-red-50/50') : ''}`}>
                          <td className={`px-3 py-2 font-medium ${cls.text}`}>{size}</td>
                          <td className={`text-center px-3 py-2 ${cls.subtext}`}>{v.requested}</td>
                          <td className="text-center px-3 py-2 text-green-500 font-medium">{v.placed}</td>
                          <td className={`text-center px-3 py-2 font-medium ${v.remaining > 0 ? 'text-red-500' : cls.subtext}`}>{v.remaining}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {(fullSheetDimStrings.length > 0 || preservedFullSheetData?.remainders?.length > 0) && (
            <div className={`mt-4 ${cls.card}`}>
              <label className={`block text-sm font-medium mb-3 ${cls.text}`}>Select Remainders for Barcode (Optional)</label>
              {fullSheetDimStrings.length > 0 && (
                <div className="space-y-2 mb-3">
                  {fullSheetDimStrings.map((ds, idx) => {
                    const display = simplifyDimensionString(ds)
                    const isChecked = selectedFullSheetRemainders.includes(ds)
                    return (
                      <label key={idx} className={cls.checkboxRow(isChecked)}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setSelectedFullSheetRemainders(isChecked ? selectedFullSheetRemainders.filter(s => s !== ds) : [...selectedFullSheetRemainders, ds])}
                          className="w-4 h-4 rounded flex-shrink-0"
                        />
                        <span className={`font-medium text-sm break-all ${cls.text}`}>{display}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {preservedFullSheetData?.remainders?.length > 0 && fullSheetDimStrings.length === 0 && (
                <div className="space-y-2 mb-3">
                  {preservedFullSheetData.remainders.map((r: any, idx: number) => {
                    const displayDim = r.dimensions || r.label || ''
                    if (!displayDim) return null
                    const isChecked = selectedFullSheetRemainders.includes(displayDim)
                    return (
                      <label key={idx} className={cls.checkboxRow(isChecked)}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setSelectedFullSheetRemainders(isChecked ? selectedFullSheetRemainders.filter(s => s !== displayDim) : [...selectedFullSheetRemainders, displayDim])}
                          className="w-4 h-4 rounded flex-shrink-0"
                        />
                        <span className={`font-medium text-sm break-all ${cls.text}`}>{displayDim}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              <label className={`block text-xs font-medium mb-2 ${theme === 'dark' ? 'text-white/60' : 'text-gray-600'}`}>Custom Remainders (Optional)</label>
              <div className="space-y-2">
                {customFullSheetInputs.map((val, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input type="text" value={val} onChange={(e) => { const u = [...customFullSheetInputs]; u[idx] = e.target.value; setCustomFullSheetInputs(u) }} placeholder="e.g., 1220x2440" className={`flex-1 px-3 py-2 border rounded-lg text-sm ${theme === 'dark' ? 'bg-white/10 border-white/20 text-white placeholder-white/40' : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-400'}`} />
                    <button type="button" onClick={() => setCustomFullSheetInputs([...customFullSheetInputs, ''])} className={`px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20' : 'bg-white/50 border border-gray-300 text-gray-700 hover:bg-white/70'}`}>+</button>
                    {idx > 0 && <button type="button" onClick={() => { const u = customFullSheetInputs.filter((_, i) => i !== idx); setCustomFullSheetInputs(u.length > 0 ? u : ['']) }} className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-500/10">x</button>}
                  </div>
                ))}
              </div>
              <p className={`text-xs mt-2 ${theme === 'dark' ? 'text-white/40' : 'text-gray-500'}`}>Leave all unchecked to send all remainders, or select specific ones</p>
            </div>
          )}

          {fullSheetPdfUrl && (
            <div className={`mt-4 p-3 rounded-xl ${theme === 'dark' ? 'bg-green-500/20 border border-green-500/30' : 'bg-green-50 border border-green-300'}`}>
              <p className={`text-center text-sm font-medium mb-2 ${theme === 'dark' ? 'text-green-200' : 'text-green-700'}`}>Barcode generated</p>
              <button onClick={() => window.open(fullSheetPdfUrl, '_blank')} className="w-full text-white py-2 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700"><Download className="w-4 h-4" /> Download/Print PDF</button>
            </div>
          )}

          {showFullSheetBarcodeForm && (
            <div className="mt-4">
              {renderBarcodeForm(fullSheetFormData, setFullSheetFormData, handleFullSheetBarcodeSubmit, generatingFullSheetBarcode, () => { setShowFullSheetBarcodeForm(false); setFullSheetFormData({ rack: '', location: '' }) })}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
            <button onClick={handleRevisualizeFullSheet} disabled={loading} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'} ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}>
              {loading ? <><LoadingSpinner size="sm" />Revisualizing...</> : <><RefreshCw className="w-4 h-4" />Revisualize</>}
            </button>
            {!showFullSheetBarcodeForm && (
              <button onClick={handleApprove} disabled={approvingSheet === 'cutplan-approval' && showFullSheetBarcodeForm} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all hover:scale-105 active:scale-95 ${theme === 'dark' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>
                <CheckSquare className="w-4 h-4" />Approve Cutplan & Generate Barcode
              </button>
            )}
          </div>
        </div>
      )}

      {cutplans.length === 0 && !loading && !showRemnantSvgs && (
        <div className={`p-6 rounded-lg border-2 border-dashed ${theme === 'dark' ? 'border-white/20 bg-white/5' : 'border-gray-300 bg-gray-50'}`}>
          <div className="w-full h-48 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: mockSvg }} />
        </div>
      )}
    </div>
  )
}