// Use environment variables for webhook URLs
const SCAN_BARCODE_URL = import.meta.env.VITE_N8N_SCAN_BARCODE_WEBHOOK_URL || 'https://n8n.mkindustrials.com/webhook/scan-barcode';
const ADD_INVENTORY_URL = import.meta.env.VITE_N8N_ADD_INVENTORY_WEBHOOK_URL || 'https://n8n.mkindustrials.com/webhook/add-inventory';
const MARK_SOLD_URL = import.meta.env.VITE_N8N_MARK_SOLD_WEBHOOK_URL || 'https://n8n.mkindustrials.com/webhook/mark-sold';
const CUT_PIECES_URL = import.meta.env.VITE_N8N_CUT_PIECES_WEBHOOK_URL || 'https://n8n.mkindustrials.com/webhook/generate-cut-match';
const UPLOAD_IMAGE_URL = import.meta.env.VITE_N8N_UPLOAD_IMAGE_WEBHOOK_URL || 'https://n8n.mkindustrials.com/webhook/upload-image';
const CHANGE_RACK_URL = import.meta.env.VITE_N8N_CHANGE_RACK_WEBHOOK_URL || 'https://n8n.mkindustrials.com/webhook/change-rack';

// Helper function to extract data from API response
const extractData = (response: any) => {
  if (response?.data) {
    return response.data;
  }
  if (Array.isArray(response) && response.length > 0) {
    return response[0];
  }
  return response;
};

// Helper function to infer form fields from data
const inferFormFields = (data: any) => {
  const fields: any = {};
  
  if (data) {
    // Map common field variations
    fields.description = data.Description || data.description || '';
    fields.category = data.Category || data.category || '';
    fields.subcategory = data.Subcategory || data.subcategory || '';
    fields.brand = data.Brand || data.brand || '';
    fields.model = data.Model || data.model || '';
    fields.color = data.Color || data.color || '';
    fields.condition = data.Condition || data.condition || '';
    fields.location = data.Location || data.location || '';
    fields.notes = data.Notes || data.notes || '';
    fields.price = data.Price || data.price || '';
    
    // Parse dimensions if available
    const dimensions = parseDimensions(data);
    if (dimensions) {
      fields.length = dimensions.length;
      fields.width = dimensions.width;
      fields.height = dimensions.height;
    }
    
    // Parse thickness/diameter
    const thicknessDiameter = parseThicknessDiameter(data);
    if (thicknessDiameter) {
      fields.thickness = thicknessDiameter.thickness;
      fields.diameter = thicknessDiameter.diameter;
    }
  }
  
  return fields;
};

// Helper function to parse dimensions from various field formats
const parseDimensions = (data: any) => {
  const dimensionFields = [
    'Dimensions', 'dimensions', 'Size', 'size',
    'Length_Width_Height', 'LengthWidthHeight'
  ];
  
  for (const field of dimensionFields) {
    if (data[field]) {
      const match = data[field].match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
      if (match) {
        return {
          length: match[1],
          width: match[2],
          height: match[3]
        };
      }
    }
  }
  
  // Check individual dimension fields
  return {
    length: data.Length || data.length || '',
    width: data.Width || data.width || '',
    height: data.Height || data.height || ''
  };
};

// Helper function to parse thickness/diameter
const parseThicknessDiameter = (data: any) => {
  return {
    thickness: data.Thickness || data.thickness || '',
    diameter: data.Diameter || data.diameter || ''
  };
};

