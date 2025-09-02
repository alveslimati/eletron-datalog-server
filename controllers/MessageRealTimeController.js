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

      // Valida os códigos permitidos (mantido)
      if (!Array.isArray(allowedCodigoHexes) || allowedCodigoHexes.length === 0) {
        return res
          .status(400)
          .json({ message: 'A propriedade "allowedCodigoHexes" deve ser um array não vazio.' });
      }

      // NORMALIZA allowedCodigoHexes: trim + lowerCase e usa Set (alteração mínima)
      const allowedSet = new Set(
        allowedCodigoHexes
          .map((hex) => String(hex).trim().toLowerCase())
          .filter(Boolean)
      );

      // Calcula os timestamps do dia atual no horário de Brasília, caso os filtros não sejam fornecidos
      const { sinceTs: defaultSince, untilTs: defaultUntil } = getDayTimestampsInUTC();

      const filters = {
        sinceTs: sinceTs ? Number(sinceTs) : defaultSince,
        untilTs: untilTs ? Number(untilTs) : defaultUntil,
        limit: limit ? Number(limit) : undefined,
      };

      // Busca mensagens no buffer
      const allMessages = getBufferedMessages(filters);

      // Extrator resiliente do numero_serial (root ou dentro de payload; payload pode ser string JSON)
      function getNumeroSerial(msg) {
        if (!msg) return null;

        // Tenta direto no root
        const rootSerial =
          msg.numero_serial ?? msg.Numero_Serial ?? msg.serial ?? msg.device_id;
        if (rootSerial != null) return String(rootSerial).trim().toLowerCase();

        // Tenta dentro de payload
        let p = msg.payload;
        if (typeof p === 'string') {
          try {
            p = JSON.parse(p);
          } catch (e) {
            // payload não é JSON válido; segue
          }
        }
        if (p && typeof p === 'object') {
          const fromPayload =
            p.numero_serial ?? p.Numero_Serial ?? p.serial ?? p.device_id;
          if (fromPayload != null) return String(fromPayload).trim().toLowerCase();
        }

        return null;
        }

      // Filtra as mensagens pelo número serial permitido (comparação normalizada e Set.has)
      const filteredMessages = allMessages.filter((msg) => {
        const serial = getNumeroSerial(msg);
        const isAllowed = !!serial && allowedSet.has(serial);
        if (!isAllowed) {
          console.log(
            `[DEBUG] Mensagem ignorada. Numero_serial: "${serial ?? ''}", Permitidos: ${[...allowedSet]}`
          );
        }
        return isAllowed;
      });

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