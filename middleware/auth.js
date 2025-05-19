// middleware/auth.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config(); // Carrega as variáveis de ambiente

function checkToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Espera o formato "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ message: 'Acesso negado! Token não fornecido.' });
  }

  try {
    // Verifica o token usando o segredo definido no .env
    jwt.verify(token, process.env.SECRET, (err, decoded) => {
      if (err) {
        // Se houver erro na verificação (token inválido, expirado, etc.)
        console.error("Erro na verificação do token:", err.message);
        return res.status(403).json({ message: 'Token inválido ou expirado!' });
      }

      // Se o token for válido, o payload (decoded) contém o ID do usuário
      req.user = decoded; // Adiciona as informações do usuário ao objeto request
      next(); // Continua para o próximo middleware ou handler de rota
    });
  } catch (error) {
    // Captura erros inesperados durante o processo de verificação
    console.error("Erro inesperado na verificação do token:", error);
    return res.status(401).json({ message: 'Erro na autenticação.' });
  }
}

export default checkToken;