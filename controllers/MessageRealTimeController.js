// MessageRealTimeController.js
import { getBufferedMessages, getStats } from '../mqttHandler.js';

const MessageRealTimeController = {
  // Retorna mensagens filtradas do buffer
  async getRealTimeMessages(req, res) {
    try {
      const { numero_serial, sinceTs, untilTs, limit } = req.body;

      const messages = getBufferedMessages({
        numero_serial: String(numero_serial || '').trim() || null,
        sinceTs: sinceTs ? Number(sinceTs) : undefined,
        untilTs: untilTs ? Number(untilTs) : undefined,
        limit: limit ? Number(limit) : 200,
      });

      return res.json({
        ok: true,
        count: messages.length,
        messages,
      });
    } catch (err) {
      console.error('Erro ao listar mensagens:', err.message);
      return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
  },

  // Retorna as estatísticas do consumidor
  async getStats(req, res) {
    try {
      const stats = getStats();
      return res.json({ ok: true, stats });
    } catch (err) {
      console.error('Erro ao obter estatísticas:', err.message);
      return res.status(500).json({ ok: false, error: 'Erro interno.' });
    }
  },
};

export default MessageRealTimeController;