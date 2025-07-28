/**
 * Serviço de E-mail para o sistema NewCAM
 * Gerencia envio de e-mails usando SendGrid ou SMTP
 */

import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { logger } from '../config/logger.js';
import crypto from 'crypto';
import { supabase } from '../config/database.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeEmailService();
  }

  /**
   * Inicializar serviço de e-mail
   */
  async initializeEmailService() {
    try {
      // Verificar se SendGrid está configurado
      if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY !== 'your-sendgrid-api-key') {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        this.emailProvider = 'sendgrid';
        this.isConfigured = true;
        logger.info('EmailService inicializado com SendGrid');
        return;
      }

      // Verificar se SMTP está configurado
      if (process.env.SMTP_HOST && process.env.SMTP_HOST !== 'smtp.example.com') {
        this.transporter = nodemailer.createTransporter({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        // Verificar conexão SMTP
        await this.transporter.verify();
        this.emailProvider = 'smtp';
        this.isConfigured = true;
        logger.info('EmailService inicializado com SMTP');
        return;
      }

      logger.warn('Nenhum provedor de e-mail configurado. E-mails não serão enviados.');
      this.isConfigured = false;

    } catch (error) {
      logger.error('Erro ao inicializar EmailService:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Enviar e-mail genérico
   */
  async sendEmail(to, subject, htmlContent, textContent = null) {
    if (!this.isConfigured) {
      logger.warn('Tentativa de envio de e-mail sem configuração válida');
      return { success: false, error: 'Serviço de e-mail não configurado' };
    }

    try {
      const fromEmail = process.env.FROM_EMAIL || 'noreply@newcam.com';
      const fromName = process.env.FROM_NAME || 'NewCAM System';

      if (this.emailProvider === 'sendgrid') {
        const msg = {
          to,
          from: {
            email: fromEmail,
            name: fromName
          },
          subject,
          html: htmlContent,
          text: textContent || this.stripHtml(htmlContent)
        };

        await sgMail.send(msg);
      } else if (this.emailProvider === 'smtp') {
        const mailOptions = {
          from: `"${fromName}" <${fromEmail}>`,
          to,
          subject,
          html: htmlContent,
          text: textContent || this.stripHtml(htmlContent)
        };

        await this.transporter.sendMail(mailOptions);
      }

      logger.info(`E-mail enviado com sucesso para: ${to}`);
      return { success: true };

    } catch (error) {
      logger.error('Erro ao enviar e-mail:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar e-mail de reset de senha
   */
  async sendPasswordResetEmail(userEmail, userName) {
    try {
      // Gerar token de reset
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      // Salvar token no banco de dados
      const { error } = await supabase
        .from('password_reset_tokens')
        .upsert({
          email: userEmail,
          token: resetToken,
          expires_at: resetTokenExpiry.toISOString(),
          used: false,
          created_at: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      // Construir URL de reset
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      // Template do e-mail
      const subject = 'Reset de Senha - NewCAM';
      const htmlContent = this.getPasswordResetTemplate(userName, resetUrl);

      // Enviar e-mail
      const result = await this.sendEmail(userEmail, subject, htmlContent);

      if (result.success) {
        logger.info(`E-mail de reset de senha enviado para: ${userEmail}`);
      }

      return result;

    } catch (error) {
      logger.error('Erro ao enviar e-mail de reset de senha:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verificar token de reset de senha
   */
  async verifyResetToken(token) {
    try {
      const { data: tokenData, error } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !tokenData) {
        return { valid: false, error: 'Token inválido ou expirado' };
      }

      return { valid: true, email: tokenData.email };

    } catch (error) {
      logger.error('Erro ao verificar token de reset:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Marcar token como usado
   */
  async markTokenAsUsed(token) {
    try {
      const { error } = await supabase
        .from('password_reset_tokens')
        .update({ used: true, used_at: new Date().toISOString() })
        .eq('token', token);

      if (error) {
        throw error;
      }

      return { success: true };

    } catch (error) {
      logger.error('Erro ao marcar token como usado:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar e-mail de boas-vindas
   */
  async sendWelcomeEmail(userEmail, userName, temporaryPassword = null) {
    const subject = 'Bem-vindo ao NewCAM';
    const htmlContent = this.getWelcomeTemplate(userName, temporaryPassword);

    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  /**
   * Enviar e-mail de alerta
   */
  async sendAlertEmail(userEmail, alertType, alertMessage, cameraName = null) {
    const subject = `Alerta NewCAM: ${alertType}`;
    const htmlContent = this.getAlertTemplate(alertType, alertMessage, cameraName);

    return await this.sendEmail(userEmail, subject, htmlContent);
  }

  /**
   * Template de reset de senha
   */
  getPasswordResetTemplate(userName, resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Reset de Senha - NewCAM</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>NewCAM</h1>
          </div>
          <div class="content">
            <h2>Reset de Senha</h2>
            <p>Olá ${userName},</p>
            <p>Você solicitou o reset da sua senha. Clique no botão abaixo para criar uma nova senha:</p>
            <a href="${resetUrl}" class="button">Resetar Senha</a>
            <p>Este link é válido por 1 hora. Se você não solicitou este reset, ignore este e-mail.</p>
            <p>Se o botão não funcionar, copie e cole este link no seu navegador:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
          </div>
          <div class="footer">
            <p>© 2024 NewCAM. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Template de boas-vindas
   */
  getWelcomeTemplate(userName, temporaryPassword) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Bem-vindo ao NewCAM</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Bem-vindo ao NewCAM</h1>
          </div>
          <div class="content">
            <h2>Olá ${userName}!</h2>
            <p>Sua conta foi criada com sucesso no sistema NewCAM.</p>
            ${temporaryPassword ? `
              <p><strong>Senha temporária:</strong> ${temporaryPassword}</p>
              <p>Por favor, altere sua senha no primeiro login.</p>
            ` : ''}
            <p>Você pode acessar o sistema através do link:</p>
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}">${process.env.FRONTEND_URL || 'http://localhost:3000'}</a></p>
          </div>
          <div class="footer">
            <p>© 2024 NewCAM. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Template de alerta
   */
  getAlertTemplate(alertType, alertMessage, cameraName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Alerta NewCAM</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Alerta NewCAM</h1>
          </div>
          <div class="content">
            <h2>Tipo: ${alertType}</h2>
            ${cameraName ? `<p><strong>Câmera:</strong> ${cameraName}</p>` : ''}
            <p><strong>Mensagem:</strong> ${alertMessage}</p>
            <p><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>
          </div>
          <div class="footer">
            <p>© 2024 NewCAM. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Remover HTML de texto
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Verificar se serviço está configurado
   */
  isEmailConfigured() {
    return this.isConfigured;
  }
}

export default new EmailService();