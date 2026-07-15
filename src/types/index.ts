export interface InventoryItem {
  InventoryID: string
  ProductName: string
  ProductColor: string
  Form: string
  Thickness_mm?: number
  Length_mm?: number
  Width_mm?: number
  Diameter_mm?: number
  Area_mm2?: number
  SheetsQty?: number
  RemainingArea_mm2?: number
  PurchaseDate: string
  PurchasePricePerSheet?: number
  PurchasePriceEnteredBy?: string
  Rack: string
  Status: string
  BarcodeID: string
  CreatedBy: string
  CreatedDate: string
  NeedsPrice: boolean
  isSold?: boolean
  rawDimensionString?: string
}

export interface Remnant {
  RemnantID: string
  ParentInventoryID: string
  ProductName: string
  Thickness_mm: number
  Length_mm: number
  Width_mm: number
  Area_mm2: number
  BarcodeID: string
  Rack: string
  Status: string
  VisualLink?: string
  EstimatedValue?: number
  CreatedDate: string
}

export interface CutOrder {
  CutOrderID: string
  CreatedBy: string
  Material: string
  Thickness_mm: number
  DimensionString: string
  ParsedPiecesJSON: string
  Quantity: number
  AssignedCandidateIDs: string
  CutPlanLink?: string
  Status: string
  CreatedDate: string
}

export interface CutPlanCandidate {
  id: string
  type: 'remnant' | 'sheet'
  rack: string
  barcodeId: string
  maxFittableQty: number
  matchScore: number
  estimatedRemainingAfterCut: number
  visualLink?: string
}