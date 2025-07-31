import { pool } from '../app.js';
import User from '../models/User.js';
import checkToken from '../middleware/auth.js'; // Importa o middleware

const UserFilterMetadataController = {
  async getUserMachinesMetadata(req, res) {
    
    // --- INÍCIO DA LÓGICA DO TOKEN INTEGRADA ---
    // Simula o que o middleware faria.
    // É melhor que a função checkToken retorne o usuário ou lance um erro.
    // Exemplo de como poderia ser:
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'Acesso negado.' });
        }
        const decoded = jwt.verify(token, process.env.SECRET);
        req.user = { id: decoded.id }; // Adiciona o usuário ao request
    } catch (error) {
        return res.status(400).json({ message: 'Token inválido.' });
    }
    // --- FIM DA LÓGICA DO TOKEN ---

    const userId = req.user.id; 

    if (!userId) {
      // Esta verificação se torna redundante se a lógica acima já tratar isso.
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    try {
      // 1. Obter o codigoHex do usuário logado
      const user = await User.findById(userId).select('codigoHex');
      if (!user || !user.codigoHex) {
        return res.status(404).json({ message: 'Usuário não encontrado ou sem dispositivo associado.' });
      }
      const userCodigoHex = user.codigoHex;

      // 2. Obter o CNPJ
      const cnpjResult = await pool.query(
        'SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = $1',
        [userCodigoHex]
      );
      if (cnpjResult.rows.length === 0) {
        return res.status(404).json({ message: 'Dispositivo do usuário não encontrado.' });
      }
      const userCnpj = cnpjResult.rows[0].cnpj;

      // 3. Obter todos os dispositivos
      const devicesResult = await pool.query(
        'SELECT DISTINCT id_maquina, codigo_hex FROM dispositivo_esp32 WHERE cnpj = $1 AND id_maquina IS NOT NULL',
        [userCnpj]
      );

      const allowedMachineIds = devicesResult.rows.map(row => row.id_maquina);
      const allowedCodigoHexes = devicesResult.rows.map(row => row.codigo_hex);

      res.json({
        cnpj: userCnpj,
        allowedMachineIds,
        allowedCodigoHexes
      });

    } catch (error) {
      console.error('Erro ao buscar metadados de máquina do usuário:', error);
      res.status(500).json({ message: 'Erro interno ao buscar metadados de máquina.' });
    }
  }
};

export default UserFilterMetadataController;