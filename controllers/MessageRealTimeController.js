// controllers/MessageRealTimeController.js
import { getBufferedMessages } from '../mqttHandler.js';

const MessageRealTimeController = {
  async getRealTimeMessages(req, res) {
    try {
      const { numero_serial, sinceTs, untilTs, limit } = req.body || {};

      const filters = {
        numero_serial: numero_serial || undefined, // string ou array
        sinceTs: sinceTs ? Number(sinceTs) : undefined,
        untilTs: untilTs ? Number(untilTs) : undefined,
        limit: limit ? Number(limit) : undefined,
      };

      const data = getBufferedMessages(filters);

      return res.status(200).json({
        ok: true,
        count: data.length,
        data,
      });
    } catch (err) {
      console.error('[MessageRealTimeController] Erro:', err?.message);
      return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
  },
};

export default MessageRealTimeController;