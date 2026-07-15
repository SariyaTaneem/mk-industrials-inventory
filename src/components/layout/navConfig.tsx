import {
  LayoutDashboard,
  Package,
  QrCode,
  Scissors,
  ChartBar as BarChart3,
  DollarSign,
  Bell,
  Boxes,
  Sparkles,
  Settings as SettingsIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: typeof LayoutDashboard
  ownerOnly?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

// Ungrouped items, shown right under the workspace switcher — mirrors
// BoxHero's top-level Item List / Stock In / Stock Out block.
export const topNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Cut Pieces', path: '/cut-pieces', icon: Scissors },
  { label: 'Visualizer', path: '/visualizer', icon: BarChart3 },
]

// Grouped sections — labels mirror BoxHero's exact group names; the items
// underneath are mapped to whatever this app actually does today.
export const navGroups: NavGroup[] = [
  {
    label: 'Barcode Labels',
    items: [
      { label: 'Generate Barcode', path: '/stock-in', icon: Package },
      { label: 'Scan Barcode', path: '/items', icon: QrCode },
    ],
  },
  {
    label: 'Purchases & Sales',
    items: [
      { label: 'Pending Approvals', path: '/owner/approvals', icon: DollarSign, ownerOnly: true },
      { label: 'Price Alerts', path: '/owner/alerts', icon: Bell, ownerOnly: true },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Inventory Overview', path: '/owner/inventory', icon: Boxes, ownerOnly: true },
      { label: 'Remnants', path: '/owner/remnants', icon: Package, ownerOnly: true },
    ],
  },
  {
    label: 'Other Features',
    items: [
      { label: 'AI Assistant', path: '/owner/ai', icon: Sparkles, ownerOnly: true },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Account', path: '/settings', icon: SettingsIcon },
    ],
  },
]
