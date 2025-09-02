// controllers/MessageRealTimeController.js
import { getBufferedMessages } from '../mqttHandler.js';

/**
 * Calcula o intervalo de tempo para o dia atual (00:00 a 23:59:59) no horário de Brasília (UTC-3)
 * e converte para timestamps UTC.
 */
function getDayTimestampsInUTC() {
  const now = new Date();

  // Ajusta para o horário de Brasília (UTC-3)
  const brNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

  // Início do dia (00:00:00) no horário de Brasília
  const startOfDay = new Date(brNow);
  startOfDay.setHours(0, 0, 0, 0);

  // Fim do dia (23:59:59) no horário de Brasília
  const endOfDay = new Date(brNow);
  endOfDay.setHours(23, 59, 59, 999);

  // Retorna os timestamps UTC
  return {
    sinceTs: startOfDay.getTime(),
    untilTs: endOfDay.getTime(),
  };
}

const MessageRealTimeController = {
  /**
   * Endpoint para obter mensagens do buffer.
   * Suporta retornar apenas mensagens do dia atual no horário de Brasília.
   */
  async getRealTimeMessages(req, res) {
    try {
      const { numero_serial, sinceTs, untilTs, limit } = req.body || {};

      // Calcula os timestamps do dia atual no horário de Brasília, caso os filtros não sejam fornecidos
      const { sinceTs: defaultSince, untilTs: defaultUntil } = getDayTimestampsInUTC();

      const filters = {
        numero_serial: numero_serial || undefined, // string ou array
        sinceTs: sinceTs ? Number(sinceTs) : defaultSince,
        untilTs: untilTs ? Number(untilTs) : defaultUntil,
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