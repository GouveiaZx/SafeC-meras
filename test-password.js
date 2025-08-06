import bcrypt from 'bcryptjs';

const hash = '$2a$12$TcHbGYmx2lyKY9cuI3Hf0evubgwis4WbQG2wsDYa8gATi4QvEXBWm';
const password = 'Teste123';

try {
  const result = await bcrypt.compare(password, hash);
  console.log('Senha válida:', result);
} catch (err) {
  console.error('Erro bcrypt:', err);
}