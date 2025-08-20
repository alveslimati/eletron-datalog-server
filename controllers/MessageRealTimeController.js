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

      // Função para calcular o dia atual em UTC-3
      const getCurrentDateInUTC3 = () => {
        const now = new Date();
        now.setHours(now.getHours() - 3); // Ajusta para UTC-3
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Apenas ano/mês/dia
      };

      const currentUTC3Date = getCurrentDateInUTC3();

      // Filtra mensagens que pertencem ao dia atual em UTC-3 e para os `allowedCodigoHexes`
      const filteredMessages = allMessages.filter(msg => {
        // Verifica se `msg.timestamp` é válido
        const messageTimestamp = new Date(msg.timestamp);
        if (isNaN(messageTimestamp.getTime())) {
          return false; // Ignora mensagens com timestamp inválido
        }

        // Verifica se a mensagem é do mesmo dia (UTC-3)
        const adjustedMessageDate = new Date(
          messageTimestamp.getFullYear(),
          messageTimestamp.getMonth(),
          messageTimestamp.getDate()
        );

        const isSameDay = adjustedMessageDate.getTime() === currentUTC3Date.getTime();

        // Verifica `numero_serial` e permissões
        return isSameDay && msg.numero_serial && allowedSet.has(String(msg.numero_serial));
      });

      res.json(filteredMessages); // Retorna apenas mensagens filtradas
    } catch (error) {
      console.error('Erro ao buscar mensagens em tempo real:', error);
      res.status(500).json({ message: 'Erro interno ao processar a solicitação.' });
    }
  }
};

export default MessageRealTimeController;