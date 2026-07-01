-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" DATETIME,
    "created_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "session_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "timeout_minutes" INTEGER NOT NULL DEFAULT 30
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("role", "permission_key")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" TEXT NOT NULL,
    "permission_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL,

    PRIMARY KEY ("user_id", "permission_key"),
    CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "permission_audit_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changed_by_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_role" TEXT,
    "target_user_id" TEXT,
    "permission_key" TEXT NOT NULL,
    "old_value" BOOLEAN NOT NULL,
    "new_value" BOOLEAN NOT NULL,
    "changed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permission_audit_log_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "permission_audit_log_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "suppliers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "created_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "categories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category_id" TEXT,
    "item_type" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "warning_level" INTEGER NOT NULL DEFAULT 10,
    "critical_level" INTEGER NOT NULL DEFAULT 5,
    "supplier_id" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "serial_number" TEXT,
    "acquisition_date" DATETIME,
    "condition" TEXT DEFAULT 'GOOD',
    "created_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "item_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item_id" TEXT NOT NULL,
    "batch_no" TEXT,
    "expiry_date" DATETIME,
    "quantity_remaining" INTEGER NOT NULL DEFAULT 0,
    "supplier_id" TEXT,
    "received_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "item_batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "item_id" TEXT NOT NULL PRIMARY KEY,
    "quantity_on_hand" INTEGER NOT NULL DEFAULT 0,
    "last_updated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_levels_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "chart_number" TEXT NOT NULL,
    "diagnosis" TEXT,
    "schedule" TEXT,
    "first_session_date" DATETIME,
    "contact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "managed_by_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "patients_managed_by_id_fkey" FOREIGN KEY ("managed_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "requisitions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patient_id" TEXT NOT NULL,
    "submitted_by_id" TEXT NOT NULL,
    "session_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cancelled_by" TEXT,
    "cancelled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "requisitions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "requisitions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "requisition_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requisition_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "qty_requested" INTEGER NOT NULL,
    "qty_approved" INTEGER,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" TEXT,
    "rejection_reason" TEXT,
    "co_verified_by_id" TEXT,
    "is_resubmission" BOOLEAN NOT NULL DEFAULT false,
    "original_line_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "requisition_lines_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "requisitions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "requisition_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transaction_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "type" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "user_id" TEXT NOT NULL,
    "requisition_line_id" TEXT,
    "notes" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transaction_logs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transaction_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transaction_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transaction_logs_requisition_line_id_fkey" FOREIGN KEY ("requisition_line_id") REFERENCES "requisition_lines" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "discard_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "logged_by_id" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discard_logs_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "discard_logs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "discard_logs_logged_by_id_fkey" FOREIGN KEY ("logged_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mgmt_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transaction_log_id" TEXT NOT NULL,
    "comment_text" TEXT NOT NULL,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "commented_by_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mgmt_comments_transaction_log_id_fkey" FOREIGN KEY ("transaction_log_id") REFERENCES "transaction_logs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "mgmt_comments_commented_by_id_fkey" FOREIGN KEY ("commented_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stocktakes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "initiated_by_id" TEXT NOT NULL,
    "initiated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "completed_at" DATETIME,
    CONSTRAINT "stocktakes_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stocktake_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stocktake_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "system_qty" INTEGER NOT NULL,
    "physical_qty" INTEGER,
    "discrepancy" INTEGER,
    "approved_by_id" TEXT,
    CONSTRAINT "stocktake_lines_stocktake_id_fkey" FOREIGN KEY ("stocktake_id") REFERENCES "stocktakes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stocktake_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stocktake_lines_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "period_start" DATETIME NOT NULL,
    "period_end" DATETIME NOT NULL,
    "generated_by_id" TEXT NOT NULL,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdf_path" TEXT,
    CONSTRAINT "monthly_reports_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "report_schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_dashboard_prefs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "widget_key" TEXT NOT NULL,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "user_dashboard_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "import_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_name" TEXT NOT NULL,
    "imported_by_id" TEXT NOT NULL,
    "imported_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rows_success" INTEGER NOT NULL DEFAULT 0,
    "rows_failed" INTEGER NOT NULL DEFAULT 0,
    "error_details" TEXT,
    CONSTRAINT "import_logs_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "items_sku_key" ON "items"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "patients_chart_number_key" ON "patients"("chart_number");

-- CreateIndex
CREATE UNIQUE INDEX "user_dashboard_prefs_user_id_widget_key_key" ON "user_dashboard_prefs"("user_id", "widget_key");
