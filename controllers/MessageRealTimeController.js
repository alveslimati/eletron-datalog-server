const MessageRealTimeController = {
  async getRealTimeMessages(req, res) {
    try {
      const { allowedCodigoHexes } = req.body;

      if (!Array.isArray(allowedCodigoHexes)) {
        return res.status(400).json({ message: 'A propriedade "allowedCodigoHexes" deve ser um array.' });
      }
      
      if (allowedCodigoHexes.length === 0) {
        return res.json([]); // Retorna vazio se nenhuma permissão é fornecida
      }

      const allMessages = req.app.locals.messages || []; // Mensagens carregadas no app
      const allowedSet = new Set(allowedCodigoHexes);

      // Função para calcular o início e o fim do dia atual em UTC-3
      const getUTC3DayRange = () => {
        const now = new Date();
        now.setHours(now.getHours() - 3); // Ajusta para UTC-3
        
        // Início do dia (00:00:00)
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        
        // Fim do dia (23:59:59)
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        
        return { startOfDay, endOfDay };
      };

      const { startOfDay, endOfDay } = getUTC3DayRange();

      console.log(
        `[DEBUG] Intervalo UTC-3 - Início do dia: ${startOfDay.toISOString()}, Fim do dia: ${endOfDay.toISOString()}`
      );

      // Filtra mensagens no intervalo do dia atual em UTC-3 e com `allowedCodigoHexes`
      const filteredMessages = allMessages.filter((msg) => {
        // Verifica se `msg.timestamp` é válido
        const messageTimestamp = new Date(msg.timestamp);
        if (isNaN(messageTimestamp.getTime())) {
          return false; // Ignora mensagens com timestamp inválido
        }

        // Verifica se o timestamp está dentro do intervalo de início/fim do dia UTC-3
        const isInDayRange =
          messageTimestamp >= startOfDay && messageTimestamp <= endOfDay;

        // Verifica o `numero_serial` e se tem permissão (allowedCodigoHexes)
        return isInDayRange && msg.numero_serial && allowedSet.has(String(msg.numero_serial));
      });

      res.json(filteredMessages); // Retorna as mensagens filtradas
    } catch (error) {
      console.error('Erro ao buscar mensagens em tempo real:', error);
      res.status(500).json({ message: 'Erro interno ao processar a solicitação.' });
    }
  },
};

export default MessageRealTimeController;