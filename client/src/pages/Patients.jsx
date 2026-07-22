import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';

const HighlightText = ({ text, search }) => {
  if (!search || !text) return <span>{text}</span>;
  const regex = new RegExp(`(${search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi');
  const parts = String(text).split(regex);
  return (
    <span>
      {parts.map((part, i) => 
        regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
      )}
    </span>
  );
};

const Patients = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterSearch]);

  const exportPatientsCSV = () => {
    if (!sortedPatients.length) return;
    const headers = ['Patient Name', 'Chart Number', 'Diagnosis', 'Schedule', 'Status', 'First Session Date', 'Contact'];
    const rows = sortedPatients.map((p) => [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.chartNumber || '').replace(/"/g, '""')}"`,
      `"${(p.diagnosis || '').replace(/"/g, '""')}"`,
      `"${(p.schedule || '').replace(/"/g, '""')}"`,
      `"${p.status}"`,
      `"${p.firstSessionDate ? new Date(p.firstSessionDate).toLocaleDateString() : ''}"`,
      `"${(p.contact || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medops_patients_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Patient registry exported to CSV!');
  };

  // Sorting
  const [sortBy, setSortBy] = useState('name'); // 'name' | 'chartNumber' | 'schedule' | 'status'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [modalPatientId, setModalPatientId] = useState(null);

  // Form Fields
  const [name, setName] = useState('');
  const [chartNumber, setChartNumber] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [schedule, setSchedule] = useState('');
  const [firstSessionDate, setFirstSessionDate] = useState('');
  const [contact, setContact] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterSearch) params.search = filterSearch;
      const response = await api.get('/patients', { params });
      setPatients(response.data || []);
      setError('');
    } catch (err) {
      console.error('Error fetching patients:', err);
      setError('Failed to fetch patient records.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientDetails = async (id) => {
    try {
      const response = await api.get(`/patients/${id}`);
      setSelectedPatient(response.data);
    } catch (err) {
      console.error('Error fetching patient details:', err);
      alert('Failed to load patient details.');
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchPatients();
  }, [filterStatus, filterSearch]);

  const openAddModal = () => {
    setModalMode('add');
    setModalPatientId(null);
    setName('');
    setChartNumber('');
    setDiagnosis('');
    setSchedule('');
    setFirstSessionDate('');
    setContact('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (patient, e) => {
    e.stopPropagation();
    setModalMode('edit');
    setModalPatientId(patient.id);
    setName(patient.name || '');
    setChartNumber(patient.chartNumber || '');
    setDiagnosis(patient.diagnosis || '');
    setSchedule(patient.schedule || '');
    setFirstSessionDate(patient.firstSessionDate ? patient.firstSessionDate.substring(0, 10) : '');
    setContact(patient.contact || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Patient name is required.');
      return;
    }
    if (modalMode === 'add' && !chartNumber.trim()) {
      setFormError('Chart number / Patient ID is required.');
      return;
    }

    const payload = { name, chartNumber, diagnosis, schedule, firstSessionDate: firstSessionDate || null, contact };

    try {
      setIsSubmitting(true);
      if (modalMode === 'add') {
        await api.post('/patients', payload);
      } else {
        await api.put(`/patients/${modalPatientId}`, payload);
        if (selectedPatient && selectedPatient.id === modalPatientId) {
          fetchPatientDetails(modalPatientId);
        }
      }
      setIsModalOpen(false);
      fetchPatients();
    } catch (err) {
      console.error('Submit failed:', err);
      setFormError(err.response?.data?.error || 'An error occurred while saving the patient record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (patient, e) => {
    e.stopPropagation();
    const action = patient.status === 'ACTIVE' ? 'archive (mark inactive)' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${action} patient "${patient.name}"?`)) return;

    try {
      await api.patch(`/patients/${patient.id}/status`);
      fetchPatients();
      if (selectedPatient && selectedPatient.id === patient.id) {
        fetchPatientDetails(patient.id);
      }
    } catch (err) {
      console.error('Toggle status failed:', err);
      alert(err.response?.data?.error || 'Failed to change patient status.');
    }
  };

  const handleRowClick = (id) => {
    fetchPatientDetails(id);
  };

  const canManage = hasPermission('manage_patients');

  const activeCount = patients.filter(p => p.status === 'ACTIVE').length;
  const inactiveCount = patients.filter(p => p.status === 'INACTIVE').length;

  // Apply Sorting
  const sortedPatients = [...patients].sort((a, b) => {
    let aVal, bVal;
    if (sortBy === 'name') {
      aVal = (a.name || '').toLowerCase();
      bVal = (b.name || '').toLowerCase();
    } else if (sortBy === 'chartNumber') {
      aVal = (a.chartNumber || '').toLowerCase();
      bVal = (b.chartNumber || '').toLowerCase();
    } else if (sortBy === 'schedule') {
      aVal = (a.schedule || '').toLowerCase();
      bVal = (b.schedule || '').toLowerCase();
    } else if (sortBy === 'status') {
      aVal = a.status === 'ACTIVE' ? 0 : 1;
      bVal = b.status === 'ACTIVE' ? 0 : 1;
    } else {
      aVal = (a.name || '').toLowerCase();
      bVal = (b.name || '').toLowerCase();
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleHeaderSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const renderSortIndicator = (field) => {
    if (sortBy !== field) return <span style={{ opacity: 0.3, marginLeft: '4px', fontSize: '10px' }}>⇅</span>;
    return <span style={{ marginLeft: '4px', fontSize: '11px', color: 'var(--theme-primary)' }}>{sortOrder === 'asc' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h2>Patient Registry</h2>
          <p className="page-title-desc">Manage clinical patient records, dialysis schedules, and chart identification numbers.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-outline" onClick={exportPatientsCSV} title="Export patients list to CSV">
            📥 Export to CSV
          </button>
          {canManage && (
            <button className="btn btn-primary" onClick={openAddModal}>
              + Register Patient
            </button>
          )}
        </div>
      </div>

      {error && <div className="login-error" style={{ margin: 0 }}>{error}</div>}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Total Patients</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--theme-primary)' }}>{patients.length}</div>
        </div>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Active</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--color-success)' }}>{activeCount}</div>
        </div>
        <div className="widget-card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--theme-text-muted)', marginBottom: '4px' }}>Inactive / Discharged</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--theme-text-muted)' }}>{inactiveCount}</div>
        </div>
      </div>

      {/* 1-Click Status Filter Chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--theme-text-muted)', marginRight: '4px' }}>Quick Status Filter:</span>
        <button className={`btn btn-sm ${filterStatus === '' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterStatus('')}>All Patients ({patients.length})</button>
        <button className={`btn btn-sm ${filterStatus === 'ACTIVE' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterStatus('ACTIVE')}>🟢 Active ({activeCount})</button>
        <button className={`btn btn-sm ${filterStatus === 'INACTIVE' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterStatus('INACTIVE')}>⏸️ Inactive ({inactiveCount})</button>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-item" style={{ minWidth: '200px', flexGrow: 1 }}>
          <label>Search Name or Chart #</label>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="form-control"
              placeholder="Search patients..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
            />
            {filterSearch && (
              <button className="search-clear-btn" onClick={() => setFilterSearch('')}>✕</button>
            )}
          </div>
        </div>
        <div className="filter-item" style={{ minWidth: '150px' }}>
          <label>Status</label>
          <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Patients</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive / Discharged</option>
          </select>
        </div>
        <div className="filter-item" style={{ minWidth: '160px' }}>
          <label>Sort By</label>
          <select 
            className="form-control" 
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-');
              setSortBy(field);
              setSortOrder(order);
            }}
          >
            <option value="name-asc">Patient Name (A–Z)</option>
            <option value="name-desc">Patient Name (Z–A)</option>
            <option value="chartNumber-asc">Chart # (Asc)</option>
            <option value="chartNumber-desc">Chart # (Desc)</option>
            <option value="schedule-asc">Schedule (A–Z)</option>
            <option value="status-asc">Status (Active First)</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedPatient ? '1.5fr 1fr' : '1fr', gap: '24px', transition: 'grid-template-columns 0.3s ease' }}>
        {/* Left Side: Patient Table */}
        <div className="widget-card">
          <div className="widget-header">
            <span className="widget-title">Patient Records</span>
            <span style={{ fontSize: '13px', color: 'var(--theme-text-muted)' }}>{patients.length} records</span>
          </div>
          <div className="widget-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: '24px', color: 'var(--theme-text-muted)' }}>Loading patient records...</p>
            ) : sortedPatients.length === 0 ? (
              <EmptyState
                icon="🧑‍⚕️"
                title="No Patients Registered"
                description="No active dialysis patients are currently registered under these filter criteria. Add a new patient record to get started."
                actionText={canManage ? "Register New Patient" : undefined}
                onAction={canManage ? openAddModal : undefined}
              />
            ) : (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th onClick={() => handleHeaderSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                        Patient Name {renderSortIndicator('name')}
                      </th>
                      <th onClick={() => handleHeaderSort('chartNumber')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                        Chart # {renderSortIndicator('chartNumber')}
                      </th>
                      <th>Diagnosis</th>
                      <th onClick={() => handleHeaderSort('schedule')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                        Schedule {renderSortIndicator('schedule')}
                      </th>
                      <th onClick={() => handleHeaderSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                        Status {renderSortIndicator('status')}
                      </th>
                      {canManage && <th style={{ width: '130px' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPatients
                      .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                      .map(patient => (
                      <tr
                        key={patient.id}
                        onClick={() => handleRowClick(patient.id)}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: selectedPatient?.id === patient.id ? 'var(--theme-primary-bg)' : 'transparent',
                          opacity: patient.status === 'INACTIVE' ? 0.6 : 1,
                        }}
                      >
                        <td>
                          <strong>
                            <HighlightText text={patient.name} search={filterSearch} />
                          </strong>
                        </td>
                        <td>
                          <code>
                            <HighlightText text={patient.chartNumber} search={filterSearch} />
                          </code>
                        </td>
                        <td style={{ fontSize: '13px' }}>{patient.diagnosis || '—'}</td>
                        <td style={{ fontSize: '13px' }}>{patient.schedule || '—'}</td>
                        <td>
                          <span className={`badge ${patient.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`}>
                            {patient.status}
                          </span>
                        </td>
                      {canManage && (
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className="btn btn-sm" onClick={(e) => openEditModal(patient, e)}>Edit</button>
                            <button
                              className={`btn btn-sm ${patient.status === 'ACTIVE' ? 'btn-warning' : 'btn-success'}`}
                              onClick={(e) => handleToggleStatus(patient, e)}
                              title={patient.status === 'ACTIVE' ? 'Archive / Discharge' : 'Reactivate'}
                            >
                              {patient.status === 'ACTIVE' ? 'Archive' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <Pagination
                currentPage={currentPage}
                totalItems={sortedPatients.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
              />
            </>
            )}
          </div>
        </div>

        {/* Right Side: Patient Detail Card */}
        {selectedPatient && (
          <div className="widget-card" style={{ alignSelf: 'start' }}>
            <div className="widget-header">
              <span className="widget-title">📋 Patient Details</span>
              <button
                className="modal-close"
                onClick={() => setSelectedPatient(null)}
                style={{ fontSize: '14px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--theme-text-muted)' }}
              >
                Close ✕
              </button>
            </div>
            <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <span className={`badge ${selectedPatient.status === 'ACTIVE' ? 'badge-success' : 'badge-neutral'}`} style={{ marginBottom: '8px' }}>
                  {selectedPatient.status}
                </span>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold' }}>{selectedPatient.name}</h3>
                <span style={{ fontSize: '12px', color: 'var(--theme-text-muted)' }}>
                  Chart # <code>{selectedPatient.chartNumber}</code>
                </span>
              </div>

              <div style={{ background: 'var(--theme-bg)', padding: '14px 16px', borderRadius: 'var(--border-radius-md)', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div><strong>Diagnosis:</strong> {selectedPatient.diagnosis || 'Not specified'}</div>
                <div><strong>Dialysis Schedule:</strong> {selectedPatient.schedule || 'Not specified'}</div>
                <div><strong>First Session:</strong> {selectedPatient.firstSessionDate ? new Date(selectedPatient.firstSessionDate).toLocaleDateString() : 'Not recorded'}</div>
                <div><strong>Contact / Emergency:</strong> {selectedPatient.contact || 'Not provided'}</div>
                <div><strong>Registered:</strong> {new Date(selectedPatient.createdAt).toLocaleDateString()}</div>
              </div>

              {selectedPatient.status === 'ACTIVE' && (
                <Link
                  to={`/dispense?patientId=${selectedPatient.id}`}
                  className="btn btn-primary btn-sm"
                  style={{ textDecoration: 'none', justifyContent: 'center', padding: '8px 16px' }}
                >
                  💊 Dispense Supplies to {selectedPatient.name}
                </Link>
              )}

              {/* Recent Requisitions */}
              {selectedPatient.requisitions && selectedPatient.requisitions.length > 0 && (
                <div style={{ borderTop: '1px solid var(--theme-border)', paddingTop: '16px' }}>
                  <strong style={{ display: 'block', marginBottom: '10px', fontSize: '14px' }}>
                    Recent Item Requisitions ({selectedPatient.requisitions.length})
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto' }}>
                    {selectedPatient.requisitions.map(req => (
                      <div
                        key={req.id}
                        style={{
                          padding: '10px 12px',
                          background: 'var(--theme-bg)',
                          borderRadius: 'var(--border-radius-md)',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span className={`badge ${
                            req.status === 'FULLY_APPROVED' ? 'badge-success' :
                            req.status === 'REJECTED' ? 'badge-critical' :
                            req.status === 'CANCELLED' ? 'badge-neutral' :
                            'badge-warning'
                          }`}>
                            {req.status.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: 'var(--theme-text-muted)' }}>
                            {new Date(req.sessionDate).toLocaleDateString()}
                          </span>
                        </div>
                        <div style={{ color: 'var(--theme-text-muted)', marginTop: '4px' }}>
                          {req.lines.map(line => (
                            <span key={line.id} style={{ marginRight: '8px' }}>
                              {line.item.name} ×{line.qtyRequested}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPatient.requisitions && selectedPatient.requisitions.length === 0 && (
                <p style={{ fontSize: '12px', color: 'var(--theme-text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--theme-border)', paddingTop: '12px' }}>
                  No requisition history found for this patient.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <span className="modal-title">{modalMode === 'add' ? 'Register New Patient' : 'Edit Patient Record'}</span>
              <button className="modal-close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {formError && <div className="login-error">{formError}</div>}

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Patient Full Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Juan Dela Cruz"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Chart # / Patient ID *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. HHC-2024-001"
                      value={chartNumber}
                      onChange={(e) => setChartNumber(e.target.value)}
                      required
                      disabled={modalMode === 'edit'}
                    />
                    {modalMode === 'edit' && (
                      <span style={{ fontSize: '11px', color: 'var(--theme-text-muted)' }}>Chart number cannot be changed after registration.</span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Diagnosis</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. End-Stage Renal Disease (ESRD)"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Dialysis Schedule</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Mon/Wed/Fri 08:00–12:00"
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date of First Session</label>
                    <input
                      type="date"
                      className="form-control"
                      value={firstSessionDate}
                      onChange={(e) => setFirstSessionDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Contact / Emergency Contact</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. +63 912 345 6789 (Spouse)"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : (modalMode === 'add' ? 'Register Patient' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Patients;
