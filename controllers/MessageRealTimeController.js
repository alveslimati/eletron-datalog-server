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
   * Endpoint para obter mensagens do buffer, filtradas pelo número serial 
   * (lista de códigos permitidos para o usuário atual).
   */
  async getRealTimeMessages(req, res) {
    try {
      const { allowedCodigoHexes, sinceTs, untilTs, limit } = req.body || {};

      // Valida os códigos permitidos
      if (!Array.isArray(allowedCodigoHexes) || allowedCodigoHexes.length === 0) {
        return res
          .status(400)
          .json({ message: 'A propriedade "allowedCodigoHexes" deve ser um array não vazio.' });
      }

      // Garantimos que o allowedCodigoHexes seja tratado como um Set (otimiza o filtro abaixo)
      const allowedSet = new Set(allowedCodigoHexes);

      // Calcula os timestamps do dia atual no horário de Brasília, caso os filtros não sejam fornecidos
      const { sinceTs: defaultSince, untilTs: defaultUntil } = getDayTimestampsInUTC();

      const filters = {
        sinceTs: sinceTs ? Number(sinceTs) : defaultSince,
        untilTs: untilTs ? Number(untilTs) : defaultUntil,
        limit: limit ? Number(limit) : undefined,
      };

      // Busca mensagens no buffer
      const allMessages = getBufferedMessages(filters);

      // Filtra as mensagens pelo número serial permitido
      const filteredMessages = allMessages.filter(
        (msg) => msg.numero_serial && allowedSet.has(String(msg.numero_serial))
      );

      return res.status(200).json({
        ok: true,
        count: filteredMessages.length,
        data: filteredMessages,
      });
    } catch (err) {
      console.error('[MessageRealTimeController] Erro:', err?.message);
      return res.status(500).json({ ok: false, error: 'Erro interno ao processar a solicitação.' });
    }
  },
};

export default MessageRealTimeController;