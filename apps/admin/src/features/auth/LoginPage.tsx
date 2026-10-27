import type { components } from '@remora/api-client';
import { Button, Card, FishMark, Input } from '@remora/ui/base';
import { useState, type FormEvent } from 'react';
import { api, getErrorMessage } from '../../lib/api';
import { useAuth } from './AuthContext';

type LoginStep = components['schemas']['AdminLoginStep'];
type Setup = components['schemas']['AdminSetupResponse'];

export function LoginPage() {
  const { authenticate } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<LoginStep | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pendingSession, setPendingSession] = useState<
    components['schemas']['AdminSessionResponse'] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await api.POST('/api/v1/admin/auth/login', {
        body: { email, password },
      });
      if (!result.data) {
        setError(getErrorMessage(result.error, 'Не удалось войти. Проверьте данные.'));
        return;
      }
      if ('access_token' in result.data) {
        authenticate(result.data.user, result.data.access_token);
        return;
      }
      setStep(result.data);
      if (result.data.step === 'setup_required') {
        const setupResult = await api.POST('/api/v1/admin/auth/2fa/setup', {
          body: { token: result.data.token },
        });
        if (!setupResult.data) {
          setError(getErrorMessage(setupResult.error, 'Не удалось начать настройку 2FA.'));
          setStep(null);
          return;
        }
        setSetup(setupResult.data);
      }
    } catch {
      setError('Сервер недоступен. Повторите попытку позже.');
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!step) return;
    setError(null);
    setLoading(true);
    try {
      const path =
        step.step === 'setup_required'
          ? '/api/v1/admin/auth/2fa/enable'
          : '/api/v1/admin/auth/2fa/verify';
      const result = await api.POST(path, { body: { token: step.token, code } });
      if (!result.data) {
        setError(getErrorMessage(result.error, 'Код не подошёл. Проверьте его и повторите.'));
        return;
      }
      const codes = result.data.recovery_codes ?? [];
      if (codes.length > 0) {
        setRecoveryCodes(codes);
        setPendingSession(result.data);
        setStep(null);
        setSetup(null);
        setCode('');
        return;
      }
      authenticate(result.data.user, result.data.access_token);
    } catch {
      setError('Сервер недоступен. Повторите попытку позже.');
    } finally {
      setLoading(false);
    }
  }

  function finishSetup() {
    if (!pendingSession) {
      setRecoveryCodes([]);
      setError('Сеанс настройки истёк. Войдите ещё раз.');
      return;
    }
    authenticate(pendingSession.user, pendingSession.access_token);
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <Brand />
        {recoveryCodes.length > 0 ? (
          <RecoveryCodes codes={recoveryCodes} onContinue={finishSetup} />
        ) : step ? (
          <SecondFactor
            step={step}
            setup={setup}
            code={code}
            error={error}
            loading={loading}
            onCodeChange={setCode}
            onSubmit={submitCode}
            onBack={() => {
              setStep(null);
              setSetup(null);
              setCode('');
              setError(null);
            }}
          />
        ) : (
          <Credentials
            email={email}
            password={password}
            error={error}
            loading={loading}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={submitCredentials}
          />
        )}
      </Card>
    </main>
  );
}

function Brand() {
  return (
    <div className="mb-8 flex items-center gap-3">
      <FishMark className="h-12 w-12" />
      <div>
        <p className="text-xl font-semibold">Запоминальня</p>
        <p className="text-fg-muted text-sm">Администрирование</p>
      </div>
    </div>
  );
}

function Credentials(props: {
  email: string;
  password: string;
  error: string | null;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Вход для администратора</h1>
      <p className="text-fg-muted mt-2 text-sm">Используйте отдельную учётную запись администратора.</p>
      <form className="mt-7 space-y-5" onSubmit={props.onSubmit}>
        <Input
          label="Электронная почта"
          type="email"
          autoComplete="username"
          required
          value={props.email}
          onChange={(event) => props.onEmailChange(event.target.value)}
        />
        <Input
          label="Пароль"
          type="password"
          autoComplete="current-password"
          required
          value={props.password}
          onChange={(event) => props.onPasswordChange(event.target.value)}
        />
        <ErrorMessage message={props.error} />
        <Button type="submit" fullWidth loading={props.loading} className="min-h-11">
          Войти
        </Button>
      </form>
    </>
  );
}

function SecondFactor(props: {
  step: LoginStep;
  setup: Setup | null;
  code: string;
  error: string | null;
  loading: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  const firstSetup = props.step.step === 'setup_required';
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {firstSetup ? 'Настройка двухфакторного входа' : 'Код подтверждения'}
      </h1>
      <p className="text-fg-muted mt-2 text-sm">
        {firstSetup
          ? 'Добавьте ключ в приложение-аутентификатор и введите полученный код.'
          : 'Введите код из приложения-аутентификатора или одноразовый код восстановления.'}
      </p>
      {firstSetup && props.setup && (
        <div className="border-border bg-surface-muted mt-6 rounded-lg border p-4">
          <p className="text-fg-muted text-xs font-medium uppercase tracking-wide">
            Секретный ключ
          </p>
          <code className="mt-2 block break-all font-mono text-sm font-semibold">
            {props.setup.secret}
          </code>
          <a
            href={props.setup.provisioning_uri}
            className="text-primary mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
          >
            Открыть в аутентификаторе
          </a>
        </div>
      )}
      <form className="mt-6 space-y-5" onSubmit={props.onSubmit}>
        <Input
          label={firstSetup ? 'Код из приложения' : 'Код подтверждения'}
          inputMode="text"
          autoComplete="one-time-code"
          required
          minLength={6}
          value={props.code}
          onChange={(event) => props.onCodeChange(event.target.value)}
        />
        <ErrorMessage message={props.error} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" fullWidth onClick={props.onBack}>
            Назад
          </Button>
          <Button type="submit" fullWidth loading={props.loading}>
            Подтвердить
          </Button>
        </div>
      </form>
    </>
  );
}

function RecoveryCodes({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  return (
    <section aria-labelledby="recovery-title">
      <h1 id="recovery-title" className="text-2xl font-semibold tracking-tight">
        Сохраните коды восстановления
      </h1>
      <p className="text-fg-muted mt-2 text-sm">
        Каждый код работает один раз. Храните их отдельно от устройства с аутентификатором.
      </p>
      <ul className="border-border bg-surface-muted mt-6 grid grid-cols-1 gap-2 rounded-lg border p-4 font-mono text-sm sm:grid-cols-2">
        {codes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Button type="button" fullWidth className="mt-6" onClick={onContinue}>
        Я сохранил коды
      </Button>
    </section>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <p
      className="border-danger/30 bg-danger-subtle text-danger rounded-md border p-3 text-sm"
      role="alert"
    >
      {message}
    </p>
  ) : null;
}
