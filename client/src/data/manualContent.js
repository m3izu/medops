/**
 * MedOPS Modular Manual Content
 * 
 * Each section is mapped to a permission key (or null for always-visible sections).
 * The manual auto-filters based on the user's effective permissions via hasPermission().
 * 
 * quickHelp: Short 2-3 bullet tips shown in the floating contextual help drawer
 * fullGuide: Detailed step-by-step instructions shown on the full Manual page
 */

const MANUAL_SECTIONS = [
  // ─── ALWAYS VISIBLE ───
  {
    id: 'dashboard',
    permission: null, // visible to all logged-in users
    category: 'Getting Started',
    title: 'Dashboard Overview',
    icon: '📊',
    route: '/',
    quickHelp: [
      'Your dashboard shows stock alerts, recent activity, and key metrics at a glance.',
      'Red alerts indicate critically low stock that needs immediate attention.',
    ],
    fullGuide: [
      'The Dashboard is your home screen. It displays a summary of the clinic\'s current inventory status, recent transactions, and any active alerts.',
      'Stock alert cards at the top highlight items that have fallen below their configured reorder thresholds. Items in red are critically low and may need urgent procurement.',
      'The recent activity feed shows the latest inventory movements — deliveries received, items dispensed, requisitions submitted, and discards logged.',
      'Use the dashboard as your daily check-in point before starting clinical operations.',
    ],
  },

  // ─── PATIENT CARE ───
  {
    id: 'manage-patients',
    permission: 'manage_patients',
    category: 'Patient Care',
    title: 'Managing Patients',
    icon: '🩺',
    route: '/patients',
    quickHelp: [
      'Click "+ Register Patient" to add a new dialysis patient.',
      'Click on any patient row to view their chart, diagnosis, and requisition history.',
      'Use the "💊 Dispense Supplies" button on a patient\'s chart to quickly jump to dispensing.',
    ],
    fullGuide: [
      'Navigate to the Patients page from the sidebar to view all registered dialysis patients.',
      'To register a new patient, click the "+ Register Patient" button in the top-right corner. Fill in the patient\'s full name, chart number, diagnosis, dialysis schedule (e.g., MWF or TTS), contact information, and first session date.',
      'Click on any patient row in the table to open their detailed chart in the right-side panel. The chart shows their diagnosis, schedule, contact info, and recent requisition history.',
      'To dispense supplies directly to a patient, click the "💊 Dispense Supplies to [Name]" button in their chart. This will take you to the Dispense page with the patient pre-selected.',
      'You can search and filter patients using the search bar at the top of the patient list.',
      'To update a patient\'s status (e.g., mark as Inactive when they transfer to another center), use the status controls in the patient\'s chart.',
    ],
  },
  {
    id: 'submit-requisition',
    permission: 'submit_requisition',
    category: 'Patient Care',
    title: 'Submitting Requisitions',
    icon: '📋',
    route: '/requisitions',
    quickHelp: [
      'Click "+ New Requisition" to request supplies for a patient session.',
      'Add line items with the item, quantity, and clinical reason for each.',
      'Your manager will be notified automatically once submitted.',
    ],
    fullGuide: [
      'Requisitions are formal requests for clinical supplies needed for a specific patient\'s dialysis session.',
      'To create a new requisition, click "+ New Requisition" in the top-right corner of the Requisitions page.',
      'Select the patient who needs supplies, choose the session date, and add one or more line items. For each line item, select the supply item from the catalog, enter the quantity needed, and provide a brief clinical reason (e.g., "Routine HD session", "Catheter dressing change").',
      'Click "+ Add Line" to request additional items on the same requisition form.',
      'Once submitted, the requisition enters "Pending" status. Your Inventory Manager and Top Admin will receive a notification to review and approve it.',
      'You can track the status of your submitted requisitions from the requisitions list. Each line item will show whether it is Pending, Approved, or Rejected.',
      'If a line item is rejected, you will see the rejection reason. You can click "Resubmit" to adjust the quantity or reason and try again.',
    ],
  },
  {
    id: 'approve-requisition',
    permission: 'approve_requisition',
    category: 'Patient Care',
    title: 'Approving Requisitions',
    icon: '✅',
    route: '/requisitions',
    quickHelp: [
      'Click on a pending requisition to view its line items.',
      'Approve or reject each line individually, or use "✅ Approve All" for bulk sign-off.',
      'Medication items require co-verification before they can be approved.',
    ],
    fullGuide: [
      'As a manager with requisition approval permissions, you can review and approve supply requests submitted by clinical staff.',
      'From the Requisitions page, pending requisitions are highlighted. Click on one to open the detail view on the right panel.',
      'Each line item shows the requested item, quantity, clinical reason, current stock level, and approval status.',
      'To approve a line item, click "✓ Approve". You can optionally adjust the approved quantity if you need to partially fulfill the request.',
      'To reject a line item, click "✕ Reject" and provide a reason for the rejection (e.g., "Use alternative brand", "Excessive quantity").',
      'For faster processing, use the "✅ Approve All Pending Lines" button at the top of the line items section to approve all eligible lines in one click.',
      'Note: Medication items (drugs, injectables) require a co-verification step by a Supply Officer before they can be approved. This is a safety measure to prevent medication errors.',
      'Once approved, stock is automatically deducted from inventory using FIFO batch logic, and a transaction log is created.',
    ],
  },
  {
    id: 'dispense-item',
    permission: 'dispense_item',
    category: 'Patient Care',
    title: 'Dispensing Supplies Directly',
    icon: '💊',
    route: '/dispense',
    quickHelp: [
      'Select a patient and item, then set the quantity and click "Log Dispense".',
      'Stock is deducted immediately and the cashier is notified for billing.',
      'You can also dispense from a patient\'s chart via the "💊 Dispense" button.',
    ],
    fullGuide: [
      'Direct Dispense allows you to give supplies to a patient immediately without going through the requisition approval workflow. This is used for items marked as "Direct Dispense" or "Flexible" in the catalog.',
      'On the Dispense page, select the patient from the dropdown. If you came from a patient\'s chart, the patient will already be pre-selected.',
      'Select the item to dispense. The dropdown shows current stock levels for each item.',
      'Enter the quantity and optionally add a note (e.g., "Emergency replacement cannula").',
      'Click "💊 Log Dispense" to complete the transaction. The stock is deducted immediately from inventory, and the cashier is automatically notified for billing.',
      'The dispense history table below the form shows all your recent dispense records, including billing status and the option to initiate a return if needed.',
    ],
  },
  {
    id: 'return-item',
    permission: 'return_item',
    category: 'Patient Care',
    title: 'Returning Items',
    icon: '🔄',
    route: '/returns',
    quickHelp: [
      'Use this to return unused items back to stock after a dispense or requisition.',
      'Select the source record, enter the return quantity, and provide a reason.',
    ],
    fullGuide: [
      'The Return Item feature allows you to reverse a previous dispense or requisition fulfillment when items were not used.',
      'Common scenarios: a patient\'s session was cancelled after supplies were prepared, or extra items were dispensed by mistake.',
      'Select the source type (Dispense or Requisition), find the original record, enter the quantity to return, and provide a reason.',
      'Returned items are added back to inventory stock, and the transaction is logged for audit purposes.',
    ],
  },
  {
    id: 'record-billing',
    permission: 'record_billing',
    category: 'Patient Care',
    title: 'Cashier Billing Log',
    icon: '🧾',
    route: '/cashier',
    quickHelp: [
      'View all pending billing items from direct dispenses.',
      'Click "Mark as Recorded" after entering the charge into the billing system.',
    ],
    fullGuide: [
      'The Cashier Log shows all items that have been directly dispensed to patients and are awaiting billing confirmation.',
      'When a nurse or supply officer dispenses items to a patient, a billing entry automatically appears in your Cashier Log with "Pending Billing" status.',
      'Review each entry to confirm the patient, item, and quantity. After recording the charge in your external billing/accounting system, click "Mark as Recorded" to update the status.',
      'This ensures all dispensed items are properly billed and nothing falls through the cracks.',
    ],
  },

  // ─── INVENTORY MANAGEMENT ───
  {
    id: 'manage-items',
    permission: 'manage_items',
    category: 'Inventory Management',
    title: 'Managing Stock Items',
    icon: '📦',
    route: '/items',
    quickHelp: [
      'View all catalog items with current stock levels, reorder points, and batch details.',
      'Click "+ New Item" to add a new supply to the system catalog.',
    ],
    fullGuide: [
      'The Stock Items page is your master catalog of all clinical supplies, medications, and consumables.',
      'Each item card shows the item name, SKU, current stock quantity, unit of measure, reorder threshold, and dispense mode.',
      'To add a new item, click "+ New Item" and fill in the item name, SKU, unit, category, default supplier, reorder level, and dispense mode (Requisition Only, Direct Dispense, or Flexible).',
      'To edit an existing item, click on its row to open the detail view and modify its properties.',
      'Items marked as "Medication" or belonging to a batch-controlled category will require batch numbers and expiry dates when receiving stock.',
      'Archiving an item hides it from active views without deleting historical transaction data.',
    ],
  },
  {
    id: 'receive-stock',
    permission: 'receive_stock',
    category: 'Inventory Management',
    title: 'Receiving Deliveries',
    icon: '📥',
    route: '/stock/receive',
    quickHelp: [
      'Select the item, enter the quantity received, and choose the supplier.',
      'For medications, enter the batch/lot number and expiry date.',
      'Use the quick date pills (+6 Mos, +1 Year, etc.) to set expiry dates faster.',
    ],
    fullGuide: [
      'The Receive Stock page is used to log incoming deliveries and shipments into your clinic inventory.',
      'Select the item from your catalog. The form will show the current stock level and measurement unit.',
      'Enter the quantity received as shown on the supplier\'s delivery receipt.',
      'Select the supplier/vendor. If the item has a default supplier, it will be auto-selected.',
      'For batch-controlled items (medications, certain consumables), you must enter the Batch/Lot Number printed on the packaging and the Expiry Date.',
      'Use the quick date helper pills below the expiry date field (+6 Months, +1 Year, +2 Years, +3 Years) to quickly set common expiration dates.',
      'Add any delivery notes such as invoice numbers, courier details, or storage instructions.',
      'Click "Log Delivery Inbound" to complete. Stock levels are updated immediately.',
    ],
  },
  {
    id: 'manage-categories',
    permission: 'manage_categories',
    category: 'Inventory Management',
    title: 'Managing Categories',
    icon: '🏷️',
    route: '/categories',
    quickHelp: [
      'Categories group related items (e.g., "Dialysis Consumables", "Medications").',
      'Enable "Batch Control" on a category to require batch tracking for all items in it.',
    ],
    fullGuide: [
      'Categories help organize your inventory into logical groups such as "Dialysis Consumables", "IV Fluids", "Medications", "Surgical Supplies", etc.',
      'To create a new category, click "+ New Category" and enter the category name and optional description.',
      'Enable the "Has Batch Control" toggle if all items in this category should require batch number and expiry date tracking when receiving stock. This is important for medications and perishable supplies.',
      'Items inherit batch control settings from their category, ensuring consistent tracking across similar products.',
    ],
  },
  {
    id: 'manage-suppliers',
    permission: 'manage_suppliers',
    category: 'Inventory Management',
    title: 'Managing Suppliers',
    icon: '🚚',
    route: '/suppliers',
    quickHelp: [
      'Add and manage your vendor directory with contact details.',
      'Link suppliers to items so they auto-populate when receiving stock.',
    ],
    fullGuide: [
      'The Suppliers page is your vendor directory for all clinical supply distributors and pharmaceutical companies.',
      'To add a new supplier, click "+ New Supplier" and enter the company name, contact person, phone number, email, and address.',
      'Linking a supplier to specific items allows the system to auto-select the correct supplier when receiving stock, saving time during delivery intake.',
      'Keep supplier records updated so that procurement contacts are always current.',
    ],
  },
  {
    id: 'log-discard',
    permission: 'log_discard',
    category: 'Inventory Management',
    title: 'Logging Discards & Waste',
    icon: '🗑️',
    route: '/discards',
    quickHelp: [
      'Log expired, damaged, or contaminated items that must be removed from stock.',
      'Select the item, enter the quantity, and provide a discard reason.',
    ],
    fullGuide: [
      'The Discard Log is used to record items that must be removed from inventory due to expiration, damage, contamination, or other reasons.',
      'To log a discard, select the item from the catalog, enter the quantity being discarded, and provide a clear reason (e.g., "Expired batch LOT-2024-A", "Packaging damaged in transit").',
      'Discarded quantities are deducted from stock levels and a permanent audit trail is created.',
      'Regular discard logging helps maintain accurate inventory counts and supports regulatory compliance for pharmaceutical waste tracking.',
    ],
  },

  // ─── STOCKTAKE & AUDIT ───
  {
    id: 'enter-stocktake',
    permission: 'enter_stocktake_count',
    category: 'Stocktake & Audit',
    title: 'Physical Inventory Counting',
    icon: '📋',
    route: '/stocktake',
    quickHelp: [
      'Enter the physical count for each item during an active stocktake session.',
      'Click "Save" next to each line after counting.',
      'Use the "⚠️ Filter Discrepancies" button to see only items with variances.',
    ],
    fullGuide: [
      'During a stocktake session, your task is to physically count every item in the clinic storage and enter the actual quantity into the system.',
      'Navigate to the Stocktake page. If a stocktake session is in progress, the count sheet will be displayed automatically.',
      'For each item row, physically count the items on the shelf and enter the number in the "Physical Count" field. Click "Save" to record your count.',
      'The system will automatically calculate the discrepancy (difference between physical count and system quantity). Green means surplus, red means shortage.',
      'Use the "⚠️ Filter Discrepancies" toggle button to hide matching items and focus only on items where your physical count differs from the system.',
      'Continue counting until all items are recorded. The progress indicator at the top shows how many items have been counted out of the total.',
    ],
  },
  {
    id: 'initiate-stocktake',
    permission: 'initiate_stocktake',
    category: 'Stocktake & Audit',
    title: 'Managing Stocktake Sessions',
    icon: '📊',
    route: '/stocktake',
    quickHelp: [
      'Click "+ New Stocktake" to initiate a physical inventory count session.',
      'After all items are counted, click "Complete & Apply Adjustments" to reconcile.',
    ],
    fullGuide: [
      'As a manager, you can initiate and complete stocktake sessions to reconcile physical inventory with system records.',
      'Click "+ New Stocktake" to start a new session. All active staff members will be notified to assist with physical counts.',
      'Monitor the count sheet to track progress. The header shows how many items have been counted and how many discrepancies have been found.',
      'Once all items are counted (or enough for your purposes), click "✓ Complete & Apply Adjustments". This will automatically adjust system stock levels to match the physical counts and create audit-logged ADJUSTMENT transactions for every discrepancy.',
      'Warning: Completing a stocktake is irreversible. All stock adjustments are applied immediately.',
      'Review the stocktake history in the left sidebar to view past sessions and their outcomes.',
    ],
  },
  {
    id: 'view-logs',
    permission: 'view_inventory_logs',
    category: 'Stocktake & Audit',
    title: 'Viewing Audit & Transaction Logs',
    icon: '📜',
    route: '/stock/transactions',
    quickHelp: [
      'View all inventory movements: deliveries, dispenses, approvals, discards, and adjustments.',
      'Use the filters to narrow down by date range, item, or transaction type.',
    ],
    fullGuide: [
      'The Audit Feed provides a chronological record of every inventory movement in the clinic.',
      'Each transaction entry shows the date and time, item affected, transaction type (Inbound, Outbound, Adjustment, Discard), quantity, and the staff member who performed it.',
      'Use the filter controls to narrow down by date range, specific items, transaction types, or staff members.',
      'This log is your primary tool for investigating stock discrepancies, verifying delivery receipts, and supporting external audits.',
      'All entries are immutable — they cannot be edited or deleted, ensuring a tamper-proof audit trail.',
    ],
  },

  // ─── REPORTS & ADMIN ───
  {
    id: 'generate-reports',
    permission: 'view_reports',
    category: 'Reports & Administration',
    title: 'Reports & Live Analytics',
    icon: '📈',
    route: '/reports',
    quickHelp: [
      'View real-time inventory metrics, section stats, and trend analytics.',
      'Filter by custom date ranges and export section records as CSV or print.',
    ],
    fullGuide: [
      'The Reports page provides access to monthly inventory summary reports for the clinic.',
      'Reports include stock level summaries, consumption patterns, expiring batch alerts, and discrepancy histories.',
      'To generate a new report, select the desired month and click "Generate". The system will compile data from all transactions during that period.',
      'Generated reports can be viewed inline or downloaded for printing and external review.',
      'Monthly reports are archived and accessible for historical comparison.',
    ],
  },
  {
    id: 'create-users',
    permission: 'create_users',
    category: 'Reports & Administration',
    title: 'Managing Staff Accounts',
    icon: '👥',
    route: '/users',
    quickHelp: [
      'Click "+ Create Staff Account" to register a new system user.',
      'Assign a role to determine their default permissions.',
      'Use the Permissions tab to fine-tune individual access.',
    ],
    fullGuide: [
      'The Staff Accounts page allows you to manage all system users, their roles, and their individual permissions.',
      'To create a new user, click "+ Create Staff Account". Enter their full name, username, temporary password, and assign a primary role (Nurse, Supply Officer, Cashier, Inventory Manager, etc.).',
      'The assigned role determines the user\'s default permissions. For example, a Nurse can submit requisitions and dispense items, while an Inventory Manager can also approve requisitions and manage stock.',
      'Use the action buttons on each staff row to reset passwords, deactivate accounts, or delete accounts.',
      'Switch to the "Role Permissions" tab to view and modify the permission matrix for each role.',
      'Switch to the "Staff" tab and click "Permissions" on a specific user to set individual permission overrides that differ from their role defaults.',
    ],
  },
  {
    id: 'manage-permissions',
    permission: 'manage_permissions',
    category: 'Reports & Administration',
    title: 'Configuring Role Permissions',
    icon: '🔒',
    route: '/users',
    quickHelp: [
      'Use the Role Permissions Matrix to toggle permissions ON/OFF for each role.',
      'Changes take effect immediately for all users with that role.',
    ],
    fullGuide: [
      'The Role Permissions Matrix (found under the "Role Permissions" tab on the Staff page) lets you configure which permissions each role has by default.',
      'Each row represents a permission (e.g., "submit requisition", "receive stock"), and each column represents a role.',
      'Click the ON/OFF toggle to grant or revoke a permission for a role. Changes take effect immediately for all users with that role.',
      'Individual user overrides can also be applied to grant or revoke specific permissions for a single person, independent of their role defaults.',
      'Note: When you change a role\'s permissions, the system manual for all users with that role automatically updates to reflect the new capabilities.',
    ],
  },
  {
    id: 'bulk-import',
    permission: 'bulk_import',
    category: 'Reports & Administration',
    title: 'CSV Bulk Import',
    icon: '📤',
    route: '/import',
    quickHelp: [
      'Upload CSV files to bulk-import items, patients, or suppliers.',
      'Download the template first to ensure correct formatting.',
    ],
    fullGuide: [
      'The CSV Bulk Import tool allows you to upload large datasets into the system without manually entering each record.',
      'Supported import types: Items (inventory catalog), Patients, and Suppliers.',
      'Download the CSV template for the data type you want to import. Fill in your data following the exact column format.',
      'Upload the completed CSV file. The system will validate each row before importing.',
      'Any rows with errors will be flagged with specific error messages so you can correct and re-upload.',
    ],
  },
];

/**
 * Get manual sections filtered for a specific page route.
 * Returns only sections whose route matches AND whose permission the user has.
 */
export const getSectionsForRoute = (route, hasPermission) => {
  return MANUAL_SECTIONS.filter(section => {
    if (section.route !== route) return false;
    if (section.permission === null) return true;
    return hasPermission(section.permission);
  });
};

/**
 * Get all manual sections the user has permission to see,
 * grouped by category.
 */
export const getAllSectionsGrouped = (hasPermission) => {
  const filtered = MANUAL_SECTIONS.filter(section => {
    if (section.permission === null) return true;
    return hasPermission(section.permission);
  });

  const grouped = {};
  filtered.forEach(section => {
    if (!grouped[section.category]) {
      grouped[section.category] = [];
    }
    grouped[section.category].push(section);
  });

  return grouped;
};

export default MANUAL_SECTIONS;
