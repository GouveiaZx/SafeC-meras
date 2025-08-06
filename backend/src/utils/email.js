import nodemailer from 'nodemailer';

/**
 * Configuração do transportador de email
 */
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true para 465, false para outras portas
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

/**
 * Enviar email de alerta
 * @param {Object} options - Opções do email
 * @param {string} options.to - Destinatário
 * @param {string} options.subject - Assunto
 * @param {string} options.text - Texto do email
 * @param {string} options.html - HTML do email
 * @returns {Promise<Object>} Resultado do envio
 */
export const sendAlert = async (options) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    const result = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: result.messageId,
      response: result.response
    };
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Enviar email de relatório
 * @param {Object} options - Opções do email
 * @param {string} options.to - Destinatário
 * @param {string} options.subject - Assunto
 * @param {string} options.text - Texto do email
 * @param {string} options.html - HTML do email
 * @param {Array} options.attachments - Anexos
 * @returns {Promise<Object>} Resultado do envio
 */
export const sendReport = async (options) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments || []
    };

    const result = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: result.messageId,
      response: result.response
    };
  } catch (error) {
    console.error('Erro ao enviar relatório por email:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Verificar configuração de email
 * @returns {Promise<boolean>} True se a configuração está válida
 */
export const verifyEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Configuração de email inválida:', error);
    return false;
  }
};

/**
 * Gerar template HTML para alertas
 * @param {Object} data - Dados do alerta
 * @returns {string} HTML do template
 */
export const generateAlertTemplate = (data) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Alerta NewCAM</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #dc3545; color: white; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .content { line-height: 1.6; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        .alert-high { border-left: 4px solid #dc3545; }
        .alert-medium { border-left: 4px solid #ffc107; }
        .alert-low { border-left: 4px solid #28a745; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>🚨 Alerta NewCAM</h2>
        </div>
        <div class="content alert-${data.severity || 'medium'}">
          <h3>${data.title || 'Alerta do Sistema'}</h3>
          <p><strong>Tipo:</strong> ${data.type || 'Sistema'}</p>
          <p><strong>Severidade:</strong> ${data.severity || 'Média'}</p>
          <p><strong>Data/Hora:</strong> ${data.timestamp || new Date().toLocaleString('pt-BR')}</p>
          <p><strong>Descrição:</strong></p>
          <p>${data.message || 'Sem descrição disponível'}</p>
          ${data.details ? `<p><strong>Detalhes:</strong></p><pre>${JSON.stringify(data.details, null, 2)}</pre>` : ''}
        </div>
        <div class="footer">
          <p>Este é um email automático do sistema NewCAM. Não responda a este email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Gerar template HTML para relatórios
 * @param {Object} data - Dados do relatório
 * @returns {string} HTML do template
 */
export const generateReportTemplate = (data) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Relatório NewCAM</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #007bff; color: white; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
        .content { line-height: 1.6; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background-color: #f8f9fa; padding: 15px; border-radius: 4px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .metric-label { font-size: 14px; color: #666; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>📊 Relatório NewCAM</h2>
          <p>Período: ${data.period || 'Não especificado'}</p>
        </div>
        <div class="content">
          <h3>${data.title || 'Relatório do Sistema'}</h3>
          
          ${data.metrics ? `
            <div class="metrics">
              ${Object.entries(data.metrics).map(([key, value]) => `
                <div class="metric">
                  <div class="metric-value">${value}</div>
                  <div class="metric-label">${key}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${data.summary ? `
            <h4>Resumo</h4>
            <p>${data.summary}</p>
          ` : ''}
          
          ${data.details ? `
            <h4>Detalhes</h4>
            <pre>${JSON.stringify(data.details, null, 2)}</pre>
          ` : ''}
          
          ${data.table ? `
            <h4>Dados Detalhados</h4>
            <table>
              <thead>
                <tr>
                  ${data.table.headers.map(header => `<th>${header}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${data.table.rows.map(row => `
                  <tr>
                    ${row.map(cell => `<td>${cell}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}
        </div>
        <div class="footer">
          <p>Relatório gerado automaticamente pelo sistema NewCAM em ${new Date().toLocaleString('pt-BR')}.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Alias para sendAlert para compatibilidade
 */
export const sendEmail = sendAlert;

export default {
  sendAlert,
  sendEmail,
  sendReport,
  verifyEmailConfig,
  generateAlertTemplate,
  generateReportTemplate
};