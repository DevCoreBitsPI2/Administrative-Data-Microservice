export const EMAIL = {
  CONTRACT_EXPIRES_SOON: "CONTRACT_EXPIRES_SOON", 
} as const;

export interface ContractExpiresSoonParams{
  adminEmail: string;
  employeeEmail: string;
  employeeName: string;
  startDate: Date;
  endDate: Date;
  daysLeft: number;
  contractType: string;
  contractDescription: string;
}

interface ContractExpiresSoonTypeParams{
  type : typeof EMAIL.CONTRACT_EXPIRES_SOON;
  params: ContractExpiresSoonParams
}



export type SendEmailParams =
| ContractExpiresSoonTypeParams;