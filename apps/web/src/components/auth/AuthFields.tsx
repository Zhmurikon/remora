'use client';

import { Input } from '@remora/ui';
import { useState, type InputHTMLAttributes } from 'react';
import { EyeIcon } from './Icons';

export function PasswordField({
  label = 'Пароль',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        label={label}
        type={visible ? 'text' : 'password'}
        {...props}
        className="h-12 rounded-xl pr-12"
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="text-fg-subtle hover:text-fg absolute right-1 top-[29px] grid h-11 w-11 place-items-center rounded-xl transition-colors"
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        <EyeIcon crossed={visible} className="h-5 w-5" />
      </button>
    </div>
  );
}

export function SocialButtons() {
  return (
    <div className="grid grid-cols-3 gap-3" aria-label="Социальные сети">
      <SocialButton label="VK ID" mark="VK" />
      <SocialButton label="Яндекс ID" mark="Я" />
      <SocialButton label="Telegram" mark="✈" />
    </div>
  );
}

function SocialButton({ label, mark }: { label: string; mark: string }) {
  return (
    <button
      type="button"
      disabled
      title={`${label} — скоро`}
      className="border-border bg-surface-muted/45 text-fg-muted group relative flex h-12 items-center justify-center rounded-xl border text-sm font-semibold disabled:cursor-not-allowed"
      aria-label={`${label} — скоро`}
    >
      <span>{mark}</span>
      <span className="border-border bg-surface text-fg-subtle absolute -right-1 -top-2 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide">
        скоро
      </span>
    </button>
  );
}

export function FormDivider() {
  return (
    <div className="text-fg-subtle flex items-center gap-4 text-xs uppercase tracking-[0.16em]">
      <span className="bg-border h-px flex-1" />
      или
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

export function FormError({ children }: { children: string }) {
  return (
    <div
      role="alert"
      className="border-danger/20 bg-danger-subtle text-danger rounded-xl border px-4 py-3 text-sm"
    >
      {children}
    </div>
  );
}
