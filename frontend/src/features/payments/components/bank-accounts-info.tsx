import { useTranslation } from 'react-i18next';

export interface BankAccountInfo {
  idBankAccount: number;
  bankName: string;
  accountType: string;
  accountNumber: string;
  holderName: string;
  instructions?: string | null | undefined;
}

/**
 * Las cuentas donde se puede depositar, como texto y una por bloque. Son información para quien paga: no se eligen, porque
 * se puede depositar en cualquiera de ellas.
 */
export function BankAccountsInfo({ accounts }: Readonly<{ accounts: readonly BankAccountInfo[] }>) {
  const { t } = useTranslation();
  if (accounts.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-stone-800">{t('payment.accounts.title')}</h3>
      <p className="text-sm text-stone-600">{t('payment.accounts.hint')}</p>
      <ul className="divide-y divide-stone-200 rounded-card border border-stone-200 bg-white">
        {accounts.map((account) => (
          <li key={account.idBankAccount} className="space-y-0.5 p-4 text-sm text-stone-800">
            <p className="font-medium text-stone-900">{account.bankName}</p>
            <p className="select-all">
              {t(`checkout.payment.accountType.${account.accountType}`)} · {account.accountNumber}
            </p>
            <p className="text-stone-600">
              {t('payment.accounts.holder', { holder: account.holderName })}
            </p>
            {account.instructions ? <p className="text-stone-600">{account.instructions}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
