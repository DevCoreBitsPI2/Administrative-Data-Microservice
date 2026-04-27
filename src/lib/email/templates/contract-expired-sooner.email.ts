import { header } from './layout/header';
import { footer } from './layout/footer';
import { ContractExpiresSoonParams } from '../email.types';

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  'fixed_term_contract':            'Término fijo',
  'indefinite_term_contract':       'Término indefinido',
  'work_or_project_based_contract': 'Obra o labor',
  'temporary_contract':             'Temporal',
  'apprenticeship_contract':        'Aprendizaje',
  'service_provision_contract':     'Prestación de servicios',
};

const formatDate = (date: Date) =>
  new Date(date).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const urgencyColor = (daysLeft: number) => {
  if (daysLeft <= 7)  return '#dc2626';
  if (daysLeft <= 15) return '#d97706';
  return '#2563eb';
};

const urgencyLabel = (daysLeft: number) => {
  if (daysLeft <= 7)  return 'VENCIMIENTO CRÍTICO';
  if (daysLeft <= 15) return 'VENCIMIENTO PRÓXIMO';
  return 'AVISO DE VENCIMIENTO';
};

export const contractExpiresSoonEmail = (params: ContractExpiresSoonParams) => {
  const color = urgencyColor(params.daysLeft);
  const contractTypeLabel = CONTRACT_TYPE_LABELS[params.contractType] ?? params.contractType;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alerta de vencimiento de contrato</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">

  ${header('Sistema de Gestión de Talento Humano')}

  <div style="background-color: ${color}; padding: 12px 40px;">
    <p style="margin: 0; color: #ffffff; font-size: 13px; font-weight: 600; letter-spacing: 0.5px;">
      ⚠ ${urgencyLabel(params.daysLeft)}
    </p>
  </div>

  <div style="padding: 32px 40px;">

    <p style="font-size: 15px; color: #1f2937; margin: 0 0 6px 0; line-height: 1.5;">
      Estimado/a administrador/a,
    </p>

    <p style="font-size: 14px; color: #4b5563; margin: 0 0 24px 0; line-height: 1.6;">
      Le informamos que el contrato laboral del empleado
      <strong>${params.employeeName}</strong> vence en
      <strong style="color: ${color};">${params.daysLeft} día${params.daysLeft !== 1 ? 's' : ''}</strong>.
      Se requiere gestión oportuna para evitar interrupciones en el vínculo laboral.
    </p>

    <table style="width: 100%; border-collapse: collapse; margin: 0 0 28px 0; border: 1px solid #e5e7eb;">
      <thead>
        <tr style="background-color: #f9fafb; border-bottom: 2px solid #6b21a8;">
          <th colspan="2" style="padding: 12px 20px; text-align: left; color: #6b21a8; font-size: 13px; font-weight: 600; letter-spacing: 0.5px;">
            INFORMACIÓN DEL CONTRATO
          </th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 20px; color: #6b7280; font-size: 14px; width: 40%;">Empleado</td>
          <td style="padding: 12px 20px; color: #1f2937; font-size: 14px; font-weight: 500;">${params.employeeName}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 20px; color: #6b7280; font-size: 14px;">Correo del empleado</td>
          <td style="padding: 12px 20px; color: #1f2937; font-size: 14px;">${params.employeeEmail}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 20px; color: #6b7280; font-size: 14px;">Tipo de contrato</td>
          <td style="padding: 12px 20px; color: #1f2937; font-size: 14px; font-weight: 500;">${contractTypeLabel}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 20px; color: #6b7280; font-size: 14px;">Fecha de inicio</td>
          <td style="padding: 12px 20px; color: #1f2937; font-size: 14px;">${formatDate(params.startDate)}</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px 20px; color: #6b7280; font-size: 14px;">Fecha de vencimiento</td>
          <td style="padding: 12px 20px; color: ${color}; font-size: 14px; font-weight: 600;">${formatDate(params.endDate)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 20px; color: #6b7280; font-size: 14px;">Días restantes</td>
          <td style="padding: 12px 20px; font-size: 14px; font-weight: 700; color: ${color};">${params.daysLeft} día${params.daysLeft !== 1 ? 's' : ''}</td>
        </tr>
      </tbody>
    </table>

    ${params.contractDescription ? `
    <div style="background-color: #fafafa; border: 1px solid #e5e7eb; padding: 16px 20px; margin: 0 0 24px 0;">
      <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px;">Condiciones del contrato</p>
      <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">${params.contractDescription}</p>
    </div>
    ` : ''}

    <div style="border-left: 3px solid ${color}; padding: 14px 18px; background-color: #fafafa; margin: 0 0 24px 0;">
      <p style="margin: 0; font-size: 13px; color: #374151; line-height: 1.5;">
        <strong>Acción requerida:</strong> Ingrese al sistema de gestión de talento humano para renovar, finalizar o gestionar el contrato antes de su fecha de vencimiento.
      </p>
    </div>

  </div>

  ${footer()}

</body>
</html>
`;
};
