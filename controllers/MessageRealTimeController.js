// MessageRealTimeController.js
import {
  publishToQueue,
  getBufferedMessages,
  getStats,
} from '../mqttHandler.js';

const MAX_LIMIT_DEFAULT = 200;

const MessageRealTimeController = {
  // Publica uma mensagem na fila principal (opcional, se seu projeto usa isso)
  async publishToQueue(req, res) {
    try {
      const message = req.body || {};
      await publishToQueue(message);
      return res.json({ ok: true });
    } catch (err) {
      console.error('Erro ao publicar:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Erro ao publicar na fila.' });
    }
  },

  // Mantida conforme seu formato solicitado
  async getRealTimeMessages(req, res) {
    try {
      const { numero_serial, sinceTs, untilTs, limit } = req.body;

      const messages = getBufferedMessages({
        numero_serial: String(numero_serial || '').trim() || null,
        sinceTs: sinceTs ? Number(sinceTs) : undefined,
        untilTs: untilTs ? Number(untilTs) : undefined,
        limit: limit ? Number(limit) : MAX_LIMIT_DEFAULT,
      });

      // nextSinceTs para facilitar paginação temporal (opcional)
      const lastTs = messages.length ? messages[messages.length - 1].ts : undefined;

      return res.json({
        ok: true,
        count: messages.length,
        messages,
        nextSinceTs: lastTs,
      });
    } catch (err) {
      console.error('Erro em getRealTimeMessages:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
  },

  // Estatísticas do consumidor e buffer
  async getStats(req, res) {
    try {
      const stats = getStats();
      return res.json({ ok: true, stats });
    } catch (err) {
      console.error('Erro ao obter estatísticas:', err?.message || err);
      return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
  },
};

export default MessageRealTimeController;