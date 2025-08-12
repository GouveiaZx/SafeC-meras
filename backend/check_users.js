import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUsers() {
  try {
    console.log('Fazendo login com usuário existente...');
    
    const testEmail = 'admin@newcam.com';
    const testPassword = 'admin123456';
    
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    
    if (signInError) {
      console.error('❌ Erro no login:', signInError.message);
    } else {
      console.log('✅ Login realizado com sucesso!');
      console.log('User ID:', signInData.user.id);
      console.log('Email:', signInData.user.email);
      console.log('Token completo:', signInData.session.access_token);
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

checkUsers();