export const api = {
  async getItemByBarcode(barcode: string) {
    try {
      const response = await fetch(SCAN_BARCODE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ BarcodeID: barcode }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Check if the backend returned an array with success: false
      if (Array.isArray(data) && data.length > 0 && data[0].success === false) {
        return {
          success: false,
          error: data[0].error || data[0].message || 'Material not found',
          data: data[0]
        };
      }

      // Check if single object with success: false
      if (data && typeof data === 'object' && !Array.isArray(data) && data.success === false) {
        return {
          success: false,
          error: data.error || data.message || 'Material not found',
          data: data
        };
      }

      // Check for empty array or null/undefined data
      if (Array.isArray(data) && data.length === 0) {
        return {
          success: false,
          error: 'Material not found',
          data: null
        };
      }

      const extractedData = extractData(data);

      // Check if extracted data indicates no material found
      if (!extractedData || (extractedData.success === false)) {
        return {
          success: false,
          error: extractedData?.error || extractedData?.message || 'Material not found',
          data: extractedData
        };
      }

      return {
        success: true,
        data: extractedData,
        formFields: inferFormFields(extractedData)
      };
    } catch (error) {
      console.error('Error fetching item by barcode:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async updateScan(scanData: any) {
    try {
      const response = await fetch(ADD_INVENTORY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scanData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error updating scan:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async generateCutMatch(cutData: any) {
    try {
      const response = await fetch(CUT_PIECES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cutData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('🔍 RAW API RESPONSE:', JSON.stringify(data, null, 2));

      const rawItems = Array.isArray(data) ? data : [data];
      const firstItem = rawItems[0];

      if (firstItem?.success && firstItem?.remnants && firstItem?.remnantCount) {
        console.log('🎯 Remnant response detected, passing through directly');
        return {
          success: true,
          data: firstItem,
          isRemnantResponse: true
        };
      }

      if (firstItem?.remnants || firstItem?.svg) {
        console.log('🎯 Direct SVG/remnant response detected');
        return {
          success: true,
          data: firstItem,
          isRemnantResponse: !!firstItem.remnants
        };
      }

      const candidates = rawItems.map((result: any) => ({
        id: crypto.randomUUID(),
        type: (result.sourceType === 'full-sheet' || result.source === 'New Full Sheet') ? 'sheet' as const : 'remnant' as const,
        rack: cutData.Rack || 'Unknown',
        barcodeId: '',
        maxFittableQty: result.cutPlan?.placedParts || result.cutPlan?.totalRequested || 0,
        matchScore: (result.cutPlan?.efficiency || 0) / 100,
        estimatedRemainingAfterCut: result.remnant?.area || result.remnant?.width * result.remnant?.height || 0,
        visualLink: undefined,
        cutPlanSvg: result.cutPlan?.svg || result.svg || null,
        message: result.message || null,
        dimensionString: result.dimensionString || '',
        remainders: result.remainders || [],
        sourceBarcodeId: result.sourceBarcodeId || result.sheetInfo?.barcode || ''
      }));

      return {
        success: true,
        data: { candidates },
        candidates
      };
    } catch (error) {
      console.error('Error generating cut match:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async addInventory(inventoryData: any) {
    try {
      const response = await fetch(ADD_INVENTORY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inventoryData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error adding inventory:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  // Owner portal methods
  async markAsSold(soldData: any) {
    try {
      console.log('Sending mark as sold request:', soldData)
      
      const payload = {
        BarcodeID: soldData.barcodeId,
        SoldTo: soldData.soldTo,
        SoldPrice: soldData.soldPrice,
        SoldDate: soldData.soldDate,
        Notes: soldData.notes
      }
      
      console.log('Mark as sold payload:', payload)
      
      const response = await fetch(MARK_SOLD_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('Mark as sold response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Mark as sold error response:', errorText)
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Mark as sold response data:', data)
      
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error marking item as sold:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async uploadImage(imageFile: File, barcodeId: string) {
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('BarcodeID', barcodeId);

      const response = await fetch(UPLOAD_IMAGE_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error uploading image:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async changeRackPosition(barcodeId: string, newRack: string) {
    try {
      console.log('Sending change rack request:', { barcodeId, newRack });
      
      // Determine location based on BarcodeID prefix
      let location = "Warehouse"; // default
      if (barcodeId.includes("BC-O-")) {
        location = "Office";
      } else if (barcodeId.includes("BC-G-")) {
        location = "Godown";
      } else if (barcodeId.includes("BC-W-")) {
        location = "Warehouse";
      }
      
      const payload = {
        BarcodeID: barcodeId,
        NewRack: newRack,
        Location: location
      }
      
      console.log('Change rack payload:', payload);
      
      const response = await fetch(CHANGE_RACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('Change rack response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Change rack error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Change rack response data:', data);
      
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error changing rack position:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async changeRackAndDate(barcodeId: string, newRack?: string, purchaseDate?: string) {
    try {
      console.log('Sending change rack/date request:', { barcodeId, newRack, purchaseDate });
      
      // Determine location based on BarcodeID prefix
      let location = "Warehouse"; // default
      if (barcodeId.includes("BC-O-")) {
        location = "Office";
      } else if (barcodeId.includes("BC-G-")) {
        location = "Godown";
      } else if (barcodeId.includes("BC-W-")) {
        location = "Warehouse";
      }
      
      const payload = {
        BarcodeID: barcodeId,
        Location: location
      }
      
      // Only add fields that are provided
      if (newRack && newRack.trim()) {
        payload.NewRack = newRack.trim();
      }
      
      if (purchaseDate && purchaseDate.trim()) {
        payload.PurchaseDate = purchaseDate.trim();
      }
      
      console.log('Change rack/date payload:', payload);
      
      const response = await fetch(CHANGE_RACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      console.log('Change rack/date response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Change rack/date error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Change rack/date response data:', data);
      
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error changing rack/date:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  // Owner Portal methods
  async getOwnerSummary() {
    try {
      const response = await fetch(OWNER_SUMMARY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error fetching owner summary:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async getOwnerInventory(page = 1, pageSize = 12, search = '', form = '') {
    try {
      const response = await fetch(OWNER_INVENTORY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page, pageSize, search, form }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error fetching owner inventory:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async getOwnerAlerts() {
    try {
      const response = await fetch(OWNER_ALERTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error fetching owner alerts:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async getOwnerApprovals() {
    try {
      const response = await fetch(OWNER_APPROVALS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error fetching owner approvals:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async setOwnerPrice(inventoryId: string, purchasePricePerSheet: number) {
    try {
      const response = await fetch(OWNER_SET_PRICE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inventoryId, purchasePricePerSheet }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error setting owner price:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async approveOwnerCutplan(cutOrderId: string, approve: boolean) {
    try {
      const response = await fetch(OWNER_APPROVE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cutOrderId, approve }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error approving owner cutplan:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  },

  async queryAI(prompt: string) {
    try {
      const response = await fetch(AI_QUERY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: extractData(data)
      };
    } catch (error) {
      console.error('Error querying AI:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
};