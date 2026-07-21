// Modular Manual Content Registry
// Each section is mapped to a permission key and route.
// If permission is null, it is accessible to all authenticated users.

export const MANUAL_SECTIONS = [
  {
    id: 'overview',
    title: 'Portal Overview & Dashboard',
    icon: '📊',
    category: 'Overview',
    permission: null,
    route: '/',
    quickHelp: [
      'View real-time stock alerts, inventory health metrics, and active patient session counts.',
      'Use Quick Action buttons to jump directly to common clinical workflows.',
      'Check system notifications at top right for requisition and stock updates.'
    ],
    fullGuide: {
      overview: 'The Overview Dashboard serves as your clinical operational hub, summarizing real-time stock levels, warning alerts, and key clinic metrics.',
      steps: [
        'Log in with your clinical credentials to access your role-tailored dashboard.',
        'Review the Stock Warning Gauges to check for items below critical reorder thresholds.',
        'Use the top navigation bar to toggle between Spaced and Compact visual layouts.',
        'Click the Notification Bell in the top right header to view real-time alert updates.'
      ]
    }
  },
  {
    id: 'patients',
    title: 'Managing Patients & Schedules',
    icon: '🏥',
    category: 'Patient Care',
    permission: 'manage_patients',
    route: '/patients',
    quickHelp: [
      'Filter patients by Mon-Wed-Fri (MWF) or Tue-Thu-Sat (TTS) schedule cohorts.',
      'Click a patient row to view chart details and historical item requisitions.',
      'Use "💊 Dispense Supplies" inside the details drawer to quickly dispense items to that patient.'
    ],
    fullGuide: {
      overview: 'The Patient Database allows staff to maintain patient profiles, track dialysis schedules, and access historical supply usage per patient.',
      steps: [
        'Navigate to "Patients" from the sidebar menu.',
        'Filter the directory by Status (Active/Inactive) or Search by patient name or chart number.',
        'Click "+ Register Patient" to add a new patient with diagnosis and schedule details.',
        'Select any patient to open their detailed profile panel on the right.',
        'Click "💊 Dispense Supplies to [Patient]" inside the profile drawer to jump directly to item dispensing.'
      ]
    }
  },
  {
    id: 'dispense',
    title: 'Direct Item Dispensing',
    icon: '💊',
    category: 'Clinical Inventory & Dispensing',
    permission: 'dispense_item',
    route: '/dispense',
    quickHelp: [
      'Select an active patient and choose the dispensable item.',
      'Enter the quantity used for the treatment session and click "Log Dispense".',
      'Stock is deducted immediately and the Cashier is automatically notified for billing.'
    ],
    fullGuide: {
      overview: 'Direct Dispensing enables nurses and supply officers to record medical supplies used during treatment sessions, instantly updating inventory stock and notifying billing.',
      steps: [
        'Navigate to "Direct Dispense" from the sidebar menu.',
        'Select the active patient receiving supplies.',
        'Choose the medical consumable or medication from the item dropdown list.',
        'Enter the quantity dispensed and add optional clinical notes (e.g. post-procedure care).',
        'Click "💊 Log Dispense" to confirm. Stock is deducted and a billing entry is automatically created.'
      ]
    }
  },
  {
    id: 'returns',
    title: 'Item Returns to Inventory',
    icon: '🔄',
    category: 'Clinical Inventory & Dispensing',
    permission: 'return_item',
    route: '/returns',
    quickHelp: [
      'Return unused items from a dispense log or approved requisition back into inventory.',
      'Specify the return quantity and reason (e.g. unused session surplus).',
      'Returned items are restored to active inventory stock automatically.'
    ],
    fullGuide: {
      overview: 'The Item Returns module allows staff to return unused clinical consumables back into active inventory stock, reversing dispense or requisition deductions accurately.',
      steps: [
        'Navigate to "Return Item" or click "🔄 Return" on any dispense/requisition record.',
        'Verify the source record details (Patient name, Item name, original quantity).',
        'Enter the exact quantity being returned to stock.',
        'Provide a clear return reason for audit history.',
        'Click "Submit Return" to restore items back to inventory stock.'
      ]
    }
  },
  {
    id: 'requisitions_submit',
    title: 'Submitting Requisitions',
    icon: '📋',
    category: 'Requisitions & Deliveries',
    permission: 'submit_requisition',
    route: '/requisitions',
    quickHelp: [
      'Click "+ New Requisition" to request supplies for a patient treatment session.',
      'Add line items with required quantities and clinical reasons.',
      'Track requisition status (Pending, Approved, Rejected) from your forms dashboard.'
    ],
    fullGuide: {
      overview: 'Clinical Requisitions allow nurses to formally request medical supplies from the inventory store prior to treatment sessions.',
      steps: [
        'Navigate to "Requisitions" from the sidebar menu.',
        'Click "+ New Requisition" at top right.',
        'Select the target patient and treatment session date.',
        'Add one or more item lines, specifying requested quantities and justification reasons.',
        'Click "Submit Requisition". Inventory managers will be notified immediately for approval.'
      ]
    }
  },
  {
    id: 'requisitions_approve',
    title: 'Approving & Sign-Off on Requisitions',
    icon: '✅',
    category: 'Requisitions & Deliveries',
    permission: 'approve_requisition',
    route: '/requisitions',
    quickHelp: [
      'Review pending requisitions submitted by clinical staff.',
      'Click "✓ Approve" on individual line items or use "✅ Approve All Pending Lines" for 1-click sign-off.',
      'Ensure medication requests are co-verified before approval.'
    ],
    fullGuide: {
      overview: 'Inventory Managers and Top Admins review, approve, or reject item requests submitted by nurses, controlling stock allocation.',
      steps: [
        'Open "Requisitions" and select a pending requisition from the left list.',
        'Inspect requested line items, clinical reasons, and current stock availability.',
        'For single line approval, click "✓ Approve" and specify approved quantity.',
        'To approve all items in 1 click, click "✅ Approve All Pending Lines" in the line items header.',
        'If rejecting an item, click "✕ Reject" and provide a mandatory explanation reason.'
      ]
    }
  },
  {
    id: 'receive_stock',
    title: 'Receiving Inbound Deliveries',
    icon: '🚚',
    category: 'Requisitions & Deliveries',
    permission: 'receive_stock',
    route: '/stock/receive',
    quickHelp: [
      'Log new supply shipments from vendors into clinic inventory.',
      'For batch-controlled items, enter Lot/Batch number and Expiration date.',
      'Use "+1 Year" or "+2 Years" quick-set buttons to fill expiry dates rapidly.'
    ],
    fullGuide: {
      overview: 'The Receive Stock module records incoming vendor deliveries, updating stock balances and registering batch lot numbers with expiry dates for FIFO control.',
      steps: [
        'Navigate to "Receive Stock" from the sidebar menu.',
        'Select the stock item being delivered from the catalog dropdown.',
        'Enter the total physical quantity received and select the supplier.',
        'For medications or batch-controlled items, enter the Batch/Lot number.',
        'Use the quick date pills (+6 Mos, +1 Year, +2 Years) to quickly set expiration dates.',
        'Click "✓ Log Delivery Inbound" to finalize stock intake.'
      ]
    }
  },
  {
    id: 'stock_items',
    title: 'Managing Stock Catalog',
    icon: '📦',
    category: 'Inventory Management',
    permission: 'manage_items',
    route: '/items',
    quickHelp: [
      'View catalog item details, stock gauges, reorder thresholds, and SKUs.',
      'Filter items by category, type (Medication/Consumable), or stock status.',
      'Edit item safety stock levels and minimum reorder points.'
    ],
    fullGuide: {
      overview: 'The Stock Items page manages the master medical inventory catalog, setting safety stock thresholds and dispense configurations.',
      steps: [
        'Navigate to "Stock Items" from the sidebar.',
        'Browse catalog items with visual stock gauges and warning indicators.',
        'Filter by category, search by SKU or item name.',
        'Click "Edit" on an item to adjust reorder levels, units of measure, or dispense modes (Direct/Requisition/Flexible).'
      ]
    }
  },
  {
    id: 'categories',
    title: 'Item Classification & Categories',
    icon: '🏷️',
    category: 'Inventory Management',
    permission: 'manage_categories',
    route: '/categories',
    quickHelp: [
      'Organize inventory items into distinct categories (e.g. Dialyzers, Concentrates, IV Lines).',
      'Configure batch-control policies per category.'
    ],
    fullGuide: {
      overview: 'Categories group inventory items for structured catalog management and enforce batch tracking policies.',
      steps: [
        'Navigate to "Categories".',
        'Click "+ New Category" to create a new inventory grouping.',
        'Define category name, description, and toggle batch control if required.'
      ]
    }
  },
  {
    id: 'suppliers',
    title: 'Supplier Directory',
    icon: '🏢',
    category: 'Inventory Management',
    permission: 'manage_suppliers',
    route: '/suppliers',
    quickHelp: [
      'Maintain vendor contact information, lead times, and delivery terms.',
      'Link default suppliers to catalog inventory items.'
    ],
    fullGuide: {
      overview: 'The Supplier Directory maintains medical vendor contact records, order leads, and delivery history.',
      steps: [
        'Navigate to "Suppliers".',
        'Click "+ Add Supplier" to register vendor contact details.',
        'View linked items and active delivery relationships.'
      ]
    }
  },
  {
    id: 'stocktake',
    title: 'Stocktake & Reconciliation',
    icon: '📊',
    category: 'Inventory Audit & Reconciliation',
    permission: 'enter_stocktake_count',
    route: '/stocktake',
    quickHelp: [
      'Record physical count values during physical inventory reconciliation.',
      'Use "⚠️ Filter Discrepancies" to isolate items where physical count differs from system stock.',
      'Save individual counts or complete the session to apply stock adjustments.'
    ],
    fullGuide: {
      overview: 'Stocktake enables physical inventory count reconciliation, calculating variances between physical stock and system records.',
      steps: [
        'Navigate to "Stocktake" from the sidebar menu.',
        'Select an active stocktake session from the left panel.',
        'Enter physical count numbers into the count column and click "Save".',
        'Click "⚠️ Filter Discrepancies" to view only items with non-zero stock variances.',
        'Authorized managers can click "✓ Complete & Apply Adjustments" to synchronize system stock.'
      ]
    }
  },
  {
    id: 'discards',
    title: 'Waste & Discard Logs',
    icon: '🗑️',
    category: 'Inventory Audit & Reconciliation',
    permission: 'log_discard',
    route: '/discards',
    quickHelp: [
      'Log expired, damaged, or recalled clinical supplies.',
      'Select item, quantity, batch number, and discard reason.',
      'Deducts stock immediately and preserves an immutable audit record.'
    ],
    fullGuide: {
      overview: 'Discard Logging tracks damaged, expired, or compromised clinical inventory, ensuring waste audit compliance.',
      steps: [
        'Navigate to "Discard Logs".',
        'Click "+ Log New Discard".',
        'Select item, specify quantity discarded, and pick the batch number if applicable.',
        'Select discard reason (Expired, Damaged, Compromised Packaging, Other).',
        'Submit log. Inventory stock is decremented immediately.'
      ]
    }
  },
  {
    id: 'cashier',
    title: 'Direct Dispense Billing Log',
    icon: '💳',
    category: 'Audit & Reports',
    permission: 'record_billing',
    route: '/cashier',
    quickHelp: [
      'Review pending billing records for direct items dispensed to patients.',
      'Click "Mark Billing Recorded" once patient statement / charge slip is logged.',
      'Filter billing logs by patient name or payment status.'
    ],
    fullGuide: {
      overview: 'The Cashier Log provides billing officers with a real-time list of direct items dispensed to patients for statement processing.',
      steps: [
        'Navigate to "Cashier Log".',
        'Review items flagged as "Pending Billing".',
        'Verify patient chart number, dispensed item quantity, and timestamp.',
        'Click "✓ Mark Recorded" after entering charges into clinic billing software.'
      ]
    }
  },
  {
    id: 'inventory_logs',
    title: 'Audit Feed & Transactions',
    icon: '📜',
    category: 'Audit & Reports',
    permission: 'view_inventory_logs',
    route: ['/stock/transactions', '/mgmt/audit'],
    quickHelp: [
      'Inspect complete chronological inventory transaction history (Inbound, Outbound, Adjustments).',
      'Filter by movement type, date range, or staff member.',
      'Export audit trail records for compliance inspection.'
    ],
    fullGuide: {
      overview: 'The Audit Feed logs all inventory movement transactions across the system with user timestamps.',
      steps: [
        'Navigate to "Audit Feed" or "MedOPS Audit".',
        'Use search filters to isolate specific item SKU, transaction type, or date range.',
        'View actor details, batch allocations, and net stock impacts.'
      ]
    }
  },
  {
    id: 'reports',
    title: 'Monthly Reports & Archiving',
    icon: '📈',
    category: 'Audit & Reports',
    permission: 'generate_reports',
    route: '/reports',
    quickHelp: [
      'Generate monthly consumption summaries, stock movement reports, and audit archives.',
      'Download reports as structured CSV files or trigger automated report schedules.',
      'Review historical monthly inventory trends.'
    ],
    fullGuide: {
      overview: 'Reports module generates monthly supply consumption metrics, expenditure summaries, and historical archives.',
      steps: [
        'Navigate to "Reports".',
        'Select month and year parameters for the report.',
        'Click "Generate Monthly Report" to produce inventory summaries.',
        'Click "Download CSV" to save reports for external administrative review.'
      ]
    }
  },
  {
    id: 'users',
    title: 'Staff Accounts & RBAC Permissions',
    icon: '👥',
    category: 'System Administration',
    permission: 'create_users',
    route: '/users',
    quickHelp: [
      'Manage staff user accounts, primary roles, and active account statuses.',
      'Configure the Role-Level Permission Matrix or set fine-grained user permission overrides.',
      'Top Admin accounts are protected against unauthorized modification.'
    ],
    fullGuide: {
      overview: 'Staff Accounts management controls user login credentials, primary security roles, and granular permission matrices.',
      steps: [
        'Navigate to "Staff Accounts" from sidebar.',
        'Click "+ Create Account" to onboard a new staff member.',
        'Assign a primary role (Inventory Manager, Nurse, Supply Officer, Cashier, Management Office).',
        'Switch to "Role Permissions Matrix" tab to toggle system-wide role capabilities.',
        'Use "Permissions" on a staff row to configure custom per-user permission overrides.'
      ]
    }
  },
  {
    id: 'import',
    title: 'CSV Bulk Import',
    icon: '📥',
    category: 'System Administration',
    permission: 'bulk_import',
    route: '/import',
    quickHelp: [
      'Bulk import master catalog items, patients, or supplier records from CSV files.',
      'Download sample CSV templates to format data correctly before uploading.'
    ],
    fullGuide: {
      overview: 'CSV Import allows rapid initial system setup and bulk catalog population.',
      steps: [
        'Navigate to "CSV Import".',
        'Download the target template (Items, Patients, Suppliers).',
        'Format data in Excel/CSV matching template column headers.',
        'Upload file and click "Run Import Process" to import records into system.'
      ]
    }
  }
];
