const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { DEFAULT_ROLE_PERMISSIONS } = require('../lib/permissions');

const listUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, username: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) { next(err); }
};

const getUser = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, username: true, role: true, isActive: true, isDeleted: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
};

const VALID_ROLES = Object.keys(DEFAULT_ROLE_PERMISSIONS);

const createUser = async (req, res, next) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'name, username, password, and role are required' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
    }
    if (req.user.role !== 'TOP_ADMIN' && ['MANAGEMENT_OFFICE', 'TOP_ADMIN', 'INVENTORY_MANAGER'].includes(role)) {
      return res.status(403).json({ error: 'Only Top Admin users can create accounts with Inventory Manager, Management Office, or Top Admin roles' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) return res.status(409).json({ error: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, username, passwordHash, role, createdBy: req.user.id },
    });

    // Create notification for top admin
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        eventType: 'USER_CREATED',
        message: `New account created: ${name} (${role})`,
      },
    });

    res.status(201).json({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    });
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const { name, role } = req.body;
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
    }
    if (role && req.user.role !== 'TOP_ADMIN' && ['MANAGEMENT_OFFICE', 'TOP_ADMIN', 'INVENTORY_MANAGER'].includes(role)) {
      return res.status(403).json({ error: 'Only Top Admin users can assign Inventory Manager, Management Office, or Top Admin roles' });
    }
    // Prevent changing own role (could lock self out of admin)
    if (role && req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isDeleted) return res.status(404).json({ error: 'User not found' });

    if (['TOP_ADMIN', 'MANAGEMENT_OFFICE'].includes(existing.role) && req.user.role !== 'TOP_ADMIN') {
      return res.status(403).json({ error: 'Only Top Admin users can modify Top Admin or Management Office accounts' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, role },
    });

    if (role) {
      await prisma.notification.create({
        data: {
          userId: req.user.id,
          eventType: 'ROLE_CHANGED',
          message: `${user.name}'s role changed to ${role}`,
        },
      });
    }

    res.json({ id: user.id, name: user.name, role: user.role });
  } catch (err) { next(err); }
};

const resetPassword = async (req, res, next) => {
  try {
    const { temporaryPassword } = req.body;
    if (!temporaryPassword || typeof temporaryPassword !== 'string') {
      return res.status(400).json({ error: 'temporaryPassword is required' });
    }
    if (temporaryPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isDeleted) return res.status(404).json({ error: 'User not found' });

    if (['TOP_ADMIN', 'MANAGEMENT_OFFICE'].includes(existing.role) && req.user.role !== 'TOP_ADMIN') {
      return res.status(403).json({ error: 'Only Top Admin users can reset Top Admin or Management Office passwords' });
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash },
    });
    res.json({ message: 'Password reset successfully' });
  } catch (err) { next(err); }
};

const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.isDeleted) return res.status(404).json({ error: 'User not found' });

    if (existing.role === 'TOP_ADMIN') {
      if (req.user.role !== 'TOP_ADMIN') {
        return res.status(403).json({ error: 'Only Top Admin users can delete Top Admin accounts' });
      }
      const otherActiveAdmins = await prisma.user.count({
        where: { role: 'TOP_ADMIN', isDeleted: false, isActive: true, id: { not: req.params.id } }
      });
      if (otherActiveAdmins === 0) {
        return res.status(400).json({ error: 'Cannot delete the last remaining active Top Admin account.' });
      }
    }

    // Soft delete — preserve all history
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isDeleted: true, isActive: false, deletedAt: new Date() },
    });
    res.json({ message: 'User account deleted (data preserved for audit)' });
  } catch (err) { next(err); }
};

const toggleActive = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'TOP_ADMIN') {
      if (req.user.role !== 'TOP_ADMIN') {
        return res.status(403).json({ error: 'Only Top Admin users can modify Top Admin account status' });
      }
      if (user.isActive) {
        const otherActiveAdmins = await prisma.user.count({
          where: { role: 'TOP_ADMIN', isDeleted: false, isActive: true, id: { not: req.params.id } }
        });
        if (otherActiveAdmins === 0) {
          return res.status(400).json({ error: 'Cannot deactivate the last remaining active Top Admin account.' });
        }
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: !user.isActive },
    });
    res.json({ isActive: updated.isActive });
  } catch (err) { next(err); }
};

const listCoVerifiers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        isDeleted: false,
        isActive: true,
        role: { in: ['NURSE', 'SUPPLY_OFFICER', 'INVENTORY_MANAGER', 'TOP_ADMIN'] }
      },
      select: { id: true, name: true, username: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json(users);
  } catch (err) { next(err); }
};

