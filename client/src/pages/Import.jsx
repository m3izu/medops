import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TEMPLATES = {
  suppliers: 'name,contactPerson,phone,email,address,notes',
  items: 'name,sku,itemType,unit,categoryId,supplierId,warningLevel,criticalLevel,serialNumber,acquisitionDate,condition,initialQty,batchNo,expiryDate',
  patients: 'name,chartNumber,diagnosis,schedule,firstSessionDate,contact,status'
};

const Import = () => {
  const { hasPermission } = useAuth();
  const [importType, setImportType] = useState('suppliers');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);
  const [detailsLog, setDetailsLog] = useState(null);

  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const res = await api.get('/import/logs');
      setLogs(res.data || []);
    } catch (err) {
      console.error('Error fetching import logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (hasPermission('bulk_import')) {
      fetchLogs();
    }
  }, []);

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || !lines[0].trim()) return [];
    
    // Parse headers, stripping quotes and spaces
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^["']|["']$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^["']|["']$/g, ''));
      
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      results.push(row);
    }
    return results;
  };

  const handleTextChange = (e) => {
    const text = e.target.value;
    setCsvText(text);
    setError('');
    setSuccess('');
    
    try {
      const parsed = parseCSV(text);
      setPreviewRows(parsed);
    } catch (err) {
      setPreviewRows([]);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFileName(file.name);
    setError('');
    setSuccess('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      setCsvText(text);
      try {
        const parsed = parseCSV(text);
        setPreviewRows(parsed);
      } catch (err) {
        setPreviewRows([]);
        setError('Failed to parse uploaded CSV file.');
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (previewRows.length === 0) {
      setError('No data found to import. Please select a valid CSV or paste content.');
      return;
    }

    try {
      setImporting(true);
      const res = await api.post('/import', {
        type: importType,
        rows: previewRows,
        fileName: fileName || `pasted_data_${importType}.csv`
      });

      const { rowsSuccess, rowsFailed, errors } = res.data;
      
      if (rowsFailed === 0) {
        setSuccess(`Successfully imported all ${rowsSuccess} records!`);
      } else {
        setSuccess(`Partial Import: Imported ${rowsSuccess} records successfully. ${rowsFailed} rows failed.`);
        if (errors && errors.length > 0) {
          setError(`Errors encountered:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more errors.` : ''}`);
        }
      }

      // Reset input
      setCsvText('');
      setFileName('');
      setPreviewRows([]);
      fetchLogs();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Bulk import failed.');
    } finally {
      setImporting(false);
    }
  };

  const loadTemplate = () => {
    setCsvText(TEMPLATES[importType] + '\n');
    setPreviewRows([]);
    setFileName('');
    setError('');
    setSuccess('');
  };

  if (!hasPermission('bulk_import')) {
    return (
      <div className="page-container">
        <div className="widget-card" style={{ borderLeft: '4px solid var(--color-critical)' }}>
          <div className="widget-header">
            <span className="widget-title">Access Denied</span>
          </div>
          <div className="widget-body">
            <p style={{ color: 'var(--theme-text-muted)' }}>
              You do not have the required permission (`bulk_import`) to access the bulk import module.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Bulk CSV Data Import</h2>
          <p className="page-title-desc">Load clinic registries and initial inventory counts in bulk. Validate CSV headers and preview raw rows prior to ingestion.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Left Side: Upload / Paste form */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Upload & Ingest</span>
          </div>
          <form onSubmit={handleImportSubmit} className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div className="login-error" style={{ whiteSpace: 'pre-line', margin: 0 }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ padding: '12px 16px', background: 'var(--color-success-bg)', color: 'var(--color-success)', borderRadius: 'var(--border-radius-md)', fontSize: '13px', fontWeight: '500' }}>
                ✓ {success}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Registry Type *</label>
              <select 
                className="form-control"
                value={importType}
                onChange={(e) => {
                  setImportType(e.target.value);
                  setCsvText('');
                  setPreviewRows([]);
                }}
              >
                <option value="suppliers">Suppliers Registry</option>
                <option value="items">Inventory Items Catalog</option>
                <option value="patients">Dialysis Patients Database</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Upload CSV File</label>
              <input 
                type="file" 
                accept=".csv"
                className="form-control"
                onChange={handleFileUpload}
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Or Paste CSV Text</label>
                <button type="button" className="btn btn-secondary btn-sm" onClick={loadTemplate}>
                  Load Template Headers
                </button>
              </div>
              <textarea 
                className="form-control"
                placeholder="Paste CSV rows here..."
                value={csvText}
                onChange={handleTextChange}
                style={{ minHeight: '120px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
            </div>

            {previewRows.length > 0 && (
              <div style={{ background: 'var(--theme-bg)', padding: '12px', borderRadius: 'var(--border-radius-md)' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--theme-text-bold)' }}>
                  Parsed Rows Preview ({previewRows.length} rows found)
                </span>
                <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '6px', fontSize: '11px', color: 'var(--theme-text-muted)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {Object.keys(previewRows[0]).map(k => (
                          <th key={k} style={{ textAlign: 'left', padding: '2px 4px', borderBottom: '1px solid var(--theme-border)' }}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 3).map((r, idx) => (
                        <tr key={idx}>
                          {Object.values(r).map((v, i) => (
                            <td key={i} style={{ padding: '2px 4px', borderBottom: '1px solid var(--theme-border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }}>{String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previewRows.length > 3 && (
                    <p style={{ fontStyle: 'italic', marginTop: '4px', textAlign: 'center' }}>
                      + {previewRows.length - 3} more rows in preview...
                    </p>
                  )}
                </div>
              </div>
            )}

            <button 
              type="submit" 
              className="btn btn-primary"
              disabled={importing || previewRows.length === 0}
              style={{ width: '100%' }}
            >
              {importing ? 'Processing Bulk Ingestion...' : '🚀 Execute Bulk Import'}
            </button>
          </form>
        </div>

        {/* Right Side: Header Templates & Guidelines */}
        <div className="widget-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="widget-header">
            <span className="widget-title">Import Template Formats</span>
          </div>
          <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
            <div>
              <strong style={{ color: 'var(--theme-text-bold)' }}>Suppliers Headers:</strong>
              <code style={{ display: 'block', padding: '6px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-sm)', marginTop: '4px', wordBreak: 'break-all' }}>
                {TEMPLATES.suppliers}
              </code>
            </div>

            <div>
              <strong style={{ color: 'var(--theme-text-bold)' }}>Inventory Items Headers:</strong>
              <code style={{ display: 'block', padding: '6px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-sm)', marginTop: '4px', wordBreak: 'break-all' }}>
                {TEMPLATES.items}
              </code>
              <ul style={{ paddingLeft: '16px', marginTop: '6px', color: 'var(--theme-text-muted)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <li><code>itemType</code> must be: MEDICATION, MEDICAL_CONSUMABLE, MEDICAL_EQUIPMENT, PPE, OFFICE_SUPPLY</li>
                <li><code>initialQty</code> will automatically create matching Inbound Logs</li>
                <li><code>batchNo</code> and <code>expiryDate</code> (e.g. 2027-06-30) are optional but recommended for batch-controlled items</li>
              </ul>
            </div>

            <div>
              <strong style={{ color: 'var(--theme-text-bold)' }}>Patients Registry Headers:</strong>
              <code style={{ display: 'block', padding: '6px', background: 'var(--theme-bg)', borderRadius: 'var(--border-radius-sm)', marginTop: '4px', wordBreak: 'break-all' }}>
                {TEMPLATES.patients}
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Side: Import Logs History */}
      <div className="widget-card" style={{ marginTop: '24px' }}>
        <div className="widget-header">
          <span className="widget-title">Bulk Import History Logs</span>
        </div>
        <div className="widget-body" style={{ padding: 0 }}>
          {logsLoading ? (
            <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading past ingestion logs...</p>
          ) : logs.length === 0 ? (
            <p style={{ padding: '24px', color: 'var(--theme-text-muted)', textAlign: 'center' }}>
              No bulk import history logs compiled yet.
            </p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Filename</th>
                  <th>Success Rows</th>
                  <th>Failed Rows</th>
                  <th>Imported By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td>{new Date(log.importedAt).toLocaleString()}</td>
                    <td><code>{log.fileName}</code></td>
                    <td style={{ color: 'var(--color-success)', fontWeight: '600' }}>+{log.rowsSuccess}</td>
                    <td style={{ color: log.rowsFailed > 0 ? 'var(--color-critical)' : 'var(--theme-text-muted)', fontWeight: '600' }}>
                      {log.rowsFailed}
                    </td>
                    <td>{log.importedBy.name} ({log.importedBy.role.replace('_', ' ')})</td>
                    <td>
                      {log.errorDetails && (
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => setDetailsLog(detailsLog?.id === log.id ? null : log)}
                        >
                          {detailsLog?.id === log.id ? 'Hide Details' : 'View Errors'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Details modal for errors */}
      {detailsLog && (
        <div className="modal-backdrop" onClick={() => setDetailsLog(null)}>
          <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Bulk Ingestion Error Details</h3>
              <button className="modal-close" onClick={() => setDetailsLog(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <p style={{ marginBottom: '10px' }}>Filename: <code>{detailsLog.fileName}</code></p>
              <div style={{ background: 'var(--theme-bg)', padding: '12px', borderRadius: 'var(--border-radius-md)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                {JSON.parse(detailsLog.errorDetails).map((err, idx) => (
                  <p key={idx} style={{ color: 'var(--color-critical)', marginBottom: '4px' }}>• {err}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Import;
