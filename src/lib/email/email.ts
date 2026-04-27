import { HttpStatus, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { envs } from "src/config";
import { RpcException } from "@nestjs/microservices";
import { EMAIL, SendEmailParams } from "./email.types";
import { contractExpiresSoonEmail } from "./templates/contract-expired-sooner.email";

export class EmailService {
  private readonly resendClient: Resend;
  private readonly logger = new Logger(EmailService.name);
  
  constructor() {
    this.resendClient = new Resend(envs.resendApiKey);
  }

  /**
   * Send email
   * @param type
   * @param email
   * @param params
   */

  async sendEmail(emailParams: SendEmailParams){
    try {
      const { html, subject } = this.getEmailContent(emailParams);
      const toEmail = this.getRecipientEmail(emailParams);

      this.logger.log(`Enviando email a: ${toEmail}`);

      const { data, error } = await this.resendClient.emails.send({
        from: `${envs.emailFrom} <${envs.emailFromAddress}>`,
        to: [toEmail],
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Error al enviar email: ${error.message}`);
        throw new InternalServerErrorException(
          `Error al enviar el email: ${error.message}`
        );
      }

      this.logger.log(`Email enviado exitosamente. ID: ${data?.id}`);
    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: "Error al procesar el envío del email",
      });
    }
  }

  private getEmailContent(emailParams: SendEmailParams): { html: string; subject: string } {
    switch (emailParams.type) {
      case EMAIL.CONTRACT_EXPIRES_SOON:
        return {
          html: contractExpiresSoonEmail(emailParams.params),
          subject: `Alerta: contrato de ${emailParams.params.employeeName} vence en ${emailParams.params.daysLeft} día${emailParams.params.daysLeft !== 1 ? 's' : ''}`,
        };
      default:
        throw new InternalServerErrorException("Tipo de email no reconocido");
    }
  }

  private getRecipientEmail(emailParams: SendEmailParams): string {
    switch (emailParams.type) {
      case EMAIL.CONTRACT_EXPIRES_SOON:
        return emailParams.params.adminEmail;
      default:
        throw new InternalServerErrorException(
          "No se pudo determinar el destinatario del email"
        );
    }
  }
}