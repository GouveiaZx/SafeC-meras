import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function confirmUser() {
  try {
    console.log('Confirmando email do usuário...');
    
    const email = 'admin@newcam.com';
    
    // Usar a Admin API para confirmar o email
    const { data, error } = await supabase.auth.admin.updateUserById(
      // Primeiro precisamos encontrar o ID do usuário
      // Vamos usar uma abordagem diferente
    );
    
    // Alternativa: usar SQL direto para confirmar o email
    const { data: updateResult, error: updateError } = await supabase
      .rpc('confirm_user_email', { user_email: email });
    
    if (updateError) {
      console.log('Tentando abordagem alternativa...');
      
      // Criar uma função SQL para confirmar o email
      const confirmSql = `
        UPDATE auth.users 
        SET email_confirmed_at = NOW(), 
            confirmed_at = NOW()
        WHERE email = '${email}' 
        AND email_confirmed_at IS NULL;
      `;
      
      console.log('Executando SQL para confirmar email...');
      console.log('Nota: Esta operação requer privilégios administrativos.');
      
      // Como não podemos executar SQL diretamente, vamos tentar uma abordagem diferente
      console.log('\n⚠️  Para confirmar o email manualmente:');
      console.log('1. Acesse o painel do Supabase');
      console.log('2. Vá para Authentication > Users');
      console.log(`3. Encontre o usuário ${email}`);
      console.log('4. Clique nos três pontos e selecione "Confirm email"');
      console.log('\nOu execute este SQL no SQL Editor:');
      console.log(confirmSql);
      
    } else {
      console.log('✅ Email confirmado com sucesso!');
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

confirmUser();