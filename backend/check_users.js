import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUsers() {
  try {
    console.log('Criando usuário de teste...');
    
    // Tentar criar um usuário de teste
    const testEmail = 'admin@newcam.com';
    const testPassword = 'admin123456';
    
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    });
    
    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        console.log('✅ Usuário de teste já existe:', testEmail);
        console.log('Tentando fazer login...');
        
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: testPassword,
        });
        
        if (signInError) {
          console.error('❌ Erro no login:', signInError.message);
        } else {
          console.log('✅ Login realizado com sucesso!');
          console.log('Token:', signInData.session.access_token.substring(0, 50) + '...');
        }
      } else {
        console.error('❌ Erro ao criar usuário:', signUpError.message);
      }
    } else {
      console.log('✅ Usuário criado com sucesso!');
      console.log('Email:', testEmail);
      console.log('Password:', testPassword);
      if (signUpData.session) {
        console.log('Token:', signUpData.session.access_token.substring(0, 50) + '...');
      }
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

checkUsers();