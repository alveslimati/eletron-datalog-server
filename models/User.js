import mongoose from 'mongoose';

// Definindo o esquema do usuário
// O esquema define a estrutura dos documentos que serão armazenados na coleção "users"
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  nomeEmpresa: { type: String },
  codigoHex: { type: String, unique: true },	
  lastLogin: { type: Date, default: null },
});

const User = mongoose.model('User', UserSchema);
export default User;