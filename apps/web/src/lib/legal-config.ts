export const legalConfig = {
  operatorName: process.env.LEGAL_OPERATOR_NAME?.trim() || 'Не указано',
  operatorAddress: process.env.LEGAL_OPERATOR_ADDRESS?.trim() || 'Не указано',
  privacyEmail: process.env.LEGAL_PRIVACY_EMAIL?.trim() || 'Не указано',
};

export const legalDetailsReady = Object.values(legalConfig).every(
  (value) => value !== 'Не указано' && !value.startsWith('replace-with-'),
);
