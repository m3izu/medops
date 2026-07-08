const prisma = require('../lib/prisma');

const getLogs = async (req, res, next) => {
  try {
    const { from, to, type, limit = 100 } = req.query;
    const where = {};
    if (type) where.type = type;
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

    const logs = await prisma.transactionLog.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, sku: true, unit: true } },
        user: { select: { id: true, name: true, role: true } },
        batch: { select: { batchNo: true, expiryDate: true } },
        mgmtComments: {
          include: { commentedBy: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: parsedLimit,
    });
    res.json(logs);
  } catch (err) { next(err); }
};

const addComment = async (req, res, next) => {
  try {
    const { commentText, isFlagged } = req.body;
    if (!commentText) return res.status(400).json({ error: 'commentText is required' });

    const comment = await prisma.mgmtComment.create({
      data: {
        transactionLogId: req.params.logId,
        commentText,
        isFlagged: isFlagged ?? false,
        commentedById: req.user.id,
      },
    });

    // Notify clinic managers when management leaves a comment
    if (isFlagged) {
      const managers = await prisma.user.findMany({
        where: { role: { in: ['TOP_ADMIN', 'INVENTORY_MANAGER'] }, isActive: true, isDeleted: false },
        select: { id: true },
      });
      await prisma.notification.createMany({
        data: managers.map(m => ({
          userId: m.id,
          eventType: 'MGMT_COMMENT_FLAGGED',
          message: `Management Office flagged a transaction log entry`,
          link: `/stock/transactions`,
        })),
      });
    }

    res.status(201).json(comment);
  } catch (err) { next(err); }
};

const toggleFlag = async (req, res, next) => {
  try {
    const comment = await prisma.mgmtComment.findUnique({ where: { id: req.params.commentId } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    const updated = await prisma.mgmtComment.update({
      where: { id: req.params.commentId },
      data: { isFlagged: !comment.isFlagged },
    });
    res.json({ isFlagged: updated.isFlagged });
  } catch (err) { next(err); }
};

module.exports = { getLogs, addComment, toggleFlag };