const getUserProfile = async (req, res, next) => {
  try {
    const targetUserId = req.params.id === 'me' ? req.user.id : req.params.id;

    // RBAC: Self access is always allowed. Viewing others requires VIEW_USER_PROFILES or TOP_ADMIN/INVENTORY_MANAGER/MANAGEMENT_OFFICE
    if (targetUserId !== req.user.id) {
      const allowedRoles = ['TOP_ADMIN', 'INVENTORY_MANAGER', 'MANAGEMENT_OFFICE'];
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to view other staff profiles.' });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        isDeleted: true,
        createdAt: true,
        createdBy: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User profile not found.' });

    // Fetch creator details if available
    let creatorName = null;
    if (user.createdBy) {
      const creator = await prisma.user.findUnique({
        where: { id: user.createdBy },
        select: { name: true, username: true }
      });
      if (creator) creatorName = `${creator.name} (@${creator.username})`;
    }

    // Parallel fetch of system-wide activity logs for this user
    const [
      dispenses,
      requisitionsSubmitted,
      requisitionsApproved,
      discards,
      transfers,
      inventoryLogs,
      permissionAudits,
    ] = await Promise.all([
      prisma.dispenseLog.findMany({
        where: { dispensedById: targetUserId },
        include: { item: { select: { name: true, unit: true } }, patient: { select: { name: true, chartNumber: true } } },
        orderBy: { dispensedAt: 'desc' },
        take: 100,
      }),
      prisma.requisition.findMany({
        where: { submittedById: targetUserId },
        include: { patient: { select: { name: true, chartNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.requisition.findMany({
        where: { approvedById: targetUserId },
        include: { patient: { select: { name: true, chartNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.discardLog.findMany({
        where: { loggedById: targetUserId },
        include: { item: { select: { name: true, unit: true } }, batch: { select: { batchNo: true } } },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      prisma.stockTransfer.findMany({
        where: { OR: [{ requestedById: targetUserId }, { approvedById: targetUserId }] },
        include: { item: { select: { name: true, unit: true } } },
        orderBy: { requestedAt: 'desc' },
        take: 100,
      }),
      prisma.transactionLog.findMany({
        where: { userId: targetUserId },
        include: { item: { select: { name: true, unit: true } } },
        orderBy: { timestamp: 'desc' },
        take: 100,
      }),
      prisma.permissionAuditLog.findMany({
        where: { changedById: targetUserId },
        orderBy: { changedAt: 'desc' },
        take: 100,
      }),
    ]);

    // Aggregate into a unified chronological system activity stream
    const activityStream = [];

    dispenses.forEach(d => {
      activityStream.push({
        id: `dispense-${d.id}`,
        category: 'DISPENSE',
        timestamp: d.dispensedAt,
        action: `Dispensed ${d.quantity} ${d.item?.unit || 'unit(s)'} of ${d.item?.name || 'Item'}`,
        details: `Patient: ${d.patient?.name || 'N/A'} (${d.patient?.chartNumber || 'N/A'}) • Billing: ${d.billingStatus}`,
        location: d.location,
      });
    });

    requisitionsSubmitted.forEach(r => {
      activityStream.push({
        id: `req-sub-${r.id}`,
        category: 'REQUISITION',
        timestamp: r.createdAt,
        action: `Submitted Requisition #${r.formNumber || r.id.substring(0, 8)}`,
        details: `Patient: ${r.patient?.name || 'N/A'} • Status: ${r.status} • Form Type: ${r.formType}`,
        location: r.targetLocation || 'ECART',
      });
    });

    requisitionsApproved.forEach(r => {
      activityStream.push({
        id: `req-app-${r.id}`,
        category: 'REQUISITION',
        timestamp: r.updatedAt || r.createdAt,
        action: `Processed/Approved Requisition #${r.formNumber || r.id.substring(0, 8)}`,
        details: `Patient: ${r.patient?.name || 'N/A'} • Status: ${r.status}`,
        location: r.targetLocation || 'ECART',
      });
    });

    discards.forEach(dc => {
      activityStream.push({
        id: `discard-${dc.id}`,
        category: 'DISCARD',
        timestamp: dc.timestamp,
        action: `Logged Discard of ${dc.qty} ${dc.item?.unit || 'unit(s)'} of ${dc.item?.name || 'Item'}`,
        details: `Reason: ${dc.reason} • Batch: ${dc.batch?.batchNo || 'N/A'} • Notes: ${dc.notes || 'None'}`,
        location: dc.location,
      });
    });

    transfers.forEach(tr => {
      const isRequester = tr.requestedById === targetUserId;
      activityStream.push({
        id: `transfer-${tr.id}`,
        category: 'TRANSFER',
        timestamp: tr.requestedAt,
        action: isRequester ? `Requested Inter-Facility Transfer (${tr.fromLocation} → ${tr.toLocation})` : `Approved Inter-Facility Transfer (${tr.fromLocation} → ${tr.toLocation})`,
        details: `Item: ${tr.item?.name || 'Item'} • Qty: ${tr.qty} • Status: ${tr.status}`,
        location: tr.fromLocation,
      });
    });

    inventoryLogs.forEach(tx => {
      if (!['DISPENSE', 'DISCARD'].includes(tx.type)) {
        activityStream.push({
          id: `tx-${tx.id}`,
          category: 'INVENTORY',
          timestamp: tx.timestamp,
          action: `${tx.type} Logged: ${tx.qty} ${tx.item?.unit || 'unit(s)'} of ${tx.item?.name || 'Item'}`,
          details: tx.notes || `Location: ${tx.location}`,
          location: tx.location,
        });
      }
    });

    permissionAudits.forEach(pa => {
      activityStream.push({
        id: `pa-${pa.id}`,
        category: 'SECURITY',
        timestamp: pa.changedAt,
        action: `Security Permission Modified`,
        details: `Target: ${pa.targetType} • Key: ${pa.permissionKey} • Value: ${pa.oldValue ? 'Enabled' : 'Disabled'} → ${pa.newValue ? 'Enabled' : 'Disabled'}`,
        location: 'SYSTEM',
      });
    });

    activityStream.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      user: {
        ...user,
        creatorName,
      },
      summary: {
        totalDispenses: dispenses.length,
        totalRequisitions: requisitionsSubmitted.length + requisitionsApproved.length,
        totalDiscards: discards.length,
        totalTransfers: transfers.length,
      },
      activityStream,
    });
  } catch (err) { next(err); }
};

const changeOwnPassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newHash },
    });

    res.json({ message: 'Password updated successfully.' });
  } catch (err) { next(err); }
};

module.exports = { listUsers, getUser, createUser, updateUser, resetPassword, deleteUser, toggleActive, listCoVerifiers, getUserProfile, changeOwnPassword };
