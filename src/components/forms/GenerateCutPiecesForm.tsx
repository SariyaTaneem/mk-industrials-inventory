import React, { useState, useRef } from 'react'
import { ArrowLeft, Upload, Image, Ruler, Hash, MapPin, FileText, Eye, RefreshCw, Download, Printer } from 'lucide-react'
import { LoadingSpinner } from '../LoadingSpinner'
import { Theme } from '../../hooks/useTheme'

interface GenerateCutPiecesFormProps {
  onBack: () => void
  theme: Theme
}

export function GenerateCutPiecesForm({ onBack, theme }: GenerateCutPiecesFormProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    material: '',
    thickness: '',
    dimensionString: '',
    quantity: '1',
    rack: '',
    location: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  })
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [svgData, setSvgData] = useState<string>('')
  const [svgZoom, setSvgZoom] = useState(100)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null)
  const [showBarcodeSuccess, setShowBarcodeSuccess] = useState(false)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedImage(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveImage = () => {
    setUploadedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const formDataPayload = new FormData()
      formDataPayload.append('Material', formData.material)
      formDataPayload.append('Thickness_mm', formData.thickness)
      formDataPayload.append('DimensionString', formData.dimensionString)
      formDataPayload.append('Quantity', formData.quantity)
      formDataPayload.append('Rack', formData.rack)
      formDataPayload.append('Location', formData.location)
      formDataPayload.append('Notes', formData.notes)
      formDataPayload.append('CreatedBy', 'employee')
      formDataPayload.append('Date', formData.date)

      if (uploadedImage) {
        formDataPayload.append('image', uploadedImage)
      }

      console.log('🔄 Sending request to webhook/remnant-svg')

      const response = await fetch('https://n8n.mkindustrials.com/webhook/remnant-svg', {
        method: 'POST',
        body: formDataPayload
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Parsed JSON response')
      console.log('📦 Response:', JSON.stringify(data, null, 2))

      const responses = Array.isArray(data) ? data : [data]
      const firstResponse = responses[0]

      if (!firstResponse || !firstResponse.svg) {
        throw new Error('No SVG data in response')
      }

      let extractedSvg = firstResponse.svg

      // If escaped quotes, unescape them
      if (typeof extractedSvg === 'string' && extractedSvg.includes('\\"')) {
        extractedSvg = extractedSvg.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      }

      // Validate SVG has actual content (not placeholder)
      if (!extractedSvg.includes('<') || !extractedSvg.includes('>') || extractedSvg.includes('...</svg>')) {
        console.error('❌ SVG is truncated or placeholder:', extractedSvg.substring(0, 200))
        throw new Error('Webhook returned incomplete SVG - try again')
      }

      // Ensure SVG starts with proper tag
      if (!extractedSvg.trim().startsWith('<svg')) {
        throw new Error('Invalid SVG format')
      }

      setSvgData(extractedSvg)
      setShowResults(true)

    } catch (error) {
      console.error('❌ Error:', error)
      alert(`Failed: ${error instanceof Error ? error.message : String(error)}`)
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
    a.download = `remnant-shape-${Date.now()}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleRevisualize = async () => {
    setLoading(true)

    try {
      const formDataPayload = new FormData()
      formDataPayload.append('Material', formData.material)
      formDataPayload.append('Thickness_mm', formData.thickness)
      formDataPayload.append('DimensionString', formData.dimensionString)
      formDataPayload.append('Quantity', formData.quantity)
      formDataPayload.append('Rack', formData.rack)
      formDataPayload.append('Location', formData.location)
      formDataPayload.append('Notes', formData.notes)
      formDataPayload.append('CreatedBy', 'employee')
      formDataPayload.append('Date', formData.date)
      formDataPayload.append('strategy', 'random')

      if (uploadedImage) {
        formDataPayload.append('image', uploadedImage)
      }

      console.log('🔄 Revisualize: Sending request with strategy: random')

      const response = await fetch('https://n8n.mkindustrials.com/webhook/remnant-svg', {
        method: 'POST',
        body: formDataPayload
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const responses = Array.isArray(data) ? data : [data]
      const firstResponse = responses[0]

      if (!firstResponse || !firstResponse.svg) {
        throw new Error('No SVG data in response')
      }

      let extractedSvg = firstResponse.svg

      if (typeof extractedSvg === 'string' && extractedSvg.includes('\\"')) {
        extractedSvg = extractedSvg.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      }

      if (!extractedSvg.includes('<') || !extractedSvg.includes('>') || extractedSvg.includes('...</svg>')) {
        throw new Error('Webhook returned incomplete SVG - try again')
      }

      if (!extractedSvg.trim().startsWith('<svg')) {
        throw new Error('Invalid SVG format')
      }

      setSvgData(extractedSvg)

    } catch (error) {
      console.error('❌ Revisualize Error:', error)
      alert(`Failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleApproveAndGenerateBarcode = async () => {
    if (!svgData) {
      alert('No SVG data available')
      return
    }

    setLoading(true)

    try {
      const payload = {
        svg: svgData,
        Material: formData.material,
        Thickness_mm: formData.thickness,
        DimensionString: formData.dimensionString,
        Quantity: formData.quantity,
        Rack: formData.rack,
        Location: formData.location,
        Notes: formData.notes,
        CreatedBy: 'employee',
        Date: formData.date,
        IsRemnantGeneration: false
      }

      console.log('🚀 Sending to generate-barcode webhook:', payload)

      const response = await fetch('https://n8n.mkindustrials.com/webhook/generate-barcode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const responseData = await response.json()
      console.log('Barcode generation response:', responseData)

      const data = Array.isArray(responseData) ? responseData[0] : responseData

      if (data.success === 'true' || data.success === true) {
        const pdfUrl = data.labelLink || data.pdfLink || data.pdf_link || data.pdfUrl
        if (pdfUrl) {
          setGeneratedPdfUrl(pdfUrl)
          setShowBarcodeSuccess(true)
        } else {
          alert('Barcode generated but no label link received')
        }
      } else {
        alert('Barcode generated but response indicates failure')
      }

    } catch (error) {
      console.error('❌ Generate Barcode Error:', error)
      alert(`Failed to generate barcode: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  // Barcode Success View - Show PDF Link
  if (showBarcodeSuccess && generatedPdfUrl) {
    return (
      <div className={`min-h-screen p-4 ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]'
          : 'bg-gradient-to-br from-blue-50 to-indigo-100'
      }`}>
        <div className="max-w-md mx-auto pt-8">
          <button
            onClick={() => {
              setShowBarcodeSuccess(false)
              setGeneratedPdfUrl(null)
              setSvgData('')
              setShowResults(false)
              setFormData({
                material: '',
                thickness: '',
                dimensionString: '',
                quantity: '1',
                rack: '',
                location: '',
                notes: '',
                date: new Date().toISOString().split('T')[0]
              })
              setUploadedImage(null)
              setImagePreview(null)
            }}
            className={`flex items-center gap-2 mb-6 transition-colors ${
              theme === 'dark'
                ? 'text-white/80 hover:text-white'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Form
          </button>

          <div className={`backdrop-blur-md rounded-2xl p-6 border ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <h2 className={`text-2xl font-bold mb-6 text-center ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              Barcode Generated Successfully
            </h2>
            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${
                theme === 'dark'
                  ? 'bg-green-500/20 border border-green-500/30'
                  : 'bg-green-50 border border-green-300'
              }`}>
                <p className={`text-center font-medium ${
                  theme === 'dark' ? 'text-green-200' : 'text-green-700'
                }`}>
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
                <Download className="w-4 h-4" /> Download/Print PDF
              </button>
              <button
                onClick={() => {
                  setShowBarcodeSuccess(false)
                  setGeneratedPdfUrl(null)
                  setSvgData('')
                  setShowResults(false)
                  setFormData({
                    material: '',
                    thickness: '',
                    dimensionString: '',
                    quantity: '1',
                    rack: '',
                    location: '',
                    notes: '',
                    date: new Date().toISOString().split('T')[0]
                  })
                  setUploadedImage(null)
                  setImagePreview(null)
                }}
                className={`w-full text-white py-3 rounded-xl font-medium hover:opacity-90 transition-opacity ${
                  theme === 'dark'
                    ? 'bg-white/10 border border-white/20 text-white'
                    : 'bg-white/50 border border-white/60 text-gray-800'
                }`}
              >
                Back to Form
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Results view - exactly like ScanBarcodeForm
  if (showResults && svgData) {
    return (
      <div className={`min-h-screen p-4 ${
        theme === 'dark'
          ? 'bg-gradient-to-br from-[#052635] to-[#010b2f]'
          : 'bg-gradient-to-br from-blue-50 to-indigo-100'
      }`}>
        <div className="max-w-md mx-auto pt-8">
          <button
            onClick={() => {
              setShowResults(false)
              setSvgData('')
            }}
            className={`flex items-center gap-2 mb-6 transition-colors ${
              theme === 'dark'
                ? 'text-white/80 hover:text-white'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Form
          </button>

          <div className={`backdrop-blur-md rounded-2xl p-6 border ${
            theme === 'dark'
              ? 'bg-white/10 border-white/20'
              : 'bg-white/40 border-white/50'
          }`}>
            <h2 className={`text-2xl font-bold mb-6 text-center ${
              theme === 'dark' ? 'text-white' : 'text-gray-800'
            }`}>
              Remnant Shape Visualization
            </h2>

            {/* Zoom Controls */}
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
                Download
              </button>
            </div>

            {/* SVG Display Container - Like InventoryVisualizer */}
            <div
              className="w-full overflow-auto border rounded mb-6"
              style={{
                maxHeight: '400px'
              }}
            >
              <div
                style={{
                  transform: `scale(${svgZoom / 100})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s ease'
                }}
                dangerouslySetInnerHTML={{ __html: svgData }}
                className="w-full h-full flex items-center justify-center"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleApproveAndGenerateBarcode}
                disabled={loading}
                className={`w-full text-white py-4 rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 ${
                  theme === 'dark'
                    ? 'bg-gradient-to-r from-green-600 to-green-700'
                    : 'bg-gradient-to-r from-green-600 to-green-700'
                }`}
              >
                {loading ? <LoadingSpinner size="sm" /> : <Eye className="w-4 h-4" />}
                {loading ? 'Generating...' : 'Approve Shape & Generate Barcode'}
              </button>

              <button
                onClick={handleRevisualize}
                disabled={loading}
                className={`w-full border py-4 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white hover:bg-white/15'
                    : 'bg-white/50 border-white/60 text-gray-800 hover:bg-white/60'
                }`}
              >
                {loading ? <LoadingSpinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
                {loading ? 'Revisualizing...' : 'Revisualize'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Form view
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
        }`} style={{
          backdropFilter: 'blur(12px)',
          boxShadow: theme === 'dark'
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
        }}>
          <h2 className={`text-2xl font-bold mb-6 text-center ${
            theme === 'dark' ? 'text-white' : 'text-gray-800'
          }`}>
            Generate Barcode for Cut Pieces
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`text-sm font-medium mb-2 block ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                Material
              </label>
              <input
                type="text"
                value={formData.material}
                onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
                placeholder="e.g., POM"
                required
              />
            </div>

            <div>
              <label className={`text-sm font-medium mb-2 block ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                Thickness (mm)
              </label>
              <input
                type="text"
                value={formData.thickness}
                onChange={(e) => setFormData({ ...formData, thickness: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
                placeholder="e.g., 5"
                required
              />
            </div>

            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                <Ruler className="w-4 h-4" />
                Dimension String
              </label>
              <input
                type="text"
                value={formData.dimensionString}
                onChange={(e) => setFormData({ ...formData, dimensionString: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
                placeholder="e.g., 155x110x1000x295x70x210x755x25"
                required
              />
              <p className={`text-xs mt-1 ${
                theme === 'dark' ? 'text-white/50' : 'text-gray-500'
              }`}>
                Enter dimensions separated by 'x' (will be paired as rectangles)
              </p>
            </div>

            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                <Hash className="w-4 h-4" />
                Quantity
              </label>
              <input
                type="text"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
                placeholder="e.g., 2"
                required
              />
            </div>

            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                <MapPin className="w-4 h-4" />
                Rack
              </label>
              <input
                type="text"
                value={formData.rack}
                onChange={(e) => setFormData({ ...formData, rack: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
                placeholder="e.g., B2"
                required
              />
            </div>

            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                <MapPin className="w-4 h-4" />
                Location
              </label>
              <select
                required
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
              >
                <option value="">Select location</option>
                <option value="Office">Office</option>
                <option value="Godown">Godown</option>
                <option value="Warehouse">Warehouse</option>
              </select>
            </div>

            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                <Image className="w-4 h-4" />
                Upload Image (Optional)
              </label>
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />

                {!imagePreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                      theme === 'dark'
                        ? 'border-white/30 hover:border-white/50'
                        : 'border-white/40 hover:border-white/60'
                    }`}
                  >
                    <Upload className={`w-8 h-8 mx-auto mb-2 ${
                      theme === 'dark' ? 'text-white/40' : 'text-gray-400'
                    }`} />
                    <p className={`text-sm ${
                      theme === 'dark' ? 'text-white/60' : 'text-gray-600'
                    }`}>Click to upload image</p>
                  </button>
                ) : (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Uploaded reference"
                      className="w-full rounded-xl border border-white/20"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs hover:bg-red-700 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                )}

                <div className={`border rounded-lg p-3 ${
                  theme === 'dark'
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-blue-500/10 border-blue-500/30'
                }`}>
                  <p className={`text-xs ${
                    theme === 'dark' ? 'text-blue-200' : 'text-blue-600'
                  }`}>
                    <strong>Tip:</strong> For accurate measurements, include a reference object (ruler or known-size card) or the sheet/barcode in the picture.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className={`flex items-center gap-2 text-sm font-medium mb-2 ${
                theme === 'dark' ? 'text-white/80' : 'text-gray-700'
              }`}>
                <FileText className="w-4 h-4" />
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 resize-none ${
                  theme === 'dark'
                    ? 'bg-white/10 border-white/20 text-white placeholder-white/50 focus:ring-white/30'
                    : 'bg-white/50 border-gray-300 text-gray-800 placeholder-gray-500 focus:ring-blue-300 focus:border-blue-400'
                }`}
                placeholder="Additional notes..."
                rows={2}
              />
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
              {loading ? 'Analyzing...' : 'Analyze The Remnant Shape'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